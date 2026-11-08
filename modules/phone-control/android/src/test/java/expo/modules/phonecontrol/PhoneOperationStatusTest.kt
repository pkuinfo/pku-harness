package expo.modules.phonecontrol

import org.junit.Assert.*
import org.junit.Test

class PhoneOperationStatusTest {
    @Test fun nativeProgressDoesNotRequireHostNotifications() {
        val tracker = PhoneOperationStatus()
        assertNull(tracker.current("phone"))
        val ticket = tracker.begin("phone", "launch")
        assertEquals("working", tracker.current("phone")!!.phase)
        tracker.finish(ticket, false)
        assertEquals("thinking", tracker.current("phone")!!.phase)
        val second = tracker.begin("phone", "submit")
        tracker.finish(second, true)
        assertEquals("attention", tracker.current("phone")!!.phase)
    }

    @Test fun lateOperationCompletionCannotOverwriteNewerWorkOrReplacementSession() {
        val tracker = PhoneOperationStatus()
        val old = tracker.begin("phone", "launch")
        val current = tracker.begin("phone", "observe")
        tracker.finish(old, true)
        assertEquals(current, tracker.current("phone"))
        val replacement = tracker.begin("replacement", "type")
        tracker.finish(current, false)
        tracker.clear("phone")
        assertNull(tracker.current("phone"))
        assertEquals(replacement, tracker.current("replacement"))
        tracker.clear("replacement")
        tracker.finish(replacement, false)
        assertNull(tracker.current("replacement"))
    }
    @Test fun newerHostWorkCanReplaceFinishedNativeStatusButNotActiveDispatch() {
        var time = 1L
        val tracker = PhoneOperationStatus { time }
        val ticket = tracker.begin("phone", "observe")
        assertFalse(PhoneOperationStatus.preferHost(ticket, "working", 5L))
        time = 3L
        tracker.finish(ticket, false)
        val finished = tracker.current("phone")!!
        assertFalse(PhoneOperationStatus.preferHost(finished, "working", 2L))
        assertFalse(PhoneOperationStatus.preferHost(finished, "waiting", 5L))
        assertTrue(PhoneOperationStatus.preferHost(finished, "working", 5L))
        assertTrue(PhoneOperationStatus.preferHost(finished, "thinking", 5L))
    }
}
