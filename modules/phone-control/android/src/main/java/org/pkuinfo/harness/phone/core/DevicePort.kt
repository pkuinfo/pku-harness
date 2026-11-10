package org.pkuinfo.harness.phone.core

/** Platform boundary for Harness phone control. No UI, Expo, or vendor-engine types cross it. */
interface DevicePort {
    suspend fun open(allowedPackages: Set<String>): DeviceSession
}

interface DeviceSession {
    /** Device setting access requires the real Settings package in the saved app scope. */
    val settingsPackage: String? get() = null
    suspend fun readBrightness(): DeviceBrightness = throw UnsupportedOperationException("Physical brightness is unavailable")
    suspend fun setBrightness(percent: Float, adaptive: Boolean?): DeviceBrightnessChange = throw UnsupportedOperationException("Physical brightness is unavailable")
    /** Widen this session's app scope by one installed app the user granted. */
    suspend fun allow(packageName: String): Unit = throw UnsupportedOperationException("This session's app scope is fixed")
    suspend fun isLocked(): Boolean
    suspend fun read(): DeviceFrame
    suspend fun perform(action: PhoneAction, target: DeviceElement?): DeviceOutcome
    suspend fun awaitChange(timeoutMs: Long)
    suspend fun preview(): DevicePreview?
    suspend fun handoff()
    suspend fun resume()
    /** Return owned app tasks appropriately and release display/input resources. Idempotent. */
    suspend fun close()
}

data class DeviceElement(
    /** Opaque platform locator, retained only in the native process. */
    val key: String,
    val role: String,
    val text: String,
    val bounds: List<Int>,
    val resourceId: String? = null,
    val clickable: Boolean = false,
    val editable: Boolean = false,
    val scrollable: Boolean = false,
    val secret: Boolean = false,
    val enabled: Boolean = true,
    val rangeMin: Float? = null,
    val rangeMax: Float? = null,
    val rangeCurrent: Float? = null,
)

data class DeviceFrame(
    val packageName: String?,
    /** All application windows on the owned display; null means an unknown owner. */
    val windowPackages: Set<String?>,
    val width: Int,
    val height: Int,
    val elements: List<DeviceElement>,
    /** Includes window identity and orientation, but not observation time. */
    val revision: String,
    val protected: Boolean = false,
    val unstable: Boolean = false,
    val needsUser: Boolean = false,
)

data class DeviceOutcome(val ok: Boolean, val message: String? = null, val changed: Boolean? = null, val verification: String? = null)
data class DeviceBrightness(val displayId: Int, val percent: Float, val linear: Float, val minimum: Float, val maximum: Float, val adaptive: Boolean)
data class DeviceBrightnessChange(val before: DeviceBrightness, val after: DeviceBrightness, val requestedPercent: Float, val verified: Boolean)
data class DevicePreview(val bytes: ByteArray, val mimeType: String, val width: Int, val height: Int)

sealed interface PhoneAction {
    data class Launch(val packageName: String, val restart: Boolean = false) : PhoneAction
    data class SetProgress(val value: Float) : PhoneAction
    data object Submit : PhoneAction
    data object Tap : PhoneAction
    data class Type(val text: String) : PhoneAction
    data class Scroll(val forward: Boolean) : PhoneAction
    data object Back : PhoneAction
    /**
     * Copilot's vision fallback: a point the model picked on a screenshot, for apps whose
     * accessibility tree is empty. [x]/[y] arrive in the screenshot's pixels; the engine checks
     * them against that screenshot and hands the device display pixels ([at]).
     */
    sealed interface Point : PhoneAction {
        val x: Int
        val y: Int
        fun at(x: Int, y: Int): Point
    }
    data class TapAt(override val x: Int, override val y: Int) : Point {
        override fun at(x: Int, y: Int) = copy(x = x, y = y)
    }
    data class TypeAt(override val x: Int, override val y: Int, val text: String) : Point {
        override fun at(x: Int, y: Int) = copy(x = x, y = y)
    }
}
