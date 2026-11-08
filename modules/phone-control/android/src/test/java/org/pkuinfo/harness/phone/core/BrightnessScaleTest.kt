package org.pkuinfo.harness.phone.core

import org.junit.Assert.*
import org.junit.Test

class BrightnessScaleTest {
    @Test fun perceptualMidpointIsNotHalfHardwareBrightness() {
        assertEquals(0.01f, BrightnessScale.toLinear(0f, 0.01f, 1f), 0.00001f)
        assertEquals(0.01f + 0.99f / 12f, BrightnessScale.toLinear(50f, 0.01f, 1f), 0.00001f)
        assertEquals(1f, BrightnessScale.toLinear(100f, 0.01f, 1f), 0.00001f)
        assertTrue(BrightnessScale.toPercent(102f / 255f, 0f, 1f) > 80f)
    }

    @Test fun perceptualRoundTripUsesActualHardwareBounds() {
        for ((minimum, maximum) in listOf(0f to 1f, 0.01f to 0.8f, 0.1f to 0.6f)) {
            for (percent in listOf(0f, 10f, 50f, 70f, 95f, 100f)) {
                val linear = BrightnessScale.toLinear(percent, minimum, maximum)
                assertTrue(linear >= minimum && linear <= maximum)
                assertEquals(percent, BrightnessScale.toPercent(linear, minimum, maximum), 0.01f)
            }
        }
    }

    @Test fun missingOrInvalidBoundsAndPercentAreRejected() {
        for ((minimum, maximum) in listOf(Float.NaN to 1f, 0f to Float.POSITIVE_INFINITY, 1f to 0f, 0f to 0f, -1f to 1f, 0f to 2f)) {
            assertFalse(BrightnessScale.validBounds(minimum, maximum))
            try { BrightnessScale.toLinear(70f, minimum, maximum); fail("Invalid bounds accepted") }
            catch (_: IllegalArgumentException) { }
        }
        for (percent in listOf(-1f, 101f, Float.NaN, Float.NEGATIVE_INFINITY)) {
            try { BrightnessScale.toLinear(percent, 0f, 1f); fail("Invalid percentage accepted") }
            catch (_: IllegalArgumentException) { }
        }
    }
}
