/*
 * Copyright (C) 2018 The Android Open Source Project
 * Adapted for Harness from SettingsLib display/BrightnessUtils.java, Apache-2.0.
 * See the module LICENSE and NOTICE.
 */
package org.pkuinfo.harness.phone.core

import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sqrt

/** Android Settings' perceptual slider scale, normalized to percent rather than 0..65535. */
object BrightnessScale {
    private const val A = 0.17883277f
    private const val B = 0.28466892f
    private const val C = 0.55991073f
    const val VERIFIED_TOLERANCE_PERCENT = 1f

    fun validBounds(minimum: Float, maximum: Float): Boolean =
        minimum.isFinite() && maximum.isFinite() && minimum >= 0f && maximum <= 1f && maximum > minimum

    fun toLinear(percent: Float, minimum: Float, maximum: Float): Float {
        require(percent.isFinite() && percent in 0f..100f && validBounds(minimum, maximum))
        val gamma = percent / 100f
        val light = if (gamma <= 0.5f) (gamma / 0.5f) * (gamma / 0.5f) else exp((gamma - C) / A) + B
        return minimum + (maximum - minimum) * (light.coerceIn(0f, 12f) / 12f)
    }

    fun toPercent(linear: Float, minimum: Float, maximum: Float): Float {
        require(linear.isFinite() && linear in 0f..1f && validBounds(minimum, maximum))
        val light = ((linear - minimum) / (maximum - minimum)).coerceIn(0f, 1f) * 12f
        val gamma = if (light <= 1f) sqrt(light) * 0.5f else A * ln(light - B) + C
        return (gamma * 100f).coerceIn(0f, 100f)
    }
}
