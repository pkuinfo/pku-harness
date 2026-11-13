package expo.modules.phonecontrol

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.PowerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * A Copilot task goes on with the screen off (its own display stays unlocked, a wake lock keeps the
 * CPU up). When it needs the user while the screen is off or locked, where the floating panel
 * can't be seen, this posts a heads-up notification that shows on the lock screen and turns the
 * screen on: once per approval and once per handoff. A call waiting for the screen to come back on
 * gets a quiet notice instead (no wake: the user turned it off). Each stays until its request is
 * settled (approval answered, handoff finished, screen back on).
 */
internal class CopilotAttention(private val context: Context, private val sessionId: String) {
    private val notifications = context.getSystemService(NotificationManager::class.java)
    private var shown: String? = null

    fun watch(scope: CoroutineScope): Job = scope.launch {
        notifications.createNotificationChannel(NotificationChannel(CHANNEL, context.getString(R.string.copilot_attention_channel), NotificationManager.IMPORTANCE_HIGH).apply {
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            enableVibration(true)
        })
        notifications.createNotificationChannel(NotificationChannel(QUIET, context.getString(R.string.copilot_attention_quiet_channel), NotificationManager.IMPORTANCE_LOW).apply {
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        })
        try {
            while (isActive) {
                tick()
                delay(1_000)
            }
        } finally { clear() }
    }

    private suspend fun tick() {
        val away = !context.getSystemService(PowerManager::class.java).isInteractive ||
            context.getSystemService(KeyguardManager::class.java).isKeyguardLocked
        val approval = PhoneOverlayBridge.approval?.takeIf { it.sessionId == sessionId }
        val handed = PhoneRuntime.activeId() == sessionId && PhoneRuntime.readiness(context)["handedOver"] == true
        // What needs the user right now, whether or not they can see the panel.
        val pending = when {
            approval != null -> "approval:${approval.id}"
            handed -> "handoff:${PhoneRuntime.handoffNote}"
            PhoneRuntime.waitingForScreen -> "screen"
            else -> null
        }
        // An alert stays until its request is settled (not just until the screen is on again).
        if (pending == shown) return
        clear()
        // Posted only while the panel can't be seen (screen off or locked).
        if (pending == null || !away) return
        val key = pending
        shown = key
        val screen = key == "screen"
        val (title, text) = when {
            approval != null -> context.getString(R.string.copilot_attention_approval) to approval.title
            screen -> context.getString(R.string.copilot_attention_screen) to context.getString(R.string.copilot_attention_screen_text)
            else -> context.getString(R.string.copilot_attention_handoff) to (PhoneRuntime.handoffNote ?: context.getString(R.string.copilot_handoff_hint))
        }
        // An approval is answered in PKU harness; after a handoff the app is already on the user's screen.
        val open = if (approval != null) context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?.let { PendingIntent.getActivity(context, ID, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) } else null
        val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName).takeIf { it != 0 } ?: android.R.drawable.ic_dialog_alert
        runCatching {
            notifications.notify(ID, Notification.Builder(context, if (screen) QUIET else CHANNEL)
                .setSmallIcon(icon)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(Notification.BigTextStyle().bigText(text))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .apply { if (open != null) setContentIntent(open) }
                // The user turned the screen off on purpose: a quiet channel, and no wake.
                .build())
        }
        if (!screen) wake()
    }

    /** Turn the screen on for a moment so the lock screen shows the request. */
    @Suppress("DEPRECATION")
    private fun wake() = runCatching {
        context.getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP, "PKUHarness:CopilotAttention")
            .acquire(5_000)
    }

    private fun clear() {
        if (shown != null) notifications.cancel(ID)
        shown = null
    }

    companion object {
        private const val CHANNEL = "copilot_attention"
        private const val QUIET = "copilot_status"
        private const val ID = 6802
    }
}
