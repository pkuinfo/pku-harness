package org.pkuinfo.harness.phone.platform

import android.app.KeyguardManager
import android.content.Context
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

/** Adapts internal Android mechanisms to the Harness session engine's small platform contract. */
class AndroidDevicePort(private val context: Context, private val onClosed: () -> Unit = {}) : DevicePort {
    override suspend fun open(allowedPackages: Set<String>): DeviceSession {
        check(Build.VERSION.SDK_INT >= 31) { "Phone control requires Android 12 or newer" }
        val accessibility = checkNotNull(ScreenAccessibility.instance.value) { "Enable Copilot accessibility first" }
        val helper = checkNotNull(PhonePlatform.of(context).hub.shell.value) { "Connect the phone helper first" }
        for (name in allowedPackages) check(context.packageManager.getLaunchIntentForPackage(name) != null) { "App is not installed or cannot be launched: $name" }
        val metrics = context.resources.displayMetrics
        val display = LazyDisplay(metrics.widthPixels, metrics.heightPixels) {
            withContext(Dispatchers.Main) { AgentDisplay(helper, metrics.widthPixels, metrics.heightPixels, metrics.densityDpi, context.getSystemService(DisplayManager::class.java)) }
        }
        val blocked = context.packageManager.getInstalledApplications(0).map { it.packageName }.toSet() - allowedPackages
        PhoneScope.state = AppAccessState(blocked = blocked + context.packageName, revision = PhoneScope.state.revision + 1)
        return object : DeviceSession {
            private var handedOver = false
            private var latest: ScreenSnapshot? = null
            private var closed = false
            private val screen = AndroidScreenDriver(accessibility, helper, display, handedOver = { handedOver }, appAccess = PhoneScope.policy)

            override suspend fun isLocked() = context.getSystemService(KeyguardManager::class.java).isKeyguardLocked

            private suspend fun scope(): Set<String?> {
                val packages = screen.accessPackages().toSet()
                if (packages.any { it == null || it !in allowedPackages }) throw PhoneException(PhoneFailure.APP_SCOPE, "An app outside this session needs the user's attention")
                return packages
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
                        e.resourceId, e.clickable, e.editable, e.scrollable, e.secret, UiStates.DISABLED !in e.states) },
                    "${display.current?.displayId}:$windows", snapshot.protected, snapshot.changedDuringRead, snapshot.opened?.onUserScreen == true)
            }

            override suspend fun perform(action: PhoneAction, target: DeviceElement?): DeviceOutcome {
                scope()
                check(!isLocked()) { "Unlock the phone to continue" }
                val snapshotId = latest?.snapshotId
                // Only registered targets from the engine's fresh read reach these mechanisms.
                val result = when (action) {
                    is PhoneAction.Launch -> {
                        require(action.packageName in allowedPackages)
                        screen.openApp(action.packageName)
                    }
                    PhoneAction.Tap -> screen.tapRef(requireNotNull(target).key, requireNotNull(snapshotId))
                    is PhoneAction.Type -> screen.typeText(requireNotNull(target).key, snapshotId, action.text)
                    is PhoneAction.Scroll -> screen.scroll(target?.key, snapshotId, action.forward)
                    PhoneAction.Back -> screen.back()
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
