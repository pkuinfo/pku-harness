// Derived from Mika (cap/phone/setup/PairingNotifier.kt), Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.connection

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.annotation.StringRes
import expo.modules.phonecontrol.R
import org.pkuinfo.harness.phone.connection.protocol.BuiltinShellFailure
import org.pkuinfo.harness.phone.connection.protocol.BuiltinShellFix
import org.pkuinfo.harness.phone.connection.protocol.BuiltinShellStatus
import org.pkuinfo.harness.phone.connection.protocol.PairingDiscovery

/** What the pairing notification shows right now. */
sealed interface PairingNotice {
    /**
     * The "Enter code" reply box. [error] explains why the last code didn't work; the box stays.
     * [quiet]: posted to the shade without sound or pop-up while the pairing dialog isn't found
     * yet (the system may freeze Harness in the background once Settings is in front, so the
     * box must already be there when the user pulls the shade down).
     */
    data class EnterCode(val port: Int?, @StringRes val error: Int? = null, val quiet: Boolean = false) : PairingNotice
    data object Working : PairingNotice
    data object Done : PairingNotice
    /** Paired, but the helper didn't connect: the setup screen explains what to do. */
    data object Problem : PairingNotice

    companion object {
        fun of(status: BuiltinShellStatus, discovery: PairingDiscovery): PairingNotice? {
            val port = (discovery as? PairingDiscovery.Found)?.port
            return when (status) {
                BuiltinShellStatus.Running -> Done
                BuiltinShellStatus.Connecting -> Working
                is BuiltinShellStatus.Failed -> when {
                    status.reason.duringPairing -> EnterCode(port, retryText(status.reason))
                    status.fix == BuiltinShellFix.RePair && port != null -> EnterCode(port)
                    status.fix == BuiltinShellFix.RePair && discovery == PairingDiscovery.Searching -> EnterCode(null, quiet = true)
                    else -> Problem
                }
                BuiltinShellStatus.NotPaired, BuiltinShellStatus.WirelessDebuggingOff -> when (discovery) {
                    is PairingDiscovery.Found -> EnterCode(discovery.port)
                    PairingDiscovery.Searching -> EnterCode(null, quiet = true)
                    PairingDiscovery.Idle -> null
                }
            }
        }

        @StringRes
        fun retryText(reason: BuiltinShellFailure): Int =
            if (reason == BuiltinShellFailure.PairingWindowClosed) R.string.copilot_pairing_window_closed else R.string.copilot_pairing_wrong_code

        /**
         * One step of following the helper: the notice to show and whether following is over.
         * After a code is entered and before pairing starts ([submitted]) it is always Working.
         */
        fun follow(status: BuiltinShellStatus, discovery: PairingDiscovery, submitted: Boolean): Pair<PairingNotice?, Boolean> =
            if (submitted) Working to false else of(status, discovery) to (status == BuiltinShellStatus.Running)

        /** Unanswered code prompts alert again after these gaps; then they stay quietly in the shade. */
        val REALERT_MS = listOf(8_000L, 20_000L, 40_000L)

        fun realertAfter(notice: PairingNotice, sent: Int): Long? = if (notice is EnterCode && !notice.quiet) REALERT_MS.getOrNull(sent) else null
    }
}

/**
 * The pairing notification: high importance so it pops up over Settings' pairing dialog, with a
 * RemoteInput reply box so the user types the code without leaving that dialog. The code goes to
 * [PairingCodeInput]; it is never stored or sent anywhere but this phone's own adbd.
 */
object PairingNotifier {
    const val KEY_CODE = "copilot_pairing_code"
    const val CHANNEL = "copilot_pairing"
    private const val ID = 6802
    private const val DONE_TIMEOUT_MS = 8_000L
    private const val INPUT_TIMEOUT_MS = 10 * 60_000L
    private const val TAG = "HarnessPairing"
    /** Quiet notices go in their own group that only lets a (never posted) summary alert. */
    private const val QUIET_GROUP = "copilot_pairing_quiet"

    @RequiresApi(Build.VERSION_CODES.S)
    fun ensureChannel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, context.getString(R.string.copilot_pairing_channel), NotificationManager.IMPORTANCE_HIGH).apply {
                enableVibration(true)
                setShowBadge(false)
            },
        )
    }

    @RequiresApi(Build.VERSION_CODES.S)
    fun show(context: Context, notice: PairingNotice) {
        val nm = context.getSystemService(NotificationManager::class.java)
        ensureChannel(context)
        val b = Notification.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setCategory(Notification.CATEGORY_STATUS)
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
            b.setContentIntent(PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        }
        when (notice) {
            is PairingNotice.EnterCode -> {
                val input = RemoteInput.Builder(KEY_CODE).setLabel(context.getString(R.string.copilot_pairing_input)).setAllowFreeFormInput(true).build()
                // RemoteInput fills its result into the Intent, so this one must be mutable.
                val reply = PendingIntent.getBroadcast(
                    context, 1, Intent(context, PairingCodeInput::class.java),
                    PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                )
                val action = Notification.Action.Builder(null, context.getString(R.string.copilot_pairing_action), reply)
                    .addRemoteInput(input)
                    .setAllowGeneratedReplies(false)
                    .setSemanticAction(Notification.Action.SEMANTIC_ACTION_REPLY)
                    // Typing the code doesn't require unlocking first.
                    .setAuthenticationRequired(false)
                    .build()
                val text = context.getString(notice.error ?: R.string.copilot_pairing_text)
                b.setContentTitle(context.getString(R.string.copilot_pairing_title))
                    .setContentText(text)
                    .setStyle(Notification.BigTextStyle().bigText(text))
                    .setOngoing(true)
                    .setOnlyAlertOnce(false)
                    .setTimeoutAfter(INPUT_TIMEOUT_MS)
                    .addAction(action)
                if (notice.port != null) b.setSubText(context.getString(R.string.copilot_pairing_found))
                if (notice.quiet) b.setOnlyAlertOnce(true).setGroup(QUIET_GROUP).setGroupAlertBehavior(Notification.GROUP_ALERT_SUMMARY)
            }
            PairingNotice.Working -> b.setContentTitle(context.getString(R.string.copilot_pairing_working))
                .setOngoing(true).setOnlyAlertOnce(true).setProgress(0, 0, true)
            PairingNotice.Done -> b.setContentTitle(context.getString(R.string.copilot_pairing_done_title))
                .setContentText(context.getString(R.string.copilot_pairing_done_text))
                .setAutoCancel(true).setOnlyAlertOnce(true).setTimeoutAfter(DONE_TIMEOUT_MS)
            PairingNotice.Problem -> b.setContentTitle(context.getString(R.string.copilot_pairing_problem_title))
                .setContentText(context.getString(R.string.copilot_pairing_problem_text))
                .setAutoCancel(true)
        }
        // Dropped by the system when notifications aren't allowed; the setup screen asks first and keeps a manual field.
        runCatching { nm.notify(ID, b.build()) }.onFailure { Log.w(TAG, "pairing notification not posted", it) }
        if (!nm.areNotificationsEnabled()) Log.w(TAG, "notifications are off; the pairing notice is dropped")
    }

    fun cancel(context: Context) {
        context.getSystemService(NotificationManager::class.java)?.cancel(ID)
    }
}
