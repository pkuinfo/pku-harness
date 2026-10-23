package expo.modules.smsconsent

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * SMS User Consent API: https://developers.google.com/identity/sms-retriever/user-consent/overview
 * startSmsUserConsent → SMS_RETRIEVED_ACTION broadcast with a consent intent → the system sheet
 * → onActivityResult with the message text (only after the user taps Allow). One request at a
 * time; a new awaitMessage() replaces the previous one.
 */
class SmsConsentModule : Module() {
  private var pending: Promise? = null
  private var receiver: BroadcastReceiver? = null
  private val requestCode = 0x5c0e

  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_UNAVAILABLE", "No React context", null)

  private fun finish(block: (Promise) -> Unit) {
    val p = pending ?: return
    pending = null
    unregister()
    block(p)
  }

  private fun unregister() {
    receiver?.let { runCatching { context.unregisterReceiver(it) } }
    receiver = null
  }

  override fun definition() = ModuleDefinition {
    Name("SmsConsent")

    AsyncFunction("awaitMessage") { senderPhone: String?, promise: Promise ->
      finish { it.reject("ERR_CANCELLED", "Replaced by a newer request", null) }
      pending = promise
      val r = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          if (intent.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
          val extras = intent.extras ?: return
          @Suppress("DEPRECATION")
          val status = extras.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return
          when (status.statusCode) {
            CommonStatusCodes.SUCCESS -> {
              @Suppress("DEPRECATION")
              val consent = extras.getParcelable<Intent>(SmsRetriever.EXTRA_CONSENT_INTENT)
              val activity = appContext.currentActivity
              if (consent == null || activity == null) {
                finish { it.reject("ERR_UNAVAILABLE", "No activity to show the consent sheet", null) }
              } else {
                activity.startActivityForResult(consent, requestCode)
              }
            }
            CommonStatusCodes.TIMEOUT -> finish { it.reject("ERR_TIMEOUT", "No SMS within 5 minutes", null) }
            else -> finish { it.reject("ERR_UNAVAILABLE", "SMS consent status ${status.statusCode}", null) }
          }
        }
      }
      receiver = r
      ContextCompat.registerReceiver(
        context,
        r,
        IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION),
        SmsRetriever.SEND_PERMISSION,
        null,
        ContextCompat.RECEIVER_EXPORTED,
      )
      SmsRetriever.getClient(context)
        .startSmsUserConsent(senderPhone)
        .addOnFailureListener { e -> finish { it.reject("ERR_UNAVAILABLE", e.message ?: "startSmsUserConsent failed", e) } }
    }

    Function("cancel") {
      finish { it.reject("ERR_CANCELLED", "Cancelled", null) }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != requestCode) return@OnActivityResult
      if (payload.resultCode == Activity.RESULT_OK) {
        val message = payload.data?.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE)
        if (message != null) finish { it.resolve(message) } else finish { it.reject("ERR_UNAVAILABLE", "Empty message", null) }
      } else {
        finish { it.reject("ERR_DENIED", "The user didn't allow reading the message", null) }
      }
    }

    OnDestroy { unregister() }
  }
}
