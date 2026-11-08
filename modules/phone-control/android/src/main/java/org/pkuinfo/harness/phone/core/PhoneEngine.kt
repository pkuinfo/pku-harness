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

    private class Session(val id: String, val packages: Set<String>, val device: DeviceSession) {
        val stopped = AtomicBoolean(false)
        val stop = CompletableDeferred<Unit>()
        @Volatile var handedOver = false
        var observed: Pair<DeviceFrame, PhoneObservation>? = null
        var sequence = 0L
    }

    fun state(): PhoneSessionState? = current?.takeUnless { it.stopped.get() }?.let {
        PhoneSessionState(it.id, it.packages.toSet(), it.handedOver)
    }

    suspend fun begin(packages: Set<String>): PhoneSessionState = mutex.withLock {
        if (current != null) fail(PhoneFailure.BUSY, "A phone session is already active")
        if (packages.isEmpty() || packages.size > 20 || ownPackage in packages || packages.any { !PACKAGE.matches(it) }) {
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

    suspend fun observe(id: String): PhoneObservation = mutex.withLock { publish(active(id)) }

    suspend fun assess(id: String, snapshotId: String, ref: String): PhoneAssessment = mutex.withLock {
        val session = active(id)
        val (frame, observation) = fresh(session, snapshotId)
        val target = target(observation, ref)
        validateTarget(target)
        PhoneAssessment(policy.assess(frame, target), label(target), frame.packageName, snapshotId, ref)
    }

    suspend fun execute(
        id: String,
        action: PhoneAction,
        snapshotId: String? = null,
        ref: String? = null,
        approved: PhoneAssessment? = null,
    ): PhoneExecution = mutex.withLock {
        val session = active(id)
        var element: DeviceElement? = null
        if (action is PhoneAction.Launch) {
            if (action.packageName !in session.packages) fail(PhoneFailure.APP_SCOPE, "This app was not selected")
            checkedFrame(session)
        } else {
            val (frame, observation) = fresh(session, snapshotId)
            if (ref != null) element = target(observation, ref).also(::validateTarget)
            when (action) {
                PhoneAction.Tap -> {
                    val hit = element ?: fail(PhoneFailure.INVALID, "A target is required")
                    val assessment = PhoneAssessment(policy.assess(frame, hit), label(hit), frame.packageName, observation.snapshotId, ref!!)
                    if (assessment.effect == PhoneEffect.MONEY) fail(PhoneFailure.HANDOFF, "Hand payment or purchase confirmation to the user")
                    if (approved != assessment) fail(PhoneFailure.STALE, "The approved action no longer matches the observed target")
                }
                is PhoneAction.Type -> {
                    if (element?.editable != true || action.text.length > 10_000) fail(PhoneFailure.INVALID, "Choose an editable field and text within the input limit")
                }
                is PhoneAction.Scroll -> if (element != null && !element.scrollable) fail(PhoneFailure.INVALID, "This target is not scrollable")
                else -> Unit
            }
        }
        live(session)
        // Invalidate before dispatch: an exception may mean the action happened but its result was lost.
        session.observed = null
        val outcome = session.device.perform(action, element)
        live(session)
        PhoneExecution(outcome, publish(session))
    }

    suspend fun waitForChange(id: String, timeoutMs: Long): PhoneObservation = mutex.withLock {
        val session = active(id)
        checkedFrame(session)
        coroutineScope {
            val waiting = async { session.device.awaitChange(timeoutMs.coerceIn(0, 10_000)) }
            try { select<Unit> { waiting.onAwait { }; session.stop.onAwait { } } }
            finally { waiting.cancel() }
        }
        publish(session)
    }

    suspend fun preview(id: String): DevicePreview? = mutex.withLock {
        val session = active(id)
        if (session.handedOver || session.device.isLocked()) return@withLock null
        val before = checkedFrame(session)
        if (before.protected || before.unstable) return@withLock null
        val image = session.device.preview()
        val after = checkedFrame(session)
        image.takeIf { before == after }
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

    private suspend fun fresh(session: Session, snapshotId: String?): Pair<DeviceFrame, PhoneObservation> {
        val saved = session.observed ?: fail(PhoneFailure.STALE, "Observe before acting")
        if (saved.second.snapshotId != snapshotId) fail(PhoneFailure.STALE, "Observe again; the screen reference expired")
        val actual = checkedFrame(session)
        if (actual.protected) fail(PhoneFailure.HANDOFF, "This protected screen requires the user")
        if (actual.needsUser) fail(PhoneFailure.HANDOFF, "The app needs attention on the user's screen")
        if (actual.unstable || actual != saved.first) {
            session.observed = null
            fail(PhoneFailure.STALE, "The screen changed; observe again")
        }
        return saved
    }

    private fun active(id: String): Session = current?.takeIf { it.id == id }?.also(::live)
        ?: fail(PhoneFailure.ENDED, "The phone session has ended")
    private fun live(session: Session) { if (session.stopped.get()) fail(PhoneFailure.ENDED, "The phone session has ended") }
    private fun target(observation: PhoneObservation, ref: String): DeviceElement = observation.targets.find { it.ref == ref }?.element
        ?: fail(PhoneFailure.INVALID, "Unknown target")
    private fun validateTarget(element: DeviceElement) {
        if (element.secret) fail(PhoneFailure.HANDOFF, "The user must enter passwords")
        if (!element.enabled) fail(PhoneFailure.INVALID, "This target is disabled")
    }
    private fun label(element: DeviceElement) = element.text.ifBlank { element.resourceId ?: element.role.ifBlank { element.key } }
    private fun fail(code: PhoneFailure, message: String): Nothing = throw PhoneException(code, message)
    private companion object { val PACKAGE = Regex("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+") }
}
