// Derived from Mika, Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.platform
import android.content.Context
import org.pkuinfo.harness.phone.helper.HelperHub
import org.pkuinfo.harness.phone.connection.BuiltinShellManager
import org.pkuinfo.harness.phone.connection.protocol.RecoveryConsent

/** Process-wide phone services, including early Binder handoff before React starts. */
class PhonePlatform private constructor(context: Context) {
    val hub = HelperHub(context)
    val shellManager = BuiltinShellManager(context, hub) { RecoveryConsent() }
    companion object {
        @Volatile private var instance: PhonePlatform? = null
        fun of(context: Context): PhonePlatform = instance ?: synchronized(this) {
            instance ?: PhonePlatform(context.applicationContext).also { instance = it }
        }
    }
}
