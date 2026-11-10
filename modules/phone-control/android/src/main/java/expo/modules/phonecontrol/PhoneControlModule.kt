package expo.modules.phonecontrol

import org.pkuinfo.harness.phone.connection.DeveloperSettings
import org.pkuinfo.harness.phone.connection.protocol.PairingCode
import org.pkuinfo.harness.phone.core.PhoneException
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.Base64
import java.io.ByteArrayOutputStream
import android.content.Intent
import android.net.Uri
import android.content.ComponentName
import android.os.Bundle
import android.provider.Settings
import org.pkuinfo.harness.phone.platform.PhonePlatform
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PhoneControlModule : Module() {
    private val context get() = requireNotNull(appContext.reactContext).applicationContext

    private fun copilotService() = ComponentName(context.packageName, "org.pkuinfo.harness.phone.platform.accessibility.PhoneAccessibilityService").flattenToString()


    private suspend fun result(block: suspend () -> Map<String, Any?>): Map<String, Any?> = try { block() }
        catch (error: PhoneException) { mapOf("nativeError" to mapOf("code" to error.code.name, "message" to error.message)) }

    override fun definition() = ModuleDefinition {
        Name("PhoneControl")
        Events("onOverlayAnswer", "onControlStopped")
        OnCreate {
            PhoneOverlayBridge.onControlStopped = { sessionId ->
                sendEvent("onControlStopped", mapOf("sessionId" to sessionId))
            }
            PhoneOverlayBridge.onAnswer = { request, allowed ->
                sendEvent("onOverlayAnswer", mapOf("id" to request.id, "sessionId" to request.sessionId, "allowed" to allowed))
            }
            PhoneRuntime.initialize(context)
            PhonePlatform.of(context).start()
        }
        OnDestroy { PhoneOverlayBridge.onControlStopped = null; PhoneOverlayBridge.status = null; PhoneOverlayBridge.onAnswer = null; PhoneOverlayBridge.update(null) }
        AsyncFunction("overlayStatus") { value: Map<String, Any?>? ->
            val id = value?.get("sessionId") as? String
            val phase = value?.get("phase") as? String
            PhoneOverlayBridge.status = if (id != null && id == PhoneRuntime.activeId() && phase in setOf("waiting", "thinking", "working", "attention"))
                PhoneOverlayBridge.Status(id, phase!!, (value?.get("title") as? String).orEmpty().take(160)) else null
        }
        AsyncFunction("overlayApproval") { value: Map<String, Any?>? ->
            val id = value?.get("sessionId") as? String
            PhoneOverlayBridge.update(if (value != null && id != null && id == PhoneRuntime.activeId())
                PhoneOverlayBridge.Approval(id, (value["id"] as Number).toInt(), (value["title"] as String).take(240), (value["detail"] as String).take(1200)) else null)
        }
        AsyncFunction("readiness") { PhoneRuntime.readiness(context) }
        AsyncFunction("setup") Coroutine { kind: String ->
            // With the helper connected, accessibility needs no trip to Settings (and no restricted-setting prompt).
            if (kind == "accessibility" && withContext(Dispatchers.IO) { PhoneRuntime.enableAccessibility(context) }) return@Coroutine
            val intent = when (kind) {
                // The list, scrolled to Copilot's row and highlighted (Settings' fragment-args key).
                "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                    .putExtra(FRAGMENT_ARGS_KEY, copilotService())
                    .putExtra(SHOW_FRAGMENT_ARGS, Bundle().apply { putString(FRAGMENT_ARGS_KEY, copilotService()) })
                // Developer options, scrolled to and highlighting Wireless debugging. While they're off, About
                // phone instead, highlighting Build number (tapping it seven times turns them on).
                "wireless" -> {
                    val on = DeveloperSettings.developerOptions(context.contentResolver)
                    val key = if (on) "toggle_adb_wireless" else "build_number"
                    Intent(if (on) Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS else Settings.ACTION_DEVICE_INFO_SETTINGS)
                        .putExtra(FRAGMENT_ARGS_KEY, key)
                        .putExtra(SHOW_FRAGMENT_ARGS, Bundle().apply { putString(FRAGMENT_ARGS_KEY, key) })
                }
                // App info, where the ⋮ menu has "Allow restricted settings".
                "appInfo" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                else -> error("Unknown setup step")
            }
            // A fresh Settings task: otherwise Android may just bring back whatever Settings page was left open.
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        }
        // port null: use the pairing dialog found on this phone (mDNS), as the notification does.
        AsyncFunction("pair") Coroutine { raw: String, port: Int? ->
            val code = requireNotNull(PairingCode.normalize(raw)) { "Enter the six-digit pairing code" }
            require(port == null || port in 1..65535) { "Enter a valid port" }
            val platform = PhonePlatform.of(context)
            platform.start()
            platform.pairing.pair(code, port)
            PhoneRuntime.readiness(context)
        }
        // Look for Settings' pairing dialog and post the notification with the code box.
        AsyncFunction("startPairing") {
            val platform = PhonePlatform.of(context)
            platform.start()
            platform.pairing.begin()
            PhoneRuntime.readiness(context)
        }
        AsyncFunction("stopPairing") { PhonePlatform.of(context).pairing.end() }
        AsyncFunction("connect") Coroutine { port: Int? ->
            val platform = PhonePlatform.of(context)
            platform.start()
            val manager = platform.shellManager
            if (port != null) {
                require(port in 1..65535)
                manager.connectWithPort(port)
            } else manager.engine.retry()
            PhoneRuntime.readiness(context)
        }
        AsyncFunction("disconnect") Coroutine { ->
            PhoneRuntime.end(context)
            val platform = PhonePlatform.of(context)
            platform.pairing.end()
            // Take back what the helper granted while it is still connected, then forget the pairing.
            runCatching { platform.recovery.revokeAll() }
            platform.shellManager.engine.unpair()
        }
        AsyncFunction("apps") {
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val manager = context.packageManager
            val launchers = manager.queryIntentActivities(intent, 0).map { it.activityInfo.applicationInfo }
            // Android-owned companion windows are separately selectable; selecting Settings
            // never silently grants access to System UI or its search provider.
            val companions = listOf("com.android.systemui", "com.google.android.settings.intelligence")
                .mapNotNull { name -> runCatching { manager.getApplicationInfo(name, 0) }.getOrNull() }
            // Pinyin (and other scripts) in Latin letters, so the A–Z index files 微信 under W, not #.
            val latin = runCatching { android.icu.text.Transliterator.getInstance("Any-Latin; Latin-ASCII") }.getOrNull()
            (launchers + companions)
                .filter { it.packageName != context.packageName }
                .distinctBy { it.packageName }
                .map { val label = it.loadLabel(manager).toString()
                    mapOf("packageName" to it.packageName, "label" to label,
                    "sortKey" to (latin?.let { t -> runCatching { t.transliterate(label) }.getOrNull() } ?: label).trim().lowercase(),
                    "launchable" to (manager.getLaunchIntentForPackage(it.packageName) != null),
                    "iconUri" to runCatching {
                        val icon = it.loadIcon(manager)
                        val bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
                        try {
                            icon.setBounds(0, 0, bitmap.width, bitmap.height)
                            icon.draw(Canvas(bitmap))
                            val bytes = ByteArrayOutputStream().also { stream -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream) }.toByteArray()
                            "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                        } finally { bitmap.recycle() }
                    }.getOrNull()) }
                .sortedBy { it["sortKey"] as String }

        }
        AsyncFunction("begin") Coroutine { packages: List<String> -> PhoneRuntime.begin(context, packages) }
        AsyncFunction("allow") Coroutine { sessionId: String, packageName: String ->
            result { PhoneRuntime.allow(context, sessionId, packageName) }
        }
        AsyncFunction("preview") Coroutine { sessionId: String ->
            withContext(Dispatchers.Default) { PhoneRuntime.preview(context, sessionId) }
        }
        AsyncFunction("assessSubmit") Coroutine { sessionId: String, snapshotId: String, ref: String ->
            result { PhoneRuntime.assessTap(sessionId, snapshotId, ref, submit = true) }
        }
        AsyncFunction("assessTap") Coroutine { sessionId: String, snapshotId: String, ref: String ->
            result { PhoneRuntime.assessTap(sessionId, snapshotId, ref) }
        }
        AsyncFunction("assessAt") Coroutine { sessionId: String, snapshotId: String, x: Int, y: Int ->
            result { PhoneRuntime.assessAt(sessionId, snapshotId, x, y) }
        }
        AsyncFunction("execute") Coroutine { sessionId: String, operation: String, args: Map<String, Any?> ->
            result { withContext(Dispatchers.Default) { PhoneRuntime.execute(context, sessionId, operation, args) } }
        }
        AsyncFunction("readBrightness") Coroutine { sessionId: String ->
            result { withContext(Dispatchers.Default) { PhoneRuntime.readBrightness(context, sessionId) } }
        }
        AsyncFunction("setBrightness") Coroutine { sessionId: String, percent: Float, adaptive: Boolean? ->
            result { withContext(Dispatchers.Default) { PhoneRuntime.setBrightness(context, sessionId, percent, adaptive) } }
        }
        AsyncFunction("end") Coroutine { sessionId: String -> PhoneRuntime.end(context, sessionId) }
        AsyncFunction("takeover") Coroutine { sessionId: String -> PhoneRuntime.takeover(context, sessionId) }
        AsyncFunction("handback") Coroutine { sessionId: String -> PhoneRuntime.handback(context, sessionId) }
    }
}

private const val FRAGMENT_ARGS_KEY = ":settings:fragment_args_key"
private const val SHOW_FRAGMENT_ARGS = ":settings:show_fragment_args"
