package expo.modules.phonecontrol

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import org.pkuinfo.harness.phone.platform.PhonePlatform
import org.pkuinfo.harness.phone.platform.accessibility.ScreenAccessibility

/** Native session lifetime and an always available stop action. */
class CopilotService : Service() {
    private var sessionId: String? = null
    private var monitor: Job? = null
    private var overlay: CopilotOverlay? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            val stopped = intent.getStringExtra("sessionId")
            // A notification from an older session must not stop its replacement.
            if (stopped == null || stopped != sessionId) return START_NOT_STICKY
            PhoneRuntime.requestStop(stopped)
            PhoneOverlayBridge.onControlStopped?.invoke(stopped)
            scope.launch { PhoneRuntime.end(applicationContext, stopped) }
            stopSelf(startId)
            return START_NOT_STICKY
        }
        val started = intent?.getStringExtra("sessionId") ?: run {
            stopSelf(startId)
            return START_NOT_STICKY
        }
        if (PhoneRuntime.activeId() != started) {
            stopSelf(startId)
            return START_NOT_STICKY
        }
        sessionId = started
        overlay?.close()
        overlay = ScreenAccessibility.instance.value?.let { CopilotOverlay(it, started).also { panel -> panel.show() } }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.copilot_name), NotificationManager.IMPORTANCE_LOW))
        val stop = PendingIntent.getService(this, 0, Intent(this, CopilotService::class.java).setAction(STOP).putExtra("sessionId", sessionId), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle(getString(R.string.copilot_name))
            .setContentText(getString(R.string.copilot_running))
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, getString(R.string.copilot_stop), stop).build())
        if (launch != null) notification.setContentIntent(PendingIntent.getActivity(this, 1, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        startForeground(6801, notification.build())
        monitor?.cancel()
        monitor = scope.launch {
            combine(PhonePlatform.of(applicationContext).hub.shell, ScreenAccessibility.instance) { helper, accessibility ->
                helper != null && accessibility != null
            }.collect { available ->
                if (!available) {
                    PhoneRuntime.requestStop(started)
                    PhoneOverlayBridge.onControlStopped?.invoke(started)
                    PhoneRuntime.end(applicationContext, started)
                }
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        monitor?.cancel()
        overlay?.close(); overlay = null
        val ended = sessionId
        if (ended != null) {
            PhoneRuntime.requestStop(ended)
            scope.launch { PhoneRuntime.end(applicationContext, ended) }
        }
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "copilot"
        private const val STOP = "copilot.stop"
        fun start(context: Context, sessionId: String) { context.startForegroundService(Intent(context, CopilotService::class.java).putExtra("sessionId", sessionId)) }
        fun stop(context: Context) { context.stopService(Intent(context, CopilotService::class.java)) }
    }
}
