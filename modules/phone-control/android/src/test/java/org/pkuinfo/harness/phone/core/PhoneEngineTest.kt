package org.pkuinfo.harness.phone.core

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield
import org.junit.Assert.*
import org.junit.Test

class PhoneEngineTest {
    private class FakeDevice : DevicePort, DeviceSession {
        var locked = false
        var closes = 0
        var calls = 0
        var brightnessReads = 0
        var brightnessWrites = 0
        var brightnessState = DeviceBrightness(0, 50f, 1f / 12f, 0f, 1f, false)
        override val settingsPackage = "com.android.settings"
        override suspend fun readBrightness(): DeviceBrightness { brightnessReads++; return brightnessState }
        override suspend fun setBrightness(percent: Float, adaptive: Boolean?): DeviceBrightnessChange {
            brightnessWrites++
            val before = brightnessState
            brightnessState = before.copy(percent = percent, linear = BrightnessScale.toLinear(percent, before.minimum, before.maximum), adaptive = adaptive ?: before.adaptive)
            return DeviceBrightnessChange(before, brightnessState, percent, true)
        }
        var effect = PhoneEffect.WRITE
        var failure: RuntimeException? = null
        var entered: CompletableDeferred<Unit>? = null
        var finish: CompletableDeferred<Unit>? = null
        var readEntered: CompletableDeferred<Unit>? = null
        var readFinish: CompletableDeferred<Unit>? = null
        var frame = DeviceFrame("org.example.notes", setOf("org.example.notes"), 100, 200,
            listOf(DeviceElement("node-1", "button", "Open", listOf(0, 0, 50, 50), clickable = true)), "window-1")
        val granted = mutableListOf<String>()
        override suspend fun open(allowedPackages: Set<String>) = this
        override suspend fun allow(packageName: String) { granted += packageName }
        override suspend fun isLocked() = locked
        override suspend fun read(): DeviceFrame { readEntered?.complete(Unit); readFinish?.await(); return frame }
        var performed: PhoneAction? = null
        var previews = 0
        var image: DevicePreview? = DevicePreview(byteArrayOf(1), "image/png", 100, 200)
        override suspend fun perform(action: PhoneAction, target: DeviceElement?): DeviceOutcome {
            calls++
            performed = action
            entered?.complete(Unit)
            finish?.await()
            failure?.let { throw it }
            return DeviceOutcome(true)
        }
        override suspend fun awaitChange(timeoutMs: Long) { entered?.complete(Unit); finish?.await() }
        override suspend fun preview(): DevicePreview? { previews++; return image }
        override suspend fun handoff() {}
        override suspend fun resume() {}
        override suspend fun close() { closes++ }
        fun engine() = PhoneEngine(this, ActionPolicy { _, _ -> effect }, "org.pkuinfo.harness")
    }

    private suspend fun expectFailure(code: PhoneFailure, block: suspend () -> Unit) {
        try { block(); fail("Expected $code") }
        catch (error: PhoneException) { assertEquals(code, error.code) }
    }

    @Test fun physicalBrightnessNeedsSettingsScopeAndDoesNotReadUserApps() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val denied = engine.begin(setOf("org.example.notes")).id
        expectFailure(PhoneFailure.APP_SCOPE) { engine.readBrightness(denied) }
        expectFailure(PhoneFailure.APP_SCOPE) { engine.setBrightness(denied, 70f, null) }
        assertEquals(0, device.brightnessReads)
        assertEquals(0, device.brightnessWrites)
        engine.end(denied)
        val id = engine.begin(setOf("com.android.settings")).id
        // UI scope is intentionally unrelated. Typed hardware control never observes it.
        device.readFinish = CompletableDeferred()
        val state = withTimeout(1_000) { engine.readBrightness(id) }
        assertEquals(50f, state.percent, 0.001f)
        val changed = engine.setBrightness(id, 70f, null)
        assertTrue(changed.verified)
        assertEquals(70f, changed.after.percent, 0.001f)
        assertFalse(changed.after.adaptive)
        assertEquals(1, device.brightnessWrites)
    }

    @Test fun invalidOrLockedBrightnessRequestsCannotMutateDevice() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("com.android.settings")).id
        for (value in listOf(-1f, 101f, Float.NaN, Float.POSITIVE_INFINITY)) {
            expectFailure(PhoneFailure.INVALID) { engine.setBrightness(id, value, false) }
        }
        device.locked = true
        expectFailure(PhoneFailure.LOCKED) { engine.readBrightness(id) }
        expectFailure(PhoneFailure.LOCKED) { engine.setBrightness(id, 70f, false) }
        device.locked = false
        engine.handoff(id)
        expectFailure(PhoneFailure.HANDOFF) { engine.readBrightness(id) }
        expectFailure(PhoneFailure.HANDOFF) { engine.setBrightness(id, 70f, false) }
        assertEquals(0, device.brightnessWrites)
        assertEquals(0, device.brightnessReads)
    }

    @Test fun pausedBrightnessWaitsAndStopCancelsItWithoutChangingModeOrLevel() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("com.android.settings")).id
        engine.pause(id, true)
        val pending = async(start = CoroutineStart.UNDISPATCHED) {
            expectFailure(PhoneFailure.ENDED) { engine.setBrightness(id, 70f, true) }
        }
        assertFalse(pending.isCompleted)
        assertEquals(0, device.brightnessWrites)
        engine.requestStop(id)
        withTimeout(1_000) { pending.await(); engine.end(id) }
        assertEquals(0, device.brightnessWrites)
        assertFalse(device.brightnessState.adaptive)
    }

    @Test fun brightnessPreservesAdaptiveUnlessExplicitlyRequested() = runBlocking {
        val device = FakeDevice().apply { brightnessState = brightnessState.copy(adaptive = true) }
        val engine = device.engine()
        val id = engine.begin(setOf("com.android.settings")).id
        assertTrue(engine.setBrightness(id, 70f, null).after.adaptive)
        assertFalse(engine.setBrightness(id, 70f, false).after.adaptive)
        engine.end(id)
        expectFailure(PhoneFailure.ENDED) { engine.readBrightness(id) }
        expectFailure(PhoneFailure.ENDED) { engine.setBrightness(id, 70f, false) }
        assertEquals(2, device.brightnessWrites)
    }

    @Test fun grantedAppJoinsTheRunningSessionScope() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        expectFailure(PhoneFailure.APP_SCOPE) { engine.execute(id, PhoneAction.Launch("org.example.chat")) }
        val state = engine.allow(id, "org.example.chat")
        assertEquals(setOf("org.example.notes", "org.example.chat"), state.packages)
        assertEquals(state.packages, engine.state()?.packages)
        assertEquals(listOf("org.example.chat"), device.granted)
        engine.execute(id, PhoneAction.Launch("org.example.chat"))
        assertEquals(1, device.calls)
        // Already in scope: no second widening at the device.
        engine.allow(id, "org.example.chat")
        assertEquals(1, device.granted.size)
        engine.end(id)
    }

    @Test fun grantsCannotTargetHarnessInvalidNamesOrEndedSessions() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        expectFailure(PhoneFailure.INVALID) { engine.allow(id, "org.pkuinfo.harness") }
        expectFailure(PhoneFailure.INVALID) { engine.allow(id, "not a package") }
        expectFailure(PhoneFailure.ENDED) { engine.allow("other-session", "org.example.chat") }
        engine.end(id)
        expectFailure(PhoneFailure.ENDED) { engine.allow(id, "org.example.chat") }
        assertTrue(device.granted.isEmpty())
    }

    @Test fun aSessionNeverGrowsPastTwentyApps() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin((1..20).map { "org.example.app$it" }.toSet()).id
        expectFailure(PhoneFailure.INVALID) { engine.allow(id, "org.example.chat") }
        assertEquals(20, engine.state()?.packages?.size)
        engine.end(id)
    }

    @Test fun beginningOnlyAllocatesSessionWithoutOperatingAnApp() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val session = engine.begin(setOf("org.example.notes"))
        assertEquals(setOf("org.example.notes"), session.packages)
        assertEquals(0, device.calls)
        engine.end(session.id)
    }

    @Test fun slidersRequireFreshBoundedWritableTargets() = runBlocking {
        val device = FakeDevice()
        device.frame = device.frame.copy(elements = listOf(device.frame.elements.single().copy(rangeMin = 0f, rangeMax = 100f, rangeCurrent = 40f)))
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val snapshot = engine.observe(id)
        for (value in listOf(-1f, 101f, Float.NaN, Float.POSITIVE_INFINITY)) {
            expectFailure(PhoneFailure.INVALID) { engine.execute(id, PhoneAction.SetProgress(value), snapshot.snapshotId, "e1") }
        }
        device.effect = PhoneEffect.MONEY
        expectFailure(PhoneFailure.HANDOFF) { engine.execute(id, PhoneAction.SetProgress(60f), snapshot.snapshotId, "e1") }
        assertEquals(0, device.calls)
        device.effect = PhoneEffect.WRITE
        engine.execute(id, PhoneAction.SetProgress(60f), snapshot.snapshotId, "e1")
        assertEquals(1, device.calls)
    }

    @Test fun pausedActionsWaitForResumeAndStopUnblocksWaiters() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        engine.pause(id, true)
        val action = async(start = CoroutineStart.UNDISPATCHED) { engine.execute(id, PhoneAction.Launch("org.example.notes")) }
        assertFalse(action.isCompleted)
        assertEquals(0, device.calls)
        engine.pause(id, false)
        action.await()
        assertEquals(1, device.calls)
        engine.pause(id, true)
        val waiting = async(start = CoroutineStart.UNDISPATCHED) { expectFailure(PhoneFailure.ENDED) { engine.observe(id) } }
        engine.requestStop(id)
        waiting.await()
        engine.end(id)
        assertEquals(1, device.closes)
    }

    @Test fun pausingDuringFreshnessReadDefersDispatchAndRechecksAfterResume() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val snapshot = engine.observe(id)
        val approved = engine.assess(id, snapshot.snapshotId, "e1")
        device.readEntered = CompletableDeferred()
        device.readFinish = CompletableDeferred()
        val action = async(start = CoroutineStart.UNDISPATCHED) {
            expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.Tap, snapshot.snapshotId, "e1", approved) }
        }
        device.readEntered!!.await()
        engine.pause(id, true)
        device.readFinish!!.complete(Unit)
        yield()
        assertEquals(0, device.calls)
        assertFalse(action.isCompleted)
        device.frame = device.frame.copy(elements = listOf(device.frame.elements.single().copy(text = "Different target")))
        engine.pause(id, false)
        withTimeout(1_000) { action.await() }
        assertEquals(0, device.calls)
    }

    @Test fun queuedPausedActionDoesNotBlockTakeoverOrStop() = runBlocking {
        val device = FakeDevice().apply { entered = CompletableDeferred(); finish = CompletableDeferred() }
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val first = async(start = CoroutineStart.UNDISPATCHED) { engine.execute(id, PhoneAction.Launch("org.example.notes")) }
        device.entered!!.await()
        val queued = async(start = CoroutineStart.UNDISPATCHED) {
            expectFailure(PhoneFailure.ENDED) { engine.execute(id, PhoneAction.Launch("org.example.notes")) }
        }
        engine.pause(id, true)
        device.finish!!.complete(Unit)
        first.await()
        withTimeout(1_000) { engine.handoff(id) }
        assertTrue(engine.state()!!.handedOver)
        assertEquals(1, device.calls)
        engine.requestStop(id)
        withTimeout(1_000) { queued.await(); engine.end(id) }
        assertEquals(1, device.closes)
    }

    @Test fun recoveryRestartStillHonorsScopeLockAndUserControl() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        expectFailure(PhoneFailure.APP_SCOPE) { engine.execute(id, PhoneAction.Launch("org.example.other", restart = true)) }
        device.locked = true
        expectFailure(PhoneFailure.LOCKED) { engine.execute(id, PhoneAction.Launch("org.example.notes", restart = true)) }
        device.locked = false
        engine.handoff(id)
        expectFailure(PhoneFailure.HANDOFF) { engine.execute(id, PhoneAction.Launch("org.example.notes", restart = true)) }
        assertEquals(0, device.calls)
    }

    @Test fun selectedAppCanBeRelaunchedToRecoverFromScopeEscape() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        device.frame = device.frame.copy(packageName = "org.example.other", windowPackages = setOf("org.example.other"))
        expectFailure(PhoneFailure.APP_SCOPE) { engine.observe(id) }
        // The fake launch does not change the screen, so the post-action observation fails;
        // dispatch itself must have been permitted for the selected app only.
        expectFailure(PhoneFailure.APP_SCOPE) { engine.execute(id, PhoneAction.Launch("org.example.notes")) }
        assertEquals(1, device.calls)
        expectFailure(PhoneFailure.APP_SCOPE) { engine.execute(id, PhoneAction.Launch("org.example.other")) }
        assertEquals(1, device.calls)
    }

    @Test fun submitRequiresItsOwnApprovalAndRejectsChangedFields() = runBlocking {
        val device = FakeDevice()
        device.frame = device.frame.copy(elements = listOf(device.frame.elements.single().copy(editable = true, text = "query")))
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val snapshot = engine.observe(id)
        val tapApproval = engine.assess(id, snapshot.snapshotId, "e1")
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.Submit, snapshot.snapshotId, "e1", tapApproval) }
        val approval = engine.assess(id, snapshot.snapshotId, "e1", submit = true)
        assertEquals(PhoneEffect.PUBLIC, approval.effect)
        device.frame = device.frame.copy(elements = listOf(device.frame.elements.single().copy(text = "different query")))
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.Submit, snapshot.snapshotId, "e1", approval) }
        assertEquals(0, device.calls)
        val current = engine.observe(id)
        val fresh = engine.assess(id, current.snapshotId, "e1", submit = true)
        engine.execute(id, PhoneAction.Submit, current.snapshotId, "e1", fresh)
        assertEquals(1, device.calls)
    }

    @Test fun submitRejectsNonFieldsSecretsAndPayment() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        var snapshot = engine.observe(id)
        expectFailure(PhoneFailure.INVALID) { engine.assess(id, snapshot.snapshotId, "e1", submit = true) }
        device.frame = device.frame.copy(elements = listOf(device.frame.elements.single().copy(editable = true, secret = true)))
        snapshot = engine.observe(id)
        expectFailure(PhoneFailure.HANDOFF) { engine.assess(id, snapshot.snapshotId, "e1", submit = true) }
        device.frame = device.frame.copy(elements = listOf(device.frame.elements.single().copy(secret = false)))
        device.effect = PhoneEffect.MONEY
        snapshot = engine.observe(id)
        val approval = engine.assess(id, snapshot.snapshotId, "e1", submit = true)
        expectFailure(PhoneFailure.HANDOFF) { engine.execute(id, PhoneAction.Submit, snapshot.snapshotId, "e1", approval) }
        assertEquals(0, device.calls)
    }

    @Test fun changesAfterApprovalPreventDispatch() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val session = engine.begin(setOf("org.example.notes"))
        val snapshot = engine.observe(session.id)
        val approval = engine.assess(session.id, snapshot.snapshotId, "e1")
        device.frame = device.frame.copy(elements = listOf(device.frame.elements.single().copy(text = "Delete")))
        expectFailure(PhoneFailure.STALE) { engine.execute(session.id, PhoneAction.Tap, snapshot.snapshotId, "e1", approval) }
        assertEquals(0, device.calls)
    }

    @Test fun tickingTextElsewhereDoesNotBlockATapOnAnUnchangedTarget() = runBlocking {
        val device = FakeDevice()
        val timer = DeviceElement("node-2", "text", "04:56", listOf(0, 60, 100, 90))
        device.frame = device.frame.copy(elements = device.frame.elements + timer, unstable = true)
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val snapshot = engine.observe(id)
        val approval = engine.assess(id, snapshot.snapshotId, "e1")
        device.frame = device.frame.copy(elements = listOf(device.frame.elements[0], timer.copy(text = "04:55")))
        engine.execute(id, PhoneAction.Tap, snapshot.snapshotId, "e1", approval)
        assertEquals(1, device.calls)
    }

    @Test fun aTapNeedsItsTargetNotTheSameScreen() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        var snapshot = engine.observe(id)
        var approval = engine.assess(id, snapshot.snapshotId, "e1")
        // Something new elsewhere on the page: the reviewed button is untouched, so the tap goes through.
        device.frame = device.frame.copy(elements = device.frame.elements + DeviceElement("node-2", "button", "Delete", listOf(0, 60, 50, 110), clickable = true))
        engine.execute(id, PhoneAction.Tap, snapshot.snapshotId, "e1", approval)
        assertEquals(1, device.calls)
        // A tappable element slides on top of the reviewed one: a tap there could reach it instead.
        snapshot = engine.observe(id)
        approval = engine.assess(id, snapshot.snapshotId, "e1")
        device.frame = device.frame.copy(elements = listOf(device.frame.elements[0], device.frame.elements[1].copy(bounds = listOf(0, 0, 50, 50))))
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.Tap, snapshot.snapshotId, "e1", approval) }
        // The reviewed element is gone.
        snapshot = engine.observe(id)
        approval = engine.assess(id, snapshot.snapshotId, "e1")
        device.frame = device.frame.copy(elements = listOf(DeviceElement("node-3", "button", "Pay", listOf(0, 0, 50, 50), clickable = true)))
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.Tap, snapshot.snapshotId, "e1", approval) }
        assertEquals(1, device.calls)
    }

    @Test fun aTapGoesThroughWhileABannerKeepsMovingAndAfterItsTargetScrolled() = runBlocking {
        val device = FakeDevice()
        val target = device.frame.elements[0]
        val banner = { n: Int -> DeviceElement("node-b", "image", "Banner $n", listOf(0, 60, 100, 120)) }
        device.frame = device.frame.copy(elements = listOf(banner(1), target))
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val seen = engine.observe(id)
        val ref = seen.targets.first { it.element.text == "Open" }.ref
        val approval = engine.assess(id, seen.snapshotId, ref)
        // The carousel advanced and a countdown appeared above the button: the button is unchanged.
        device.frame = device.frame.copy(elements = listOf(DeviceElement("node-c", "text", "00:59", listOf(0, 50, 100, 60)), banner(2), target))
        engine.execute(id, PhoneAction.Tap, seen.snapshotId, ref, approval)
        assertEquals(1, device.calls)
        // The button scrolled to another spot while the banner kept moving: still the same button.
        val again = engine.observe(id)
        val ref2 = again.targets.first { it.element.text == "Open" }.ref
        val approval2 = engine.assess(id, again.snapshotId, ref2)
        device.frame = device.frame.copy(elements = listOf(banner(3), target.copy(bounds = listOf(0, 130, 50, 180))))
        engine.execute(id, PhoneAction.Tap, again.snapshotId, ref2, approval2)
        assertEquals(2, device.calls)
    }

    @Test fun changedPolicyCannotReuseAnEarlierApproval() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val snapshot = engine.observe(id)
        val approval = engine.assess(id, snapshot.snapshotId, "e1")
        device.effect = PhoneEffect.PUBLIC
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.Tap, snapshot.snapshotId, "e1", approval) }
        assertEquals(0, device.calls)
    }

    @Test fun appScopeIsCheckedOnObservationAndBeforeDispatch() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        expectFailure(PhoneFailure.APP_SCOPE) { engine.execute(id, PhoneAction.Launch("org.example.bank")) }
        device.frame = device.frame.copy(windowPackages = setOf("org.example.notes", null))
        expectFailure(PhoneFailure.APP_SCOPE) { engine.observe(id) }
        assertEquals(0, device.calls)
    }

    @Test fun passwordsAreRedactedAndProtectedFramesAreNotPreviewed() = runBlocking {
        val device = FakeDevice()
        device.frame = device.frame.copy(elements = listOf(device.frame.elements.single().copy(secret = true, text = "secret", editable = true)))
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val observation = engine.observe(id)
        assertEquals("", observation.targets.single().element.text)
        expectFailure(PhoneFailure.HANDOFF) { engine.execute(id, PhoneAction.Type("text"), observation.snapshotId, "e1") }
        device.frame = device.frame.copy(protected = true)
        assertNull(engine.preview(id))
        assertTrue(engine.observe(id).targets.isEmpty())
    }

    @Test fun liveScreensArePreviewedButAnAppearingProtectedScreenIsNot() = runBlocking {
        val device = FakeDevice()
        device.frame = device.frame.copy(unstable = true)
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        assertNotNull(engine.preview(id))
        device.frame = device.frame.copy(protected = true)
        assertNull(engine.preview(id))
    }

    @Test fun previewKeepsWorkingWhileTheAgentWaits() = runBlocking {
        val device = FakeDevice().apply { entered = CompletableDeferred(); finish = CompletableDeferred() }
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val waiting = async { engine.waitForChange(id, 10_000) }
        device.entered!!.await()
        assertNotNull(withTimeout(1_000) { engine.preview(id) })
        device.finish!!.complete(Unit)
        waiting.await()
        Unit
    }

    @Test fun uncertainActionIsNeverAutomaticallyRetried() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val observation = engine.observe(id)
        val approval = engine.assess(id, observation.snapshotId, "e1")
        device.failure = IllegalStateException("transport lost after dispatch")
        try { engine.execute(id, PhoneAction.Tap, observation.snapshotId, "e1", approval); fail("Expected transport failure") }
        catch (_: IllegalStateException) { }
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.Tap, observation.snapshotId, "e1", approval) }
        assertEquals(1, device.calls)
    }

    @Test fun stopInvalidatesAnInFlightActionAndClosesExactlyOnce() = runBlocking {
        val device = FakeDevice().apply { entered = CompletableDeferred(); finish = CompletableDeferred() }
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val action = async {
            expectFailure(PhoneFailure.ENDED) { engine.execute(id, PhoneAction.Launch("org.example.notes")) }
        }
        device.entered!!.await()
        engine.requestStop(id)
        assertNull(engine.state())
        val ending = async { engine.end(id) }
        device.finish!!.complete(Unit)
        action.await(); ending.await()
        engine.end(id)
        assertEquals(1, device.closes)
    }

    @Test fun cancellationInterruptsWaitingForScreenChange() = runBlocking {
        val device = FakeDevice().apply { entered = CompletableDeferred(); finish = CompletableDeferred() }
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val waiting = async { expectFailure(PhoneFailure.ENDED) { engine.waitForChange(id, 10_000) } }
        device.entered!!.await()
        engine.requestStop(id)
        waiting.await()
        engine.end(id)
        assertEquals(1, device.closes)
    }

    @Test fun handoffRequiresExplicitResumeAndAStoppedIdCannotCloseAReplacement() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val old = engine.begin(setOf("org.example.notes")).id
        engine.handoff(old)
        assertTrue(engine.state()!!.handedOver)
        assertNull(engine.preview(old))
        expectFailure(PhoneFailure.HANDOFF) { engine.observe(old) }
        engine.resume(old)
        engine.observe(old)
        engine.end(old)
        val replacement = engine.begin(setOf("org.example.notes")).id
        engine.end(old)
        assertEquals(replacement, engine.state()!!.id)
        assertEquals(1, device.closes)
    }

    @Test fun failedSetupClosesItsResources() = runBlocking {
        val device = FakeDevice().apply { locked = true }
        val engine = device.engine()
        expectFailure(PhoneFailure.LOCKED) { engine.begin(setOf("org.example.notes")) }
        assertNull(engine.state())
        assertEquals(1, device.closes)
    }

    @Test fun successfulActionIssuesANewObservationAndConsumesItsOldReference() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val observation = engine.observe(id)
        val approval = engine.assess(id, observation.snapshotId, "e1")
        val result = engine.execute(id, PhoneAction.Tap, observation.snapshotId, "e1", approval)
        assertTrue(result.outcome.ok)
        assertNotEquals(observation.snapshotId, result.observation.snapshotId)
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.Tap, observation.snapshotId, "e1", approval) }
        assertEquals(1, device.calls)
    }

    @Test fun wholeScreenScrollAndBackActOnTheCurrentScreenEvenWithAnOlderSnapshot() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val old = engine.observe(id)
        engine.observe(id) // a newer snapshot replaces it (an action batched in the same step)
        engine.execute(id, PhoneAction.Scroll(true), old.snapshotId)
        engine.execute(id, PhoneAction.Back, old.snapshotId)
        assertEquals(2, device.calls)
        // An element action still needs the current snapshot.
        val approval = engine.assess(id, engine.observe(id).snapshotId, "e1")
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.Tap, old.snapshotId, "e1", approval) }
    }

    @Test fun paymentsAndUserScreenPromptsRequireHandoff() = runBlocking {
        val device = FakeDevice().apply { effect = PhoneEffect.MONEY }
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val observation = engine.observe(id)
        val approval = engine.assess(id, observation.snapshotId, "e1")
        expectFailure(PhoneFailure.HANDOFF) { engine.execute(id, PhoneAction.Tap, observation.snapshotId, "e1", approval) }
        device.frame = device.frame.copy(needsUser = true)
        val prompt = engine.observe(id)
        assertTrue(prompt.needsUser)
        assertTrue(prompt.targets.isEmpty())
        expectFailure(PhoneFailure.HANDOFF) { engine.execute(id, PhoneAction.Back, prompt.snapshotId) }
        assertEquals(0, device.calls)
    }

    // ---- Vision fallback: look + point actions

    @Test fun pointActionsUseTheScreenshotsPixelsAndNeedApproval() = runBlocking {
        val device = FakeDevice().apply {
            frame = frame.copy(width = 1000, height = 2000)
            image = DevicePreview(byteArrayOf(1), "image/jpeg", 360, 720)
        }
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val look = engine.look(id)
        assertEquals(360, look.image.width)
        val approved = engine.assessPoint(id, look.observation.snapshotId, 180, 360)
        assertEquals("(180, 360)", approved.label)
        assertEquals(PhoneEffect.WRITE, approved.effect)
        // Without the matching approval nothing is dispatched.
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.TapAt(180, 360), look.observation.snapshotId) }
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.TapAt(181, 360), look.observation.snapshotId, approved = approved) }
        assertEquals(0, device.calls)
        val look2 = engine.look(id)
        val approval = engine.assessPoint(id, look2.observation.snapshotId, 180, 360)
        engine.execute(id, PhoneAction.TapAt(180, 360), look2.observation.snapshotId, approved = approval)
        // The centre of screenshot pixel (180, 360) of 360x720 → display pixel (501, 1001) of 1000x2000.
        assertEquals(PhoneAction.TapAt(501, 1001), device.performed)
        // A dispatched action consumes the screenshot.
        expectFailure(PhoneFailure.STALE) { engine.assessPoint(id, look2.observation.snapshotId, 10, 10) }
        engine.end(id)
    }

    @Test fun pointsMustComeFromTheLatestScreenshotAndLieInsideIt() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val observed = engine.observe(id)
        // An element observation is not a screenshot.
        expectFailure(PhoneFailure.STALE) { engine.assessPoint(id, observed.snapshotId, 10, 10) }
        val look = engine.look(id)
        expectFailure(PhoneFailure.INVALID) { engine.assessPoint(id, look.observation.snapshotId, 100, 10) }
        expectFailure(PhoneFailure.INVALID) { engine.assessPoint(id, look.observation.snapshotId, -1, 10) }
        val newer = engine.observe(id)
        expectFailure(PhoneFailure.STALE) { engine.assessPoint(id, look.observation.snapshotId, 10, 10) }
        expectFailure(PhoneFailure.STALE) { engine.assessPoint(id, newer.snapshotId, 10, 10) }
        assertEquals(0, device.calls)
        engine.end(id)
    }

    @Test fun tickingTextKeepsAPointValidButAStructuralChangeDoesNot() = runBlocking {
        val clock = DeviceElement("node-2", "text", "10:00:01", listOf(0, 600, 999, 700))
        val device = FakeDevice().apply { frame = frame.copy(elements = frame.elements + clock) }
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val look = engine.look(id)
        val approved = engine.assessPoint(id, look.observation.snapshotId, 50, 150)
        device.frame = device.frame.copy(elements = device.frame.elements.map { if (it.key == "node-2") it.copy(text = "10:00:02") else it }, unstable = true)
        engine.execute(id, PhoneAction.TypeAt(50, 150, "hi"), look.observation.snapshotId, approved = approved)
        assertEquals(1, device.calls)
        val again = engine.look(id)
        val ok = engine.assessPoint(id, again.observation.snapshotId, 50, 150)
        device.frame = device.frame.copy(elements = device.frame.elements + DeviceElement("node-3", "button", "New", listOf(0, 800, 999, 900)))
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.TapAt(50, 150), again.observation.snapshotId, approved = ok) }
        assertEquals(1, device.calls)
        engine.end(id)
    }

    @Test fun protectedOrUserAttentionScreensAreNeverCaptured() = runBlocking {
        val device = FakeDevice().apply { frame = frame.copy(protected = true) }
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        expectFailure(PhoneFailure.HANDOFF) { engine.look(id) }
        device.frame = device.frame.copy(protected = false, needsUser = true)
        expectFailure(PhoneFailure.HANDOFF) { engine.look(id) }
        device.frame = device.frame.copy(needsUser = false, windowPackages = setOf("org.example.notes", "org.example.other"))
        expectFailure(PhoneFailure.APP_SCOPE) { engine.look(id) }
        assertEquals(0, device.previews)
        engine.handoff(id)
        expectFailure(PhoneFailure.HANDOFF) { engine.look(id) }
        assertEquals(0, device.previews)
        engine.end(id)
    }

    @Test fun aScreenThatBecomesProtectedDuringCaptureIsDiscarded() = runBlocking {
        val fake = FakeDevice()
        val protecting = object : DevicePort, DeviceSession by fake {
            override suspend fun open(allowedPackages: Set<String>) = this
            override suspend fun lookImage(): DevicePreview? { fake.frame = fake.frame.copy(protected = true); return fake.image }
        }
        val engine = PhoneEngine(protecting, ActionPolicy { _, _ -> PhoneEffect.WRITE }, "org.pkuinfo.harness")
        val id = engine.begin(setOf("org.example.notes")).id
        expectFailure(PhoneFailure.STALE) { engine.look(id) }
        // Nothing to act on: the discarded capture left no screenshot behind.
        fake.frame = fake.frame.copy(protected = false)
        expectFailure(PhoneFailure.STALE) { engine.assessPoint(id, "$id:1", 2, 2) }
        engine.end(id)
    }

    @Test fun pointsOnMoneyScreensOrPasswordFieldsAreRefused() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        val look = engine.look(id)
        // The element under (2, 2) is judged like a tap on it.
        device.effect = PhoneEffect.MONEY
        val money = engine.assessPoint(id, look.observation.snapshotId, 2, 2)
        assertEquals(PhoneEffect.MONEY, money.effect)
        expectFailure(PhoneFailure.HANDOFF) { engine.execute(id, PhoneAction.TapAt(2, 2), look.observation.snapshotId, approved = money) }
        // Nothing observed under the point: at least WRITE.
        assertEquals(PhoneEffect.WRITE, engine.assessPoint(id, look.observation.snapshotId, 90, 190).effect)
        device.effect = PhoneEffect.WRITE
        device.frame = device.frame.copy(elements = listOf(device.frame.elements.single().copy(secret = true, editable = true)))
        val secret = engine.look(id)
        expectFailure(PhoneFailure.HANDOFF) { engine.assessPoint(id, secret.observation.snapshotId, 2, 2) }
        assertEquals(0, device.calls)
        engine.end(id)
    }
}
