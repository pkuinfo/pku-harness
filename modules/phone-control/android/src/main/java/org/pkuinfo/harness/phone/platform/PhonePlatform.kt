// Derived from Mika, Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.platform
import android.content.Context
import org.pkuinfo.harness.phone.helper.HelperHub
import org.pkuinfo.harness.phone.connection.BuiltinShellManager
import org.pkuinfo.harness.phone.connection.HelperRecovery
import org.pkuinfo.harness.phone.connection.PairingCoordinator
import org.pkuinfo.harness.phone.connection.PrefsRecoveryConsentStore

/** Process-wide phone services, including early Binder handoff before React starts. */
class PhonePlatform private constructor(context: Context) {
    val hub = HelperHub(context)
    /** Which helper grants were applied (and any the user declined); "Auto Wireless debugging" reads it too. */
    val consent = PrefsRecoveryConsentStore(context)
    val shellManager = BuiltinShellManager(context, hub) { consent.consent.value }
    /** Grants applied without a tap whenever the helper reaches Running. */
    val recovery = HelperRecovery(context, shellManager, consent)
    /** Pairing through the notification code box. */
    val pairing by lazy { PairingCoordinator(context, shellManager.engine) }

    /** Watch the helper and apply grants when it runs. Idempotent. */
    fun start() {
        shellManager.start()
        recovery.start()
    }

    companion object {
        @Volatile private var instance: PhonePlatform? = null
        fun of(context: Context): PhonePlatform = instance ?: synchronized(this) {
            instance ?: PhonePlatform(context.applicationContext).also { instance = it }
        }
    }
}
