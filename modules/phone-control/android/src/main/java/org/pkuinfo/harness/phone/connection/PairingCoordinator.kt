// Derived from Mika (cap/phone/setup/PairingCoordinator.kt), Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.connection

import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.Log
import expo.modules.phonecontrol.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.transformWhile
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.pkuinfo.harness.phone.connection.protocol.BuiltinShellControl
import org.pkuinfo.harness.phone.connection.protocol.PairingCode
import org.pkuinfo.harness.phone.platform.PhonePlatform

/**
 * One pairing from start to finish: look for Settings' pairing dialog (mDNS), post the
 * notification with the code box, hand the code to the helper [control], show the result.
 * Lives with the process, not the screen: while the user reads the code in Settings, Harness
 * isn't in front.
 */
class PairingCoordinator(context: Context, private val control: BuiltinShellControl) {
    private val app = context.applicationContext
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var watch: Job? = null
    @Volatile private var deadlineAt = 0L
    @Volatile private var shown: PairingNotice? = null
    /** A code was entered and pairing hasn't started yet: the notice stays Working meanwhile. */
    @Volatile private var submitted = false

    /** Following a pairing right now (the setup screen says "waiting for the pairing dialog"). */
    val active: Boolean get() = watch?.isActive == true

    /** Start (or keep) following; calling again restarts the time limit and the dialog search. */
    @Synchronized
    fun begin() {
        if (Build.VERSION.SDK_INT < BuiltinShellManager.MIN_SDK) return
        deadlineAt = SystemClock.elapsedRealtime() + WINDOW_MS
        control.startDiscovery()
        if (watch?.isActive == true) return
        Log.i(TAG, "watching for pairing (status ${control.status.value})")
        watch = scope.launch {
            val notices = launch {
                // Read all three at the moment of each change, in reverse write order (see submit/pair).
                combine(control.status, control.pairingDiscovery) { _, _ ->
                    val d = control.pairingDiscovery.value
                    val pending = submitted
                    PairingNotice.follow(control.status.value, d, pending)
                }
                    .distinctUntilChanged()
                    .transformWhile { emit(it.first); !it.second }
                    .collectLatest { notice -> if (notice == null) cancelNotice() else post(notice) }
            }
            while (notices.isActive) {
                val left = deadlineAt - SystemClock.elapsedRealtime()
                if (left <= 0) {
                    Log.i(TAG, "stopped watching: no pairing within ${WINDOW_MS / 60_000} min")
                    notices.cancel()
                    cancelNotice()
                    break
                }
                withTimeoutOrNull(left) { notices.join() }
            }
            control.stopDiscovery()
        }
    }

    @Synchronized
    fun end() {
        watch?.cancel()
        watch = null
        submitted = false
        control.stopDiscovery()
        cancelNotice()
    }

    /** Pair with [code]; [port] null = the dialog found by discovery (looked up again if needed). */
    suspend fun pair(code: String, port: Int?) = coroutineScope {
        val job = launch(start = CoroutineStart.UNDISPATCHED) { control.startPairing(code, port) }
        submitted = false
        job.join()
    }

    /**
     * A code typed into the notification. Not six digits: ask again in place and return null.
     * Otherwise show Working at once and return the pairing, so the receiver can wait for it.
     */
    fun submit(raw: String): Job? {
        val code = PairingCode.normalize(raw)
        if (code == null) {
            show(PairingNotice.EnterCode(null, R.string.copilot_pairing_invalid))
            return null
        }
        submitted = true
        // A reopened dialog has a new port: search again rather than reuse the one found earlier.
        begin()
        show(PairingNotice.Working)
        return scope.launch { pair(code, null) }
    }

    private suspend fun post(notice: PairingNotice) {
        show(notice)
        var sent = 0
        while (true) {
            delay(PairingNotice.realertAfter(notice, sent) ?: return)
            if (shown != notice) return
            show(notice)
            sent++
        }
    }

    private fun show(notice: PairingNotice) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        shown = notice
        PairingNotifier.show(app, notice)
    }

    private fun cancelNotice() {
        shown = null
        PairingNotifier.cancel(app)
    }

    private companion object {
        const val TAG = "HarnessPairing"
        /** How long one pairing attempt is followed after the last [begin]. */
        const val WINDOW_MS = 10 * 60_000L
    }
}

/**
 * Where the notification's code box lands. The system may freeze Harness in the background
 * again as soon as the broadcast ends, so the broadcast is held until pairing is done (or
 * [HOLD_MS]); connecting afterwards may only be a little later, the pairing is already saved.
 */
class PairingCodeInput : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val code = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(PairingNotifier.KEY_CODE)?.toString() ?: return
        val platform = PhonePlatform.of(context)
        platform.start()
        val job = platform.pairing.submit(code) ?: return
        val pending = goAsync()
        platform.pairing.scope.launch {
            try {
                withTimeoutOrNull(HOLD_MS) { job.join() }
            } finally {
                pending.finish()
            }
        }
    }

    private companion object {
        /** A broadcast that doesn't finish within 10 s counts as not responding. */
        const val HOLD_MS = 8_000L
    }
}
