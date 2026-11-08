package org.pkuinfo.harness.phone.helper

import android.hardware.display.DisplayManager
import android.os.Bundle
import android.os.SystemClock
import android.view.Display
import org.pkuinfo.harness.phone.core.BrightnessScale
import kotlin.math.abs

/** Only the physical default display. No display IDs, setting names or commands cross this API.
 * AOSP references: DisplayManager#getBrightness/setBrightness, Display#getBrightnessInfo,
 * and SettingsLib BrightnessUtils. Signature-only calls execute in the authenticated shell helper.
 */
class DeviceBrightnessController(
    private val manager: DisplayManager,
    private val readMode: () -> Int,
    private val writeMode: (Int) -> Boolean,
) {
    @Synchronized fun read(): Bundle = result { state() }

    /** -1 preserves adaptive mode; 0/1 are explicit requests to change it. Never retries a write. */
    @Synchronized fun set(percent: Float, adaptiveMode: Int): Bundle {
        var modeAttempted = false
        var levelAttempted = false
        var originalMode: Int? = null
        return result {
            try {
                require(percent.isFinite() && percent in 0f..100f) { "Brightness must be between 0 and 100 percent" }
                require(adaptiveMode in -1..1) { "Invalid adaptive-brightness mode" }
                val before = state()
                val linear = BrightnessScale.toLinear(percent, before.getFloat("minimum"), before.getFloat("maximum"))
                originalMode = if (before.getBoolean("adaptive")) 1 else 0
                if (adaptiveMode != -1 && adaptiveMode != originalMode) {
                    modeAttempted = true
                    check(writeMode(adaptiveMode)) { "Could not change adaptive brightness" }
                    check(readMode() == adaptiveMode) { "Adaptive-brightness mode was not confirmed; brightness was not changed" }
                }
                levelAttempted = true
                manager.javaClass.getMethod("setBrightness", Int::class.javaPrimitiveType, Float::class.javaPrimitiveType)
                    .invoke(manager, Display.DEFAULT_DISPLAY, linear)
                var after = state()
                val expectedMode = if (adaptiveMode == -1) originalMode else adaptiveMode
                fun verified() = abs(after.getFloat("percent") - percent) <= BrightnessScale.VERIFIED_TOLERANCE_PERCENT &&
                    after.getBoolean("adaptive") == (expectedMode == 1)
                // Display settings propagate asynchronously. Read only; never repeat the mutation.
                val deadline = SystemClock.uptimeMillis() + 1000
                while (!verified() && SystemClock.uptimeMillis() < deadline) {
                    SystemClock.sleep(50)
                    after = state()
                }
                Bundle().apply {
                    putBundle("before", before); putBundle("after", after)
                    putFloat("requestedPercent", percent); putBoolean("verified", verified())
                }
            } catch (error: Exception) {
                val partial = listOfNotNull(
                    if (modeAttempted) "Adaptive mode may have changed; it was ${if (originalMode == 1) "automatic" else "manual"} before this request." else null,
                    if (levelAttempted) "The brightness write may have taken effect. Read device brightness before choosing another action; do not blindly retry." else null,
                ).joinToString(" ")
                throw IllegalStateException(listOf(error.cause?.message ?: error.message ?: "Device brightness failed", partial).filter { it.isNotBlank() }.joinToString(" "))
            }
        }
    }

    private fun state(): Bundle {
        val display = checkNotNull(manager.getDisplay(Display.DEFAULT_DISPLAY)) { "Default physical display is unavailable" }
        val info = checkNotNull(Display::class.java.getMethod("getBrightnessInfo").invoke(display)) { "Physical brightness information is unavailable" }
        val minimum = info.javaClass.getField("brightnessMinimum").getFloat(info)
        val maximum = info.javaClass.getField("brightnessMaximum").getFloat(info)
        check(BrightnessScale.validBounds(minimum, maximum)) { "Physical brightness bounds are unavailable" }
        val linear = (manager.javaClass.getMethod("getBrightness", Int::class.javaPrimitiveType).invoke(manager, Display.DEFAULT_DISPLAY) as Number).toFloat()
        check(linear.isFinite() && linear in 0f..1f) { "Physical brightness could not be read" }
        val mode = readMode()
        check(mode == 0 || mode == 1) { "Adaptive-brightness mode could not be read" }
        return Bundle().apply {
            putInt("displayId", Display.DEFAULT_DISPLAY)
            putFloat("linear", linear); putFloat("minimum", minimum); putFloat("maximum", maximum)
            putFloat("percent", BrightnessScale.toPercent(linear, minimum, maximum))
            putBoolean("adaptive", mode == 1)
        }
    }

    private fun result(block: () -> Bundle): Bundle = try { block() } catch (error: Exception) {
        Bundle().apply { putString("error", error.message ?: error.cause?.message ?: "Device brightness is unavailable") }
    }
}
