package org.pkuinfo.harness.phone.core

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class PhoneEngineTest {
    private class FakeDevice : DevicePort, DeviceSession {
        var locked = false
        var closes = 0
        var calls = 0
        var effect = PhoneEffect.WRITE
        var failure: RuntimeException? = null
        var entered: CompletableDeferred<Unit>? = null
        var finish: CompletableDeferred<Unit>? = null
        var frame = DeviceFrame("org.example.notes", setOf("org.example.notes"), 100, 200,
            listOf(DeviceElement("node-1", "button", "Open", listOf(0, 0, 50, 50), clickable = true)), "window-1")
        override suspend fun open(allowedPackages: Set<String>) = this
        override suspend fun isLocked() = locked
        override suspend fun read() = frame
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
