// Derived from Mika (cap/phone/setup/BuiltinShellRecovery.kt), Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.connection

import android.content.Context
import android.database.ContentObserver
import android.os.Build
import android.provider.Settings
import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import org.pkuinfo.harness.phone.connection.protocol.A11yObservation
import org.pkuinfo.harness.phone.connection.protocol.AccessibilityList
import org.pkuinfo.harness.phone.connection.protocol.AccessibilityRepair
import org.pkuinfo.harness.phone.connection.protocol.BuiltinShellStatus
import org.pkuinfo.harness.phone.connection.protocol.PermissionCommands
import org.pkuinfo.harness.phone.connection.protocol.PermissionResult
import org.pkuinfo.harness.phone.connection.protocol.RecoveryCapability
import org.pkuinfo.harness.phone.connection.protocol.RecoveryConsent
import org.pkuinfo.harness.phone.connection.protocol.RecoveryConsentStore
import org.pkuinfo.harness.phone.connection.protocol.RecoveryPermissions
import org.pkuinfo.harness.phone.connection.protocol.RepairPhase
import org.pkuinfo.harness.phone.platform.accessibility.ScreenAccessibility

/** [RecoveryConsent] kept in this app's private preferences, so "already applied" survives restarts. */
class PrefsRecoveryConsentStore(context: Context) : RecoveryConsentStore {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val _consent = MutableStateFlow(load())
    override val consent: StateFlow<RecoveryConsent> = _consent.asStateFlow()

    @Synchronized
    override fun save(consent: RecoveryConsent) {
        prefs.edit()
            .putStringSet(APPLIED, consent.applied.map { it.name }.toSet())
            .putStringSet(DECLINED, consent.declined.map { it.name }.toSet())
            .apply()
        _consent.value = consent
    }

    private fun load() = RecoveryConsent(read(APPLIED), read(DECLINED))

    private fun read(key: String): Set<RecoveryCapability> =
        prefs.getStringSet(key, null).orEmpty().mapNotNull { name -> RecoveryCapability.entries.firstOrNull { it.name == name } }.toSet()

    private companion object {
        const val PREFS = "copilot_recovery"
        const val APPLIED = "applied"
        const val DECLINED = "declined"
    }
}

/**
 * What the connected helper does without a tap, each time it reaches Running (first pairing,
 * reconnect after a restart): lift Android 13's restricted-setting block, grant this app
 * WRITE_SECURE_SETTINGS (so Wireless debugging can be turned back on for reconnects), add it to
 * the battery allowlist and turn on Copilot's accessibility service. Notifications stay the user's
 * call (the system prompt): a deliberate "Don't allow" is never overridden.
 * Each capability is applied once ([RecoveryConsent.applied]); turning one off by hand in
 * system settings is respected afterwards. A service that is still enabled but not bound
 * (process killed, app updated) is re-bound by [AccessibilityRepair].
 */
class HelperRecovery(context: Context, private val manager: BuiltinShellManager, private val store: RecoveryConsentStore) {
    private val app = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var started = false

    val permissions = RecoveryPermissions(
        { manager.commandRunner.takeIf { manager.engine.status.value == BuiltinShellStatus.Running } },
        store, app.packageName,
    )

    val accessibilityRepair = AccessibilityRepair(
        restart = { gap -> permissions.restartAccessibility(gap) },
        consent = { store.consent.value },
    )

    /** True while the helper is applying its grants (the setup screen shows accessibility as turning on). */
    private val _applying = MutableStateFlow(false)

    /** Accessibility is about to be (or being) turned on without the user. */
    fun accessibilityPending(): Boolean {
        if (ScreenAccessibility.instance.value != null) return false
        if (_applying.value || accessibilityRepair.phase.value != RepairPhase.Idle) return true
        val consent = store.consent.value
        return manager.engine.status.value == BuiltinShellStatus.Running &&
            consent.wants(RecoveryCapability.Accessibility) && !consent.isApplied(RecoveryCapability.Accessibility)
    }

    @Synchronized
    fun start() {
        if (started || Build.VERSION.SDK_INT < BuiltinShellManager.MIN_SDK) return
        started = true
        scope.launch { manager.engine.status.collect { if (it == BuiltinShellStatus.Running) applyWhenRunning() } }
        scope.launch { accessibilityRepair.watch(boundObservation(), manager.engine.status) }
    }

    private suspend fun applyWhenRunning() {
        _applying.value = true
        try {
            val pkg = app.packageName
            // Before the accessibility write: apps installed from an APK file are otherwise blocked from it on Android 13+.
            if (Build.VERSION.SDK_INT >= 33) exec("appops set $pkg ACCESS_RESTRICTED_SETTINGS allow")
            val result = permissions.applyPending()
            if (result != PermissionResult.Done) Log.w(TAG, "automatic grants incomplete: $result")
        } finally {
            _applying.value = false
        }
    }

    /** One command through the helper; failures are logged, never thrown (each grant is best effort). */
    private suspend fun exec(command: String) {
        try {
            val out = manager.commandRunner.exec(PermissionCommands.checked(command))
            if (PermissionCommands.exitCode(out) != 0) Log.w(TAG, "'$command' failed: ${out.trim().take(200)}")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "'$command' failed", e)
        }
    }

    /**
     * The service as [AccessibilityRepair] should see it. Only a service that is still in the
     * system list but not bound counts as stuck: one removed from the list (the user turned it
     * off) is left off, and the setup screen offers the one-tap button instead.
     */
    private fun boundObservation(): StateFlow<A11yObservation> {
        val cr = app.contentResolver
        val me = PermissionCommands.accessibilityService(app.packageName)
        fun enabled() = AccessibilityList.contains(Settings.Secure.getString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES), me)
        fun observe(connected: Boolean): A11yObservation {
            val on = enabled()
            return A11yObservation(on, connected || !on)
        }
        val listChanges = callbackFlow {
            val observer = object : ContentObserver(null) {
                override fun onChange(selfChange: Boolean) { trySend(Unit) }
            }
            cr.registerContentObserver(Settings.Secure.getUriFor(Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES), false, observer)
            send(Unit)
            awaitClose { cr.unregisterContentObserver(observer) }
        }
        return combine(listChanges, ScreenAccessibility.instance) { _, service -> observe(service != null) }
            .stateIn(scope, SharingStarted.Eagerly, observe(ScreenAccessibility.instance.value != null))
    }

    /** Disconnecting the helper: take back what it granted while the connection is still there. */
    suspend fun revokeAll(): PermissionResult = permissions.revokeAll()

    private companion object {
        const val TAG = "HarnessRecovery"
    }
}
