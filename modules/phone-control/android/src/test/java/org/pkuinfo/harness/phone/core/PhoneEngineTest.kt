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
        override suspend fun open(allowedPackages: Set<String>) = this
        override suspend fun isLocked() = locked
        override suspend fun read(): DeviceFrame { readEntered?.complete(Unit); readFinish?.await(); return frame }
        override suspend fun perform(action: PhoneAction, target: DeviceElement?): DeviceOutcome {
            calls++
            entered?.complete(Unit)
            finish?.await()
            failure?.let { throw it }
            return DeviceOutcome(true)
        }
        override suspend fun awaitChange(timeoutMs: Long) { entered?.complete(Unit); finish?.await() }
        override suspend fun preview() = DevicePreview(byteArrayOf(1), "image/png", 100, 200)
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

    @Test fun movedOrNewElementsStillMakeTheScreenStale() = runBlocking {
        val device = FakeDevice()
        val engine = device.engine()
        val id = engine.begin(setOf("org.example.notes")).id
        var snapshot = engine.observe(id)
        var approval = engine.assess(id, snapshot.snapshotId, "e1")
        device.frame = device.frame.copy(elements = device.frame.elements + DeviceElement("node-2", "button", "Delete", listOf(0, 60, 50, 110), clickable = true))
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.Tap, snapshot.snapshotId, "e1", approval) }
        snapshot = engine.observe(id)
        approval = engine.assess(id, snapshot.snapshotId, "e1")
        device.frame = device.frame.copy(elements = listOf(device.frame.elements[0], device.frame.elements[1].copy(bounds = listOf(0, 0, 50, 50))))
        expectFailure(PhoneFailure.STALE) { engine.execute(id, PhoneAction.Tap, snapshot.snapshotId, "e1", approval) }
        assertEquals(0, device.calls)
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
}
