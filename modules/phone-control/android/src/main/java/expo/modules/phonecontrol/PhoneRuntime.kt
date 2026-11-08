package expo.modules.phonecontrol

import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.util.Base64
import org.pkuinfo.harness.phone.core.*
import org.pkuinfo.harness.phone.connection.protocol.BuiltinShellStatus
import org.pkuinfo.harness.phone.platform.AndroidDevicePort
import org.pkuinfo.harness.phone.platform.PhonePlatform
import org.pkuinfo.harness.phone.platform.accessibility.ScreenAccessibility
import org.pkuinfo.harness.phone.platform.text.ResourceTexts
import org.pkuinfo.harness.phone.platform.text.UiText
import org.pkuinfo.harness.phone.policy.PhoneActionPolicy

/** Expo-facing adapter. Session rules live in the Harness core; Android details live in DevicePort. */
object PhoneRuntime {
    @Volatile private var control: PhoneEngine? = null
    @Volatile private var sessionIdentity: String? = null

    fun initialize(context: Context) {
        UiText.source = ResourceTexts { context.applicationContext.resources }
    }

    private fun engine(context: Context): PhoneEngine = control ?: synchronized(this) {
        control ?: PhoneEngine(AndroidDevicePort(context.applicationContext) { CopilotService.stop(context) },
            PhoneActionPolicy(), context.packageName).also { control = it }
    }

    fun pause(id: String, paused: Boolean) { control?.pause(id, paused) }

    fun activeId(): String? = control?.state()?.id

    fun readiness(context: Context): Map<String, Any?> {
        initialize(context)
        val platform = PhonePlatform.of(context)
        val helper = platform.shellManager.engine.status.value
        val session = control?.state()
        return mapOf(
            "supported" to (Build.VERSION.SDK_INT >= 31),
            "accessibility" to (ScreenAccessibility.instance.value != null),
            "helper" to (platform.hub.shell.value != null),
            "helperStatus" to when (helper) {
                BuiltinShellStatus.NotPaired -> "not-paired"
                BuiltinShellStatus.WirelessDebuggingOff -> "wireless-off"
                BuiltinShellStatus.Connecting -> "connecting"
                BuiltinShellStatus.Running -> "running"
                is BuiltinShellStatus.Failed -> "failed"
            },
            "helperFailure" to (helper as? BuiltinShellStatus.Failed)?.reason?.name,
            "locked" to context.getSystemService(KeyguardManager::class.java).isKeyguardLocked,
            "sessionId" to session?.id,
            "packages" to (session?.packages?.toList() ?: emptyList<String>()),
            "handedOver" to (session?.handedOver == true),
            "paused" to (session?.paused == true),
        )
    }

    suspend fun begin(context: Context, packages: List<String>): Map<String, Any?> {
        require(packages.size <= 20) { "Choose up to 20 apps" }
        val opened = engine(context).begin(packages.toSet())
        sessionIdentity = opened.id
        try { CopilotService.start(context, opened.id) }
        catch (error: Throwable) { end(context, opened.id); throw error }
        return mapOf("sessionId" to opened.id, "packages" to opened.packages.toList())
    }

    suspend fun preview(context: Context, id: String): Map<String, Any?>? {
        val image = engine(context).preview(id) ?: return null
        return mapOf("uri" to "data:${image.mimeType};base64,${Base64.encodeToString(image.bytes, Base64.NO_WRAP)}",
            "width" to image.width, "height" to image.height)
    }

    suspend fun assessTap(id: String, snapshotId: String, ref: String, submit: Boolean = false): Map<String, Any?> =
        trackOperation(id, "review") { assessTarget(id, snapshotId, ref, submit) }

    private suspend fun assessTarget(id: String, snapshotId: String, ref: String, submit: Boolean): Map<String, Any?> {
        val assessment = checkNotNull(control) { "Start a phone session first" }.assess(id, snapshotId, ref, submit)
        check(assessment.effect != PhoneEffect.MONEY) { "Hand payment or purchase confirmation to the user" }
        return mapOf("effect" to assessment.effect.name.lowercase(),
            "target" to mapOf("label" to assessment.label.take(240), "context" to (assessment.packageName ?: "")))
    }

    suspend fun execute(context: Context, id: String, operation: String, args: Map<String, Any?>): Map<String, Any?> =
        trackOperation(id, operation) { executeOperation(context, id, operation, args) }

    private suspend fun trackOperation(id: String, operation: String, block: suspend () -> Map<String, Any?>): Map<String, Any?> {
        val ticket = PhoneOverlayBridge.startOperation(id, operation)
        try {
            val result = block()
            PhoneOverlayBridge.finishOperation(ticket, result["ok"] == false)
            return result
        } catch (error: Throwable) {
            PhoneOverlayBridge.finishOperation(ticket, true)
            throw error
        }
    }

    private suspend fun executeOperation(context: Context, id: String, operation: String, args: Map<String, Any?>): Map<String, Any?> {
        val engine = engine(context)
        if (operation == "observe") return wire(engine.observe(id))
        if (operation == "wait") return wire(engine.waitForChange(id, (args["timeoutMs"] as? Number)?.toLong() ?: 1_000))
        val snapshotId = args["snapshotId"] as? String
        val ref = args["ref"] as? String
        val action = when (operation) {
            "launch" -> PhoneAction.Launch(requireNotNull(args["packageName"] as? String) { "App package is required" }, args["restart"] == true)
            "tap" -> PhoneAction.Tap
            "submit" -> PhoneAction.Submit
            "setProgress" -> PhoneAction.SetProgress(requireNotNull(args["value"] as? Number).toFloat())
            "type" -> PhoneAction.Type(requireNotNull(args["text"] as? String) { "Text is required" })
            "scroll" -> {
                require(args["direction"] == "up" || args["direction"] == "down") { "Invalid scroll direction" }
                PhoneAction.Scroll(args["direction"] == "down")
            }
            "back" -> PhoneAction.Back
            else -> error("Unknown phone operation")
        }
        val approval = if (action == PhoneAction.Tap || action == PhoneAction.Submit) engine.assess(id, requireNotNull(snapshotId), requireNotNull(ref), action == PhoneAction.Submit).also {
            check(args["authorizedEffect"] == it.effect.name.lowercase()) { "The action no longer matches its approved permission" }
        } else null
        val result = engine.execute(id, action, snapshotId, ref, approval)
        return mapOf("ok" to result.outcome.ok, "hint" to result.outcome.message,
            "changed" to result.outcome.changed, "verification" to result.outcome.verification,
            "screen" to wire(result.observation))
    }

    suspend fun readBrightness(context: Context, id: String): Map<String, Any?> = trackOperation(id, "readBrightness") {
        brightnessWire(engine(context).readBrightness(id))
    }

    suspend fun setBrightness(context: Context, id: String, percent: Float, adaptive: Boolean?): Map<String, Any?> = trackOperation(id, "setBrightness") {
        val change = engine(context).setBrightness(id, percent, adaptive)
        mapOf("before" to brightnessWire(change.before), "after" to brightnessWire(change.after),
            "requestedPercent" to change.requestedPercent, "verified" to change.verified)
    }

    private fun brightnessWire(value: DeviceBrightness): Map<String, Any?> = mapOf(
        "displayId" to value.displayId, "percent" to value.percent, "linear" to value.linear,
        "minimum" to value.minimum, "maximum" to value.maximum, "adaptive" to value.adaptive)

    fun requestStop(id: String? = null) { (id ?: sessionIdentity)?.let { control?.requestStop(it) } }

    suspend fun end(context: Context, id: String? = null) {
        val target = id ?: sessionIdentity ?: return
        engine(context).end(target)
        if (sessionIdentity == target) sessionIdentity = null
    }

    suspend fun takeover(context: Context, id: String) = engine(context).handoff(id)
    suspend fun handback(context: Context, id: String) = engine(context).resume(id)

    private fun wire(snapshot: PhoneObservation): Map<String, Any?> = mapOf(
        "sessionId" to snapshot.sessionId, "snapshotId" to snapshot.snapshotId,
        "packageName" to snapshot.packageName, "width" to snapshot.width, "height" to snapshot.height,
        "protected" to snapshot.protected, "changedDuringRead" to snapshot.unstable, "handoff" to snapshot.needsUser,
        "elements" to snapshot.targets.map { target -> target.element.let { e -> mapOf(
            "ref" to target.ref, "role" to e.role, "text" to e.text, "bounds" to e.bounds,
            "resourceId" to e.resourceId, "clickable" to e.clickable, "editable" to e.editable,
            "scrollable" to e.scrollable, "secret" to e.secret,
            "range" to e.rangeMin?.let { mapOf("min" to it, "max" to e.rangeMax, "current" to e.rangeCurrent) },
        ) } },
    )
}
