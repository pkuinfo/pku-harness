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
import kotlinx.coroutines.withTimeoutOrNull
import org.pkuinfo.harness.phone.connection.protocol.AccessibilityList
import org.pkuinfo.harness.phone.connection.protocol.PermissionCommands
import org.pkuinfo.harness.phone.platform.PhonePlatform
import org.pkuinfo.harness.phone.platform.accessibility.ScreenAccessibility

/**
 * Copilot's accessibility service is enabled only while a task runs. Its TalkBack-compatible class
 * name (WeChat exposes its views only to TalkBack) also makes keyboards such as Samsung Keyboard
 * switch to screen-reader typing, where every key needs a second tap. So between tasks the
 * service is parked (taken out of the system list) and put back when the next task begins.
 * It parks only when that can be undone without the user: this app holds WRITE_SECURE_SETTINGS,
 * or the helper is connected. Otherwise it stays on, as before.
 */
internal object AccessibilityParking {
    private const val TAG = "CopilotParking"
    private const val PREFS = "copilot_accessibility"
    private const val PARKED = "parked"
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

    /** Parked and able to come back: readiness counts the service as available. */
    fun ready(context: Context): Boolean = parked(context) && canRestore(context)

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

    /**
     * Before a task: put a parked service back and wait for Android to bind it. True when the
     * service is running; false when it was not parked or could not be restored.
     */
    suspend fun unpark(context: Context): Boolean {
        if (ScreenAccessibility.instance.value != null) return true
        if (!parked(context)) return false
        val written = runCatching { if (canWriteDirectly(context)) write(context, on = true) else PhoneRuntime.enableAccessibility(context) }
            .getOrDefault(false)
        if (!written) return false
        val bound = withTimeoutOrNull(BIND_TIMEOUT_MS) { ScreenAccessibility.instance.first { it != null } } != null
        if (bound) setParked(context, false)
        Log.i(TAG, if (bound) "back on for a task" else "written back but not bound yet")
        return bound
    }

    /** This app's own secure-settings write; other services in the list stay as they are. */
    private fun write(context: Context, on: Boolean): Boolean {
        val cr = context.contentResolver
        val current = Settings.Secure.getString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        val next = PermissionCommands.accessibilityList(current, context.packageName, on)
        if (next.isEmpty()) {
            Settings.Secure.putString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, "")
            Settings.Secure.putInt(cr, Settings.Secure.ACCESSIBILITY_ENABLED, 0)
        } else {
            Settings.Secure.putString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, next)
            Settings.Secure.putInt(cr, Settings.Secure.ACCESSIBILITY_ENABLED, 1)
        }
        return AccessibilityList.contains(Settings.Secure.getString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES), PermissionCommands.accessibilityService(context.packageName)) == on
    }
}
