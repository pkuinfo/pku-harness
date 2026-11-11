package org.pkuinfo.harness.phone.core

import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Harness-owned control state machine. Actions are serialized and are never retried implicitly. */
class PhoneEngine(private val device: DevicePort, private val policy: ActionPolicy, private val ownPackage: String) {
    private val mutex = Mutex()
    @Volatile private var current: Session? = null

    private class Session(val id: String, @Volatile var packages: Set<String>, val device: DeviceSession) {
        val stopped = AtomicBoolean(false)
        val stop = CompletableDeferred<Unit>()
        @Volatile var handedOver = false
        @Volatile var pauseGate: CompletableDeferred<Unit>? = null
        var observed: Pair<DeviceFrame, PhoneObservation>? = null
        /** The latest screenshot given to the model: point actions must name its snapshot. */
        var shot: Shot? = null
        var sequence = 0L
    }

    /** A screenshot's snapshot and pixel size (the coordinate space of point actions). */
    private class Shot(val snapshotId: String, val width: Int, val height: Int)

    fun state(): PhoneSessionState? = current?.takeUnless { it.stopped.get() }?.let {
        PhoneSessionState(it.id, it.packages.toSet(), it.handedOver, it.pauseGate != null)
    }

    suspend fun begin(packages: Set<String>): PhoneSessionState = mutex.withLock {
        if (current != null) fail(PhoneFailure.BUSY, "A phone session is already active")
        if (packages.isEmpty() || packages.size > MAX_APPS || ownPackage in packages || packages.any { !PACKAGE.matches(it) }) {
            fail(PhoneFailure.INVALID, "Choose between 1 and 20 installed apps other than Harness")
        }
        val allowed = packages.toSet()
        val opened = device.open(allowed)
        try {
            if (opened.isLocked()) fail(PhoneFailure.LOCKED, "Unlock the phone before starting")
            currentCoroutineContext().ensureActive()
            val session = Session(UUID.randomUUID().toString(), allowed, opened)
            current = session
            PhoneSessionState(session.id, allowed, false)
        } catch (error: Throwable) {
            withContext(NonCancellable) { runCatching { opened.close() } }
            throw error
        }
    }

    /**
     * Add one app the user just granted to a running session. Everything else (display, handoff,
     * observations) is kept; only an explicit user grant in the host may call this.
     */
    suspend fun allow(id: String, packageName: String): PhoneSessionState = mutex.withLock {
        val session = active(id)
        if (!PACKAGE.matches(packageName) || packageName == ownPackage) fail(PhoneFailure.INVALID, "Choose an installed app other than Harness")
        if (packageName !in session.packages) {
            if (session.packages.size >= MAX_APPS) fail(PhoneFailure.INVALID, "A session can use up to $MAX_APPS apps")
            session.device.allow(packageName)
            live(session)
            session.packages = session.packages + packageName
        }
        PhoneSessionState(session.id, session.packages, session.handedOver, session.pauseGate != null)
    }

    fun pause(id: String, paused: Boolean) {
        val session = active(id)
        synchronized(session) {
            if (paused && session.pauseGate == null) session.pauseGate = CompletableDeferred()
            if (!paused) { session.pauseGate?.complete(Unit); session.pauseGate = null }
        }
    }

    private suspend fun awaitRunning(id: String) {
        val session = active(id)
        while (true) {
            val gate = session.pauseGate ?: return
            select<Unit> { gate.onAwait { }; session.stop.onAwait { } }
            live(session)
        }
    }

    suspend fun observe(id: String): PhoneObservation {
        awaitRunning(id)
        return mutex.withLock { publish(active(id)) }
    }

    /**
     * Copilot's opt-in vision fallback: observe and capture the controlled display for the model.
     * Same rules as [preview] (only the session's apps on the display, never while locked or
     * handed over) but strict: a protected (FLAG_SECURE) or user-attention screen is refused, not
     * captured, and a capture during which the windows changed is discarded.
     */
    suspend fun look(id: String): PhoneLook {
        awaitRunning(id)
        return mutex.withLock {
            val session = active(id)
            session.shot = null
            val observation = publish(session)
            val frame = checkNotNull(session.observed).first
            if (frame.protected) fail(PhoneFailure.HANDOFF, "This protected screen requires the user; it is never captured")
            if (frame.needsUser) fail(PhoneFailure.HANDOFF, "The app needs attention on the user's screen")
            val image = session.device.lookImage() ?: fail(PhoneFailure.INVALID, "No screen image is available yet; wait, then look again")
            val after = checkedFrame(session)
            if (after.protected || after.needsUser || after.packageName != frame.packageName || after.windowPackages != frame.windowPackages) {
                session.observed = null
                fail(PhoneFailure.STALE, "The screen changed while it was captured; look again")
            }
            if (image.width <= 0 || image.height <= 0) fail(PhoneFailure.INVALID, "The screen image is empty; look again")
            session.shot = Shot(observation.snapshotId, image.width, image.height)
            PhoneLook(observation, image)
        }
    }

    /** The approval for a point action, judged on the current screen (see [ActionPolicy.assessPoint]). */
    suspend fun assessPoint(id: String, snapshotId: String, x: Int, y: Int): PhoneAssessment = mutex.withLock {
        val session = active(id)
        val (frame, at) = freshPoint(session, snapshotId, x, y)
        pointAssessment(frame, snapshotId, x, y, at)
    }

    suspend fun assess(id: String, snapshotId: String, ref: String, submit: Boolean = false): PhoneAssessment = mutex.withLock {
        val session = active(id)
        val (frame, observation, inPlace) = fresh(session, snapshotId, ref)
        val reviewed = target(observation, ref)
        // A field's text is what Submit sends: a changed one needs a new observation.
        if (submit && inPlace != null) fail(PhoneFailure.STALE, STALE_TARGET)
        val target = inPlace ?: reviewed
        validateTarget(target)
        if (submit && !target.editable) fail(PhoneFailure.INVALID, "Choose an editable field")
        // Judged on the element as it is now; labelled as the model saw it, so execute can match it.
        PhoneAssessment(if (submit) policy.submit(frame, target) else policy.assess(frame, target), label(reviewed), frame.packageName, snapshotId, ref, submit)
    }

    suspend fun execute(
        id: String,
        action: PhoneAction,
        snapshotId: String? = null,
        ref: String? = null,
        approved: PhoneAssessment? = null,
    ): PhoneExecution {
        while (true) {
            awaitRunning(id)
            val result = mutex.withLock {
                val session = active(id)
                if (session.pauseGate != null) return@withLock null
                var element: DeviceElement? = null
                var dispatch: PhoneAction = action
                if (action is PhoneAction.Point) {
                    if (ref != null) fail(PhoneFailure.INVALID, "A point action takes coordinates, not an element")
                    if (action is PhoneAction.TypeAt && action.text.length > 10_000) fail(PhoneFailure.INVALID, "Text exceeds the input limit")
                    val (frame, at) = freshPoint(session, snapshotId, action.x, action.y)
                    val assessment = pointAssessment(frame, snapshotId!!, action.x, action.y, at)
                    if (assessment.effect == PhoneEffect.MONEY) fail(PhoneFailure.HANDOFF, "Hand payment or purchase confirmation to the user")
                    if (approved != assessment) fail(PhoneFailure.STALE, "The approved action no longer matches the screenshot")
                    dispatch = action.at(at.first, at.second)
                } else if (action is PhoneAction.Launch) {
                    if (action.packageName !in session.packages) fail(PhoneFailure.APP_SCOPE, "This app was not selected")
                    if (session.handedOver) fail(PhoneFailure.HANDOFF, "The user has control")
                    if (session.device.isLocked()) fail(PhoneFailure.LOCKED, "Unlock the phone to continue")
                } else {
                    // A whole-screen scroll or back acts on whatever is showing (still in scope, not
                    // protected), so an older snapshot from an action batched before it is no reason
                    // to fail. Element actions keep the strict check.
                    val untargeted = ref == null && (action is PhoneAction.Scroll || action == PhoneAction.Back)
                    val checked = if (untargeted) null else fresh(session, snapshotId, ref)
                    val frame = checked?.frame ?: current(session).first
                    val observation = checked?.observation
                    // Found only by position (its text changed in place): act on, and judge, the
                    // element as it is now, dispatched by its key in the latest read.
                    val inPlace = checked?.inPlace
                    if (ref != null) element = (inPlace ?: target(observation!!, ref)).also(::validateTarget)
                    when (action) {
                        PhoneAction.Tap, PhoneAction.Submit -> {
                            val hit = element ?: fail(PhoneFailure.INVALID, "A target is required")
                            val submit = action == PhoneAction.Submit
                            // A field's text is what Submit sends: a changed one needs a new observation.
                            if (submit && inPlace != null) fail(PhoneFailure.STALE, STALE_TARGET)
                            if (submit && !hit.editable) fail(PhoneFailure.INVALID, "Choose an editable field")
                            // Effect from the current element; label as reviewed, so an in-place text
                            // change still matches the approval but any change of effect does not.
                            val assessment = PhoneAssessment(if (submit) policy.submit(frame, hit) else policy.assess(frame, hit), label(target(observation!!, ref!!)), frame.packageName, observation.snapshotId, ref, submit)
                            if (assessment.effect == PhoneEffect.MONEY) fail(PhoneFailure.HANDOFF, "Hand payment or purchase confirmation to the user")
                            if (approved != assessment) fail(PhoneFailure.STALE, "The approved action no longer matches the target; assess it again on the current screen")
                        }
                        is PhoneAction.SetProgress -> {
                            val hit = element ?: fail(PhoneFailure.INVALID, "A slider is required")
                            val minimum = hit.rangeMin ?: fail(PhoneFailure.INVALID, "This target is not a slider")
                            val maximum = hit.rangeMax ?: fail(PhoneFailure.INVALID, "This target is not a slider")
                            if (!action.value.isFinite() || action.value < minimum || action.value > maximum)
                                fail(PhoneFailure.INVALID, "Choose a value within the observed slider range")
                            if (policy.assess(frame, hit) != PhoneEffect.WRITE) fail(PhoneFailure.HANDOFF, "This slider needs user control")
                        }
                        is PhoneAction.Type -> {
                            if (element?.editable != true || action.text.length > 10_000) fail(PhoneFailure.INVALID, "Choose an editable field and text within the input limit")
                        }
                        is PhoneAction.Scroll -> if (element != null && !element.scrollable) fail(PhoneFailure.INVALID, "This target is not scrollable")
                        else -> Unit
                    }
                }
                // A pause arriving during the freshness read must not dispatch with the earlier
                // observation. Release the mutex while waiting so takeover and stop still work.
                // Once dispatch begins, that one operation may finish; subsequent work waits.
                if (session.pauseGate != null) return@withLock null
                live(session)
                session.observed = null
                session.shot = null
                val outcome = session.device.perform(dispatch, element)
                live(session)
                PhoneExecution(outcome, publish(session))
            }
            if (result != null) return result
        }
    }

    /** Hardware brightness belongs to the user's display, not the app's virtual display. */
    suspend fun readBrightness(id: String): DeviceBrightness = brightnessOperation(id) { it.readBrightness() }

    suspend fun setBrightness(id: String, percent: Float, adaptive: Boolean?): DeviceBrightnessChange {
        if (!percent.isFinite() || percent !in 0f..100f) fail(PhoneFailure.INVALID, "Brightness must be between 0 and 100 percent")
        return brightnessOperation(id, invalidate = true) { it.setBrightness(percent, adaptive) }
    }

    private suspend fun <T : Any> brightnessOperation(id: String, invalidate: Boolean = false, operation: suspend (DeviceSession) -> T): T {
        while (true) {
            awaitRunning(id)
            val result = mutex.withLock {
                val session = active(id)
                if (session.pauseGate != null) return@withLock null
                val settings = session.device.settingsPackage
                if (settings == null || settings !in session.packages) fail(PhoneFailure.APP_SCOPE, "Select Android Settings before controlling device brightness")
                if (session.handedOver) fail(PhoneFailure.HANDOFF, "The user has control")
                if (session.device.isLocked()) fail(PhoneFailure.LOCKED, "Unlock the phone to control brightness")
                if (session.pauseGate != null) return@withLock null
                live(session)
                currentCoroutineContext().ensureActive()
                // Any Settings UI may change after a hardware setting. Require a fresh read
                // before subsequent element actions, without reading unrelated main-screen apps.
                if (invalidate) session.observed = null
                val value = operation(session.device)
                live(session)
                value
            }
            if (result != null) return result
        }
    }

    suspend fun waitForChange(id: String, timeoutMs: Long): PhoneObservation {
        val session = mutex.withLock { active(id).also { checkedFrame(it) } }
        // Not under the lock: the floating preview keeps updating while the agent waits.
        coroutineScope {
            val waiting = async { session.device.awaitChange(timeoutMs.coerceIn(0, 10_000)) }
            try { select<Unit> { waiting.onAwait { }; session.stop.onAwait { } } }
            finally { waiting.cancel() }
        }
        return mutex.withLock { publish(active(id)) }
    }

    suspend fun preview(id: String): DevicePreview? = mutex.withLock {
        val session = active(id)
        if (session.handedOver || session.device.isLocked()) return@withLock null
        val before = checkedFrame(session)
        if (before.protected) return@withLock null
        val image = session.device.preview()
        val after = checkedFrame(session)
        // Live screens (timers, clocks) change while the frame is captured; that's fine to show. A
        // protected screen or another app appearing meanwhile is not.
        image.takeIf { !after.protected && after.packageName == before.packageName && after.windowPackages == before.windowPackages }
    }

    suspend fun handoff(id: String) = mutex.withLock {
        val session = active(id)
        if (!session.handedOver) {
            session.observed = null
            session.device.handoff()
            session.handedOver = true
        }
    }

    suspend fun resume(id: String) = mutex.withLock {
        val session = active(id)
        if (session.device.isLocked()) fail(PhoneFailure.LOCKED, "Unlock the phone to resume")
        if (session.handedOver) {
            session.device.resume()
            session.handedOver = false
            session.observed = null
        }
    }

    /** Invalidate immediately, even while an operation owns the mutex. */
    fun requestStop(id: String) {
        current?.takeIf { it.id == id }?.let { it.stopped.set(true); it.stop.complete(Unit) }
    }

    suspend fun end(id: String) {
        requestStop(id)
        withContext(NonCancellable) {
            mutex.withLock {
                val session = current?.takeIf { it.id == id } ?: return@withLock
                try { session.device.close() }
                finally { if (current === session) current = null }
            }
        }
    }

    private suspend fun checkedFrame(session: Session): DeviceFrame {
        live(session)
        if (session.handedOver) fail(PhoneFailure.HANDOFF, "The user has control")
        if (session.device.isLocked()) fail(PhoneFailure.LOCKED, "Unlock the phone to continue")
        val frame = session.device.read()
        live(session)
        if (session.device.isLocked()) fail(PhoneFailure.LOCKED, "Unlock the phone to continue")
        if (frame.windowPackages.any { it == null || it !in session.packages } || frame.packageName?.let { it !in session.packages } == true) {
            session.observed = null
            fail(PhoneFailure.APP_SCOPE, "An app outside this session needs the user's attention")
        }
        return frame.copy(elements = frame.elements.map { if (it.secret) it.copy(text = "") else it })
    }

    private suspend fun publish(session: Session): PhoneObservation {
        val frame = checkedFrame(session)
        val observation = PhoneObservation(session.id, "${session.id}:${++session.sequence}", frame.packageName,
            frame.width, frame.height, frame.protected, frame.unstable,
            if (frame.protected || frame.needsUser) emptyList() else frame.elements.mapIndexed { index, element -> PhoneTarget("e${index + 1}", element) }, frame.needsUser)
        session.observed = frame to observation
        return observation
    }

    /**
     * A point action's screen check: the point comes from the latest screenshot (same snapshot,
     * inside its pixels) and the screen is structurally the one captured. Returns the current
     * frame and the point in display pixels.
     */
    private suspend fun freshPoint(session: Session, snapshotId: String?, x: Int, y: Int): Pair<DeviceFrame, Pair<Int, Int>> {
        val shot = session.shot?.takeIf { it.snapshotId == snapshotId && snapshotId != null }
            ?: fail(PhoneFailure.STALE, "Look again; coordinates must come from the latest screenshot")
        if (x !in 0 until shot.width || y !in 0 until shot.height) fail(PhoneFailure.INVALID, "The point is outside the ${shot.width}x${shot.height} screenshot")
        val (frame, _) = fresh(session, snapshotId, point = true)
        val px = ((x + 0.5) * frame.width / shot.width).toInt().coerceIn(0, maxOf(0, frame.width - 1))
        val py = ((y + 0.5) * frame.height / shot.height).toInt().coerceIn(0, maxOf(0, frame.height - 1))
        if (elementAt(frame, px, py)?.secret == true) fail(PhoneFailure.HANDOFF, "The user must enter passwords")
        return frame to (px to py)
    }

    private fun pointAssessment(frame: DeviceFrame, snapshotId: String, x: Int, y: Int, at: Pair<Int, Int>) =
        PhoneAssessment(policy.assessPoint(frame, at.first, at.second), "($x, $y)", frame.packageName, snapshotId, "point:$x,$y")

    /** The screen as it is now, for actions that don't depend on an observed element. */
    private suspend fun current(session: Session): Pair<DeviceFrame, PhoneObservation?> {
        val actual = checkedFrame(session)
        if (actual.protected) fail(PhoneFailure.HANDOFF, "This protected screen requires the user")
        if (actual.needsUser) fail(PhoneFailure.HANDOFF, "The app needs attention on the user's screen")
        return actual to null
    }

    /**
     * A fresh screen check's result: the current frame, the observation the model acted on, and,
     * when the target was found only by position (same control in place, its text changed),
     * [inPlace], the element as it is now. Every check then judges and dispatches that current
     * element, never the reviewed text.
     */
    private data class Fresh(val frame: DeviceFrame, val observation: PhoneObservation, val inPlace: DeviceElement? = null)

    private suspend fun fresh(session: Session, snapshotId: String?, ref: String? = null, point: Boolean = false): Fresh {
        val saved = session.observed ?: fail(PhoneFailure.STALE, "Observe before acting")
        if (saved.second.snapshotId != snapshotId) fail(PhoneFailure.STALE, "Observe again; the screen reference expired")
        val actual = checkedFrame(session)
        if (actual.protected) fail(PhoneFailure.HANDOFF, "This protected screen requires the user")
        if (actual.needsUser) fail(PhoneFailure.HANDOFF, "The app needs attention on the user's screen")
        val targetIndex = ref?.let { r -> saved.second.targets.indexOfFirst { it.ref == r }.takeIf { it >= 0 } }
        // A point has no element to pin, so the whole structure must match; text may still tick.
        val same = actual == saved.first || if (point) sameStructure(saved.first, actual) else sameForTarget(saved.first, actual, targetIndex) || targetStillThere(saved.first, actual, targetIndex)
        val inPlace = if (same || point) null else sameControlInPlace(saved.first, actual, targetIndex)
        if (!same && inPlace == null || actual.unstable && targetIndex == null && !point) {
            session.observed = null
            fail(PhoneFailure.STALE, STALE_TARGET)
        }
        // The current frame, so the action's risk is judged on what the screen says now.
        return Fresh(actual, saved.second, inPlace)
    }

    /**
     * The reviewed control is still there but its own text changed in place (a search box whose
     * hint rotates, a countdown on a button, a ticking price): in the same app and windows, exactly
     * one element has the target's role, id and state and sits where it was (bounds overlap ≥ 80%
     * IoU), the old text no longer exists anywhere (otherwise the target moved, and a different
     * element took its slot), and nothing tappable newly covers it. Returns that current element;
     * the caller must re-judge the action on it, since its text is not what was reviewed.
     */
    private fun sameControlInPlace(saved: DeviceFrame, actual: DeviceFrame, targetIndex: Int?): DeviceElement? {
        if (targetIndex == null) return null
        if (actual.packageName != saved.packageName || actual.windowPackages != saved.windowPackages || actual.protected || actual.needsUser) return null
        val before = saved.elements.getOrNull(targetIndex) ?: return null
        if (before.bounds.size < 4) return null
        if (actual.elements.any { identity(it) == identity(before) }) return null
        val now = actual.elements.filter { control(it) == control(before) && overlap(it.bounds, before.bounds) >= IN_PLACE_IOU }.singleOrNull() ?: return null
        val coveredBefore = saved.elements.filter { it !== before && covers(it, before) }.map(::identity).toSet()
        return now.takeIf { actual.elements.none { it !== now && covers(it, now) && identity(it) !in coveredBefore } }
    }

    /** An element's kind and state without its text, place or read-order key. */
    private fun control(e: DeviceElement) = e.copy(key = "", text = "", bounds = emptyList(), rangeCurrent = null)

    /** Intersection over union of two [l, t, r, b] rectangles (0 when either is malformed or empty). */
    private fun overlap(a: List<Int>, b: List<Int>): Double {
        if (a.size < 4 || b.size < 4) return 0.0
        val area = { r: List<Int> -> maxOf(0L, (r[2] - r[0]).toLong()) * maxOf(0L, (r[3] - r[1]).toLong()) }
        val w = minOf(a[2], b[2]) - maxOf(a[0], b[0])
        val h = minOf(a[3], b[3]) - maxOf(a[1], b[1])
        val inter = if (w > 0 && h > 0) w.toLong() * h else 0L
        val union = area(a) + area(b) - inter
        return if (union <= 0L) 0.0 else inter.toDouble() / union
    }

    /**
     * Acting on one target of a screen whose other text keeps changing (a running timer, a clock, a
     * progress counter): still the same screen when the windows and every element's identity,
     * position and state match, the target is exactly as observed, and only the other elements' text
     * or slider values moved. Anything that appeared, vanished or moved is a different screen.
     */
    private fun sameForTarget(saved: DeviceFrame, actual: DeviceFrame, targetIndex: Int?): Boolean {
        if (targetIndex == null) return false
        return sameStructure(saved, actual) && actual.elements[targetIndex] == saved.elements[targetIndex]
    }

    /**
     * A tap needs the element the user reviewed, not the screen it was on: pages that never hold
     * still (an auto-rotating banner, a countdown, a live feed) or that scrolled change on every
     * read. The tap goes through when, in the same app and windows, exactly one element still has
     * the target's role, text, id and state (wherever it is now; its index may shift too, and the
     * driver re-locates it by these features), and nothing tappable newly covers it. Refused when the
     * target is gone, ambiguous, or something like a Delete button slid on top of it.
     */
    private fun targetStillThere(saved: DeviceFrame, actual: DeviceFrame, targetIndex: Int?): Boolean {
        if (targetIndex == null) return false
        if (actual.packageName != saved.packageName || actual.windowPackages != saved.windowPackages || actual.protected || actual.needsUser) return false
        val before = saved.elements.getOrNull(targetIndex) ?: return false
        val now = actual.elements.filter { identity(it) == identity(before) }.singleOrNull() ?: return false
        val coveredBefore = saved.elements.filter { it !== before && covers(it, before) }.map(::identity).toSet()
        return actual.elements.none { it !== now && covers(it, now) && identity(it) !in coveredBefore }
    }

    /** An element as the user sees it, without where it sits or its place in the read order. */
    private fun identity(e: DeviceElement) = e.copy(key = "", bounds = emptyList(), rangeCurrent = null)

    /** A tappable element overlapping [target]: a tap there could reach it instead. */
    private fun covers(other: DeviceElement, target: DeviceElement): Boolean {
        if (!(other.clickable || other.editable) || other.bounds.size < 4 || target.bounds.size < 4) return false
        val (l, t, r, b) = other.bounds
        val (tl, tt, tr, tb) = target.bounds
        return l < tr && tl < r && t < tb && tt < b
    }

    /** Same windows and the same elements in the same places and states; only text and slider values may differ. */
    private fun sameStructure(saved: DeviceFrame, actual: DeviceFrame): Boolean {
        if (actual.elements.size != saved.elements.size) return false
        if (actual.copy(elements = emptyList(), unstable = false) != saved.copy(elements = emptyList(), unstable = false)) return false
        return actual.elements.indices.all { i -> actual.elements[i].copy(text = "", rangeCurrent = null) == saved.elements[i].copy(text = "", rangeCurrent = null) }
    }

    private fun active(id: String): Session = current?.takeIf { it.id == id }?.also(::live)
        ?: fail(PhoneFailure.ENDED, "The phone session has ended")
    private fun live(session: Session) { if (session.stopped.get()) fail(PhoneFailure.ENDED, "The phone session has ended") }
    private fun target(observation: PhoneObservation, ref: String): DeviceElement = observation.targets.find { it.ref == ref }?.element
        ?: fail(PhoneFailure.INVALID, "Unknown target")
    private fun validateTarget(element: DeviceElement) {
        if (element.secret) fail(PhoneFailure.HANDOFF, "The user must enter passwords")
        if (!element.enabled) fail(PhoneFailure.INVALID, "This target is disabled. It usually depends on a switch or option nearby (often above it, or the page's main switch): turn that on first. Do not retry it or scroll to it again.")
    }
    private fun label(element: DeviceElement) = element.text.ifBlank { element.resourceId ?: element.role.ifBlank { element.key } }
    private fun fail(code: PhoneFailure, message: String): Nothing = throw PhoneException(code, message)
    private companion object {
        val PACKAGE = Regex("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")
        const val MAX_APPS = 20
        /** Minimum IoU for a control whose text changed to count as the reviewed one in place. */
        const val IN_PLACE_IOU = 0.8
        const val STALE_TARGET = "The target changed or is gone; observe again and choose it from the new screen (this ref will not work again)"
    }
}
