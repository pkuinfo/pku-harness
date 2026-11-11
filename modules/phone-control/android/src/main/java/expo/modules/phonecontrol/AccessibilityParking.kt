package expo.modules.phonecontrol

import android.content.Context
import android.content.pm.PackageManager
import android.provider.Settings
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import org.pkuinfo.harness.phone.connection.protocol.AccessibilityIdentity
import org.pkuinfo.harness.phone.connection.protocol.AccessibilityList
import org.pkuinfo.harness.phone.connection.protocol.PermissionCommands
import org.pkuinfo.harness.phone.platform.PhonePlatform
import org.pkuinfo.harness.phone.platform.accessibility.ScreenAccessibility

/**
 * Copilot's accessibility service is enabled only while a task runs, under a neutral name; a
 * screen-reader name (WeChat exposes its views only to screen readers) makes keyboards such as
 * Samsung Keyboard switch to screen-reader typing, where every key needs a second tap, so that
 * name is used only while Copilot operates WeChat ([AccessibilityIdentity]). Between tasks the
 * service is parked (taken out of the system list) and put back when the next task begins, and
 * checked again before every Copilot call (it may also have been switched off by the user or the
 * system meanwhile; [ensureOn]).
 * It parks only when that can be undone without the user: this app holds WRITE_SECURE_SETTINGS,
 * or the helper is connected. Otherwise it stays on, as before.
 */
internal object AccessibilityParking {
    private const val TAG = "CopilotParking"
    private const val PREFS = "copilot_accessibility"
    private const val PARKED = "parked"
    private const val TALKBACK_NEEDED = "wechat_needs_talkback"
    /** A service bound with no task (app start, enabled from Settings) parks after this. */
    private const val IDLE_MS = 20_000L
    private const val BIND_TIMEOUT_MS = 6_000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    @Volatile private var watching: Job? = null

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun parked(context: Context): Boolean = prefs(context).getBoolean(PARKED, false)

    private fun setParked(context: Context, value: Boolean) = prefs(context).edit().putBoolean(PARKED, value).apply()

    private fun canWriteDirectly(context: Context) =
        context.checkSelfPermission(PermissionCommands.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED

    fun canRestore(context: Context): Boolean =
        canWriteDirectly(context) || PhonePlatform.of(context).hub.shell.value != null


    /** Park whenever the service sits bound without a task for a while. Idempotent. */
    fun watch(context: Context, busy: () -> Boolean) {
        if (watching != null) return
        val app = context.applicationContext
        watching = scope.launch {
            ScreenAccessibility.instance.collectLatest { service ->
                if (service == null) return@collectLatest
                delay(IDLE_MS)
                if (!busy()) park(app)
            }
        }
    }

    /** Take the service out of the system list between tasks. True when it is parked now. */
    fun park(context: Context): Boolean {
        val service = ScreenAccessibility.instance.value ?: return parked(context)
        if (!canRestore(context)) return false
        setParked(context, true)
        val removed = runCatching {
            if (canWriteDirectly(context)) write(context, on = false) else { service.disableSelf(); true }
        }.getOrDefault(false)
        if (!removed) setParked(context, false)
        Log.i(TAG, if (removed) "parked between tasks" else "could not park")
        return removed
    }

    /** The name the next Copilot call needs (set per call by PhoneRuntime; see [AccessibilityIdentity]). */
    @Volatile var desired: AccessibilityIdentity = AccessibilityIdentity.Neutral
    private val switching = Mutex()

    /** The screen-reader name WeChat responded to on this phone: TalkMan until it proved not enough. */
    fun screenReaderIdentity(context: Context): AccessibilityIdentity =
        if (prefs(context).getBoolean(TALKBACK_NEEDED, false)) AccessibilityIdentity.TalkBack else AccessibilityIdentity.TalkMan

    /** TalkMan's name did not make WeChat show its views here: use TalkBack's from now on. */
    fun needTalkBack(context: Context) = prefs(context).edit().putBoolean(TALKBACK_NEEDED, true).apply()

    /**
     * Before a task and before every Copilot call: make sure the service is bound under [identity].
     * When it is off, whether Copilot parked it, the user switched it off in Settings, or the
     * system dropped it, turn it back on; when it runs under another name, switch (this app's own
     * secure-settings permission, else the connected helper) and wait for Android to bind it.
     * A service that can't be switched keeps working under its current name. False only when it
     * is off and cannot be turned on without the user.
     */
    suspend fun ensureOn(context: Context, identity: AccessibilityIdentity = desired): Boolean = switching.withLock {
        val bound = ScreenAccessibility.instance.value
        if (bound != null && AccessibilityIdentity.ofClass(bound.javaClass.name) == identity) return@withLock true
        val written = runCatching { if (canWriteDirectly(context)) write(context, on = true, identity) else PhoneRuntime.enableAccessibility(context, identity) }
            .getOrDefault(false)
        if (!written) {
            Log.i(TAG, if (bound != null) "can't switch to ${identity.name}; staying ${bound.javaClass.simpleName}" else "off and could not be turned on")
            return@withLock bound != null
        }
        val ready = withTimeoutOrNull(BIND_TIMEOUT_MS) { ScreenAccessibility.instance.first { it != null && it.javaClass.name == identity.className } } != null
        if (ready) setParked(context, false)
        Log.i(TAG, if (ready) "on as ${identity.name}" else "written as ${identity.name} but not bound yet")
        ready || ScreenAccessibility.instance.value != null
    }

    /** This app's own secure-settings write; other services in the list stay as they are. */
    private fun write(context: Context, on: Boolean, identity: AccessibilityIdentity = AccessibilityIdentity.Neutral): Boolean {
        val cr = context.contentResolver
        val current = Settings.Secure.getString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        val next = PermissionCommands.accessibilityList(current, context.packageName, on, identity)
        if (next.isEmpty()) {
            Settings.Secure.putString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, "")
            Settings.Secure.putInt(cr, Settings.Secure.ACCESSIBILITY_ENABLED, 0)
        } else {
            Settings.Secure.putString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, next)
            Settings.Secure.putInt(cr, Settings.Secure.ACCESSIBILITY_ENABLED, 1)
        }
        val now = Settings.Secure.getString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        return if (on) AccessibilityList.contains(now, PermissionCommands.accessibilityService(context.packageName, identity))
        else !AccessibilityList.containsAny(now, PermissionCommands.ownServices(context.packageName))
    }
}
