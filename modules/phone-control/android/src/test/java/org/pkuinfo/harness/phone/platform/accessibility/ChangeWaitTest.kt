package org.pkuinfo.harness.phone.platform.accessibility

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChangeWaitTest {
    /** A fake clock; [lastEvent] is when the screen last sent an accessibility event. */
    private class Screen(var lastEvent: Long = 0) {
        var now = 0L
        var tree = false
        var frame = IntArray(64)
        val before = IntArray(64)
        /** Events keep coming (a carousel, a timer). */
        var busy = false

        fun await(): Boolean = runBlocking {
            ChangeWait.awaitStableChange(
                now = { now },
                sleep = { now += it; if (busy) lastEvent = now; onTick(now) },
                frame = { frame },
                quietForMs = { now - lastEvent },
                treeChanged = { tree },
                beforeFrame = before,
            )
        }
        var onTick: (Long) -> Unit = {}
    }

    @Test fun aTapThatChangesNothingIsReportedAfterAboutASecondNotTheCap() {
        val s = Screen()
        assertEquals(false, s.await())
        assertTrue("took ${s.now} ms", s.now in ChangeWait.UNCHANGED_MS until ChangeWait.UNCHANGED_MS + ChangeWait.POLL_MS * 2)
    }

    @Test fun aChangedTreeReturnsAsSoonAsEventsAreQuiet() {
        val s = Screen()
        s.onTick = { if (it >= 200) s.tree = true; if (it <= 200) s.lastEvent = it }
        assertEquals(true, s.await())
        assertTrue("took ${s.now} ms", s.now < 200 + ChangeWait.QUIET_MS + ChangeWait.POLL_MS * 2)
    }

    @Test fun aBusyPageWithAChangedTreeReturnsBeforeTheCap() {
        val s = Screen()
        s.busy = true
        s.onTick = { if (it >= 300) s.tree = true }
        assertEquals(true, s.await())
        assertTrue("took ${s.now} ms", s.now in ChangeWait.BUSY_MS until ChangeWait.CAP_MS)
    }

    @Test fun aSlowPageThatStartsReactingWithinTheSecondIsStillSeen() {
        val s = Screen()
        // Nothing for 800 ms, then the page reacts with events and a new tree.
        s.onTick = { if (it in 800..1000) { s.lastEvent = it; s.tree = true } }
        assertEquals(true, s.await())
    }
}
