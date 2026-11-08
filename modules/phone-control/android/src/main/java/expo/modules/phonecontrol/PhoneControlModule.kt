package expo.modules.phonecontrol

import android.content.Intent
import android.provider.Settings
import org.pkuinfo.harness.phone.platform.PhonePlatform
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PhoneControlModule : Module() {
    private val context get() = requireNotNull(appContext.reactContext).applicationContext

    override fun definition() = ModuleDefinition {
        Name("PhoneControl")
        OnCreate {
            PhoneRuntime.initialize(context)
            PhonePlatform.of(context).shellManager.start()
        }
        AsyncFunction("readiness") { PhoneRuntime.readiness(context) }
        AsyncFunction("setup") { kind: String ->
            val action = when (kind) {
                "accessibility" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
                "wireless" -> Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS
                else -> error("Unknown setup step")
            }
            context.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        AsyncFunction("pair") Coroutine { code: String, port: Int ->
            require(code.matches(Regex("[0-9]{6}")) && port in 1..65535) { "Enter a six-digit pairing code and valid port" }
            val manager = PhonePlatform.of(context).shellManager
            manager.start()
            manager.engine.startPairing(code, port)
            PhoneRuntime.readiness(context)
        }
        AsyncFunction("connect") Coroutine { port: Int? ->
            val manager = PhonePlatform.of(context).shellManager
            manager.start()
            if (port != null) {
                require(port in 1..65535)
                manager.connectWithPort(port)
            } else manager.engine.retry()
            PhoneRuntime.readiness(context)
        }
        AsyncFunction("disconnect") Coroutine { ->
            PhoneRuntime.end(context)
            PhonePlatform.of(context).shellManager.engine.unpair()
        }
        AsyncFunction("apps") {
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            context.packageManager.queryIntentActivities(intent, 0)
                .filter { it.activityInfo.packageName != context.packageName }
                .distinctBy { it.activityInfo.packageName }
                .map { mapOf("packageName" to it.activityInfo.packageName, "label" to it.loadLabel(context.packageManager).toString()) }
                .sortedBy { it["label"] }
        }
        AsyncFunction("begin") Coroutine { packages: List<String> -> PhoneRuntime.begin(context, packages) }
        AsyncFunction("preview") Coroutine { sessionId: String ->
            withContext(Dispatchers.Default) { PhoneRuntime.preview(context, sessionId) }
        }
        AsyncFunction("assessTap") Coroutine { sessionId: String, snapshotId: String, ref: String ->
            PhoneRuntime.assessTap(sessionId, snapshotId, ref)
        }
        AsyncFunction("execute") Coroutine { sessionId: String, operation: String, args: Map<String, Any?> ->
            withContext(Dispatchers.Default) { PhoneRuntime.execute(context, sessionId, operation, args) }
        }
        AsyncFunction("end") Coroutine { sessionId: String -> PhoneRuntime.end(context, sessionId) }
        AsyncFunction("takeover") Coroutine { sessionId: String -> PhoneRuntime.takeover(context, sessionId) }
        AsyncFunction("handback") Coroutine { sessionId: String -> PhoneRuntime.handback(context, sessionId) }
    }
}
