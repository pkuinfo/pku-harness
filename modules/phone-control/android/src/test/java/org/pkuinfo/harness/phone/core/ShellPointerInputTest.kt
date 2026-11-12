package org.pkuinfo.harness.phone.core

import org.junit.Assert.*
import org.junit.Test
import org.pkuinfo.harness.phone.helper.StrokeDelivery
import org.pkuinfo.harness.phone.platform.interaction.ShellPointerPlan

class ShellPointerInputTest {
    @Test fun swipeHasIntermediateMotionAndExactEndpoints() {
        val points = ShellPointerPlan.linear(listOf(10 to 20, 100 to 200), 320)
        assertTrue(points.size > 2)
        assertEquals(10.0, points.first().x, 0.0)
        assertEquals(200.0, points.last().y, 0.0)
        assertEquals(320L, points.last().t)
        assertTrue(points.zipWithNext().all { (a, b) -> b.t > a.t && b.t - a.t <= 16 })
    }

    @Test fun rejectedMoveReleasesFingerAndReportsFailure() {
        val calls = mutableListOf<String>()
        val ok = StrokeDelivery.deliver(4, { calls += "down"; true },
            { calls += "move$it"; false }, { calls += "up"; true })
        assertFalse(ok)
        assertEquals(listOf("down", "move1", "up"), calls)
    }

    @Test fun rejectedDownDoesNotSendMoreInput() {
        assertFalse(StrokeDelivery.deliver(2, { false }, { error("unexpected move") }, { error("unexpected up") }))
    }

    @Test fun releaseFailureIsNotSuccess() {
        var releases = 0
        assertFalse(StrokeDelivery.deliver(2, { true }, { true }, { releases++; false }))
        assertEquals(2, releases)
    }
}
