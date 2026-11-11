package org.pkuinfo.harness.phone.platform

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.os.Bundle
import android.graphics.Bitmap
import android.hardware.display.DisplayManager
import android.os.Build
import android.view.Display
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.pkuinfo.harness.phone.core.*
import org.pkuinfo.harness.phone.platform.accessibility.AndroidScreenDriver
import org.pkuinfo.harness.phone.platform.accessibility.ScreenAccessibility
import org.pkuinfo.harness.phone.platform.display.AgentDisplay
import org.pkuinfo.harness.phone.platform.display.LazyDisplay
import org.pkuinfo.harness.phone.platform.scope.AppAccessState
import org.pkuinfo.harness.phone.platform.screen.ActionResult
import org.pkuinfo.harness.phone.platform.screen.ScreenSnapshot
import org.pkuinfo.harness.phone.platform.screen.UiStates

/** Long side of the screenshot shown to a vision model (the preview stays at 720). */
private const val LOOK_MAX_PX = 1000.0

/** Adapts internal Android mechanisms to the Harness session engine's small platform contract. */
class AndroidDevicePort(private val context: Context, private val onClosed: () -> Unit = {}) : DevicePort {
    override suspend fun open(allowedPackages: Set<String>): DeviceSession {
        check(Build.VERSION.SDK_INT >= 31) { "Phone control requires Android 12 or newer" }
        val accessibility = checkNotNull(ScreenAccessibility.instance.value) { "Enable Copilot accessibility first" }
        val helper = checkNotNull(PhonePlatform.of(context).hub.shell.value) { "Connect the phone helper first" }
        for (name in allowedPackages) check(runCatching { context.packageManager.getApplicationInfo(name, 0) }.isSuccess) { "App is not installed: $name" }
        val metrics = context.resources.displayMetrics
        val display = LazyDisplay(metrics.widthPixels, metrics.heightPixels) {
            withContext(Dispatchers.Main) { AgentDisplay(helper, metrics.widthPixels, metrics.heightPixels, metrics.densityDpi, context.getSystemService(DisplayManager::class.java)) }
        }
        val blocked = context.packageManager.getInstalledApplications(0).map { it.packageName }.toSet() - allowedPackages
        PhoneScope.state = AppAccessState(blocked = blocked + context.packageName, revision = PhoneScope.state.revision + 1)
        return object : DeviceSession {
            private var handedOver = false
            /** Starts as the session's apps; grows only through [allow] (a user grant). */
            @Volatile private var allowed: Set<String> = allowedPackages.toSet()
            private var latest: ScreenSnapshot? = null
            private var closed = false
            private val screen = AndroidScreenDriver(accessibility, helper, display, handedOver = { handedOver }, appAccess = PhoneScope.policy)

            override val settingsPackage = context.packageManager.resolveActivity(Intent(Settings.ACTION_SETTINGS), 0)?.activityInfo?.packageName

            private fun brightness(value: Bundle): DeviceBrightness {
                value.getString("error")?.let { throw PhoneException(PhoneFailure.INVALID, it) }
                check(value.containsKey("linear") && value.containsKey("percent") && value.containsKey("adaptive")) { "Invalid brightness response" }
                return DeviceBrightness(value.getInt("displayId"), value.getFloat("percent"), value.getFloat("linear"),
                    value.getFloat("minimum"), value.getFloat("maximum"), value.getBoolean("adaptive"))
            }
            override suspend fun readBrightness(): DeviceBrightness = withContext(Dispatchers.IO) {
                check(!closed) { "Device session closed" }
                brightness(checkNotNull(helper.readDeviceBrightness()) { "Device brightness is unavailable" })
            }
            override suspend fun setBrightness(percent: Float, adaptive: Boolean?): DeviceBrightnessChange = withContext(Dispatchers.IO) {
                check(!closed) { "Device session closed" }
                val value = checkNotNull(helper.setDeviceBrightness(percent, when (adaptive) { null -> -1; false -> 0; true -> 1 }))
                value.getString("error")?.let { throw PhoneException(PhoneFailure.INVALID, it) }
                DeviceBrightnessChange(brightness(checkNotNull(value.getBundle("before"))), brightness(checkNotNull(value.getBundle("after"))),
                    value.getFloat("requestedPercent"), value.getBoolean("verified"))
            }

            override suspend fun allow(packageName: String) {
                check(!closed) { "Device session closed" }
                check(runCatching { context.packageManager.getApplicationInfo(packageName, 0) }.isSuccess) { "App is not installed: $packageName" }
                allowed = allowed + packageName
                val scope = PhoneScope.state
                PhoneScope.state = scope.copy(blocked = scope.blocked - packageName, revision = scope.revision + 1)
            }

            override suspend fun isLocked() = context.getSystemService(KeyguardManager::class.java).isKeyguardLocked

            private suspend fun scope(): Set<String?> {
                // A window whose contents aren't readable yet (mid-transition) has no known owner;
                // it is not another app. Ignore those, and give a real outsider one short moment
                // to go away (a transition between two pages of the same app) before refusing.
                fun outside(p: Set<String?>) = p.any { it != null && it !in allowed }
                var packages = screen.accessPackages().toSet()
                if (outside(packages)) {
                    kotlinx.coroutines.delay(400)
                    packages = screen.accessPackages().toSet()
                }
                if (outside(packages)) throw PhoneException(PhoneFailure.APP_SCOPE, "An app outside this session needs the user's attention")
                return packages.filterNotNull().toSet()
            }

            override suspend fun read(): DeviceFrame {
                check(!closed) { "Device session closed" }
                scope()
                val snapshot = screen.readForControl()
                val packages = scope()
                latest = snapshot
                val windows = snapshot.windows.joinToString(";") { "${it.id}:${it.layer}:${it.type}:${it.active}:${it.focused}" }
                return DeviceFrame(snapshot.packageName ?: snapshot.unreadableApp, packages, snapshot.width, snapshot.height,
                    snapshot.elements.map { e -> DeviceElement(e.ref, e.role, if (e.secret) "" else e.name, e.bounds,
                        e.resourceId, e.clickable, e.editable, e.scrollable, e.secret, UiStates.DISABLED !in e.states, e.rangeMin, e.rangeMax, e.rangeCurrent) },
                    "${display.current?.displayId}:$windows", snapshot.protected, snapshot.changedDuringRead, snapshot.opened?.onUserScreen == true)
            }

            override suspend fun perform(action: PhoneAction, target: DeviceElement?): DeviceOutcome {
                if (action !is PhoneAction.Launch) scope()
                check(!isLocked()) { "Unlock the phone to continue" }
                val snapshotId = latest?.snapshotId
                // Only registered targets from the engine's fresh read reach these mechanisms.
                val result = when (action) {
                    is PhoneAction.Launch -> {
                        require(action.packageName in allowed)
                        screen.openApp(action.packageName, cold = action.restart)
                    }
                    is PhoneAction.SetProgress -> screen.setProgress(requireNotNull(target).key, requireNotNull(snapshotId), action.value)
                    PhoneAction.Submit -> screen.submitField(requireNotNull(target).key, requireNotNull(snapshotId))
                    PhoneAction.Tap -> screen.tapRef(requireNotNull(target).key, requireNotNull(snapshotId))
                    is PhoneAction.Type -> screen.typeText(requireNotNull(target).key, snapshotId, action.text)
                    is PhoneAction.Scroll -> screen.scroll(target?.key, snapshotId, action.forward)
                    PhoneAction.Back -> screen.back()
                    // Display pixels, already checked against the screenshot by the engine.
                    is PhoneAction.TapAt -> screen.tapXY(action.x, action.y)
                    is PhoneAction.TypeAt -> screen.typeAt(action.x, action.y, action.text)
                }
                latest = null
                return when (result) {
                    is ActionResult.Ok -> DeviceOutcome(true, result.hint, result.changed, result.verification?.wire)
                    is ActionResult.Failed -> DeviceOutcome(false, listOfNotNull(result.reason, result.hint).joinToString(" "))
                }
            }

            override suspend fun awaitChange(timeoutMs: Long) { screen.awaitChange(timeoutMs) }

            override suspend fun preview(): DevicePreview? {
                val frame = display.current?.latestFrameBitmap() ?: return null
                try {
                    val scale = minOf(1.0, 720.0 / maxOf(frame.width, frame.height))
                    val small = Bitmap.createScaledBitmap(frame, (frame.width * scale).toInt().coerceAtLeast(1), (frame.height * scale).toInt().coerceAtLeast(1), true)
                    try {
                        val bytes = ByteArrayOutputStream().use { out -> small.compress(Bitmap.CompressFormat.JPEG, 75, out); out.toByteArray() }
                        return DevicePreview(bytes, "image/jpeg", small.width, small.height)
                    } finally { if (small !== frame) small.recycle() }
                } finally { frame.recycle() }
            }

            override suspend fun lookImage(): DevicePreview? {
                val frame = display.current?.latestFrameBitmap() ?: return null
                try {
                    // Larger than the preview, with labelled rulers: models place points by reading the grid.
                    val scale = minOf(1.0, LOOK_MAX_PX / maxOf(frame.width, frame.height))
                    val shot = Bitmap.createScaledBitmap(frame, (frame.width * scale).toInt().coerceAtLeast(1), (frame.height * scale).toInt().coerceAtLeast(1), true)
                        .let { scaled -> scaled.copy(Bitmap.Config.ARGB_8888, true).also { if (it !== scaled && scaled !== frame) scaled.recycle() } }
                    try {
                        ScreenshotGrid.draw(shot)
                        val bytes = ByteArrayOutputStream().use { out -> shot.compress(Bitmap.CompressFormat.JPEG, 80, out); out.toByteArray() }
                        return DevicePreview(bytes, "image/jpeg", shot.width, shot.height)
                    } finally { shot.recycle() }
                } finally { frame.recycle() }
            }

            override suspend fun handoff() {
                val task = checkNotNull(screen.target.value) { "No app is open" }
                check(helper.moveTask(task.taskId, Display.DEFAULT_DISPLAY)) { "Could not hand the app to the user" }
                handedOver = true
                latest = null
            }

            override suspend fun resume() {
                val task = checkNotNull(screen.target.value) { "No app is open" }
                check(helper.moveTask(task.taskId, display.get().displayId)) { "Could not return the app to Copilot" }
                handedOver = false
                latest = null
            }

            override suspend fun close() {
                if (closed) return
                closed = true
                PhoneScope.state = AppAccessState(available = false, revision = PhoneScope.state.revision + 1)
                withContext(Dispatchers.IO) {
                    runCatching { helper.restoreClip() }
                    display.current?.let { runCatching { helper.finishDisplay(it.displayId, emptyArray(), emptyArray()) } }
                }
                try { withContext(Dispatchers.Main) { display.current?.release() } }
                finally { onClosed() }
            }
        }
    }
}
