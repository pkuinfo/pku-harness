package expo.modules.phonecontrol

/** Native operation progress, independent of JS timers. Contains no app contents or arguments. */
class PhoneOperationStatus(private val now: () -> Long = System::nanoTime) {
    data class Activity(val sessionId: String, val sequence: Long, val phase: String, val operation: String, val updatedAt: Long)
    private var sequence = 0L
    @Volatile private var activity: Activity? = null

    @Synchronized fun begin(sessionId: String, operation: String): Activity =
        Activity(sessionId, ++sequence, "working", operation, now()).also { activity = it }

    @Synchronized fun finish(ticket: Activity, failed: Boolean) {
        if (activity !== ticket) return
        activity = ticket.copy(phase = if (failed) "attention" else "thinking", updatedAt = now())
    }

    fun current(sessionId: String): Activity? = activity?.takeIf { it.sessionId == sessionId }

    companion object {
        /** Current native dispatch is authoritative; a newer host transition can supersede its last result. */
        fun preferHost(native: Activity, hostPhase: String, hostUpdatedAt: Long): Boolean =
            native.phase != "working" && hostPhase != "waiting" && hostUpdatedAt > native.updatedAt
    }

    @Synchronized fun clear(sessionId: String) {
        if (activity?.sessionId == sessionId) activity = null
    }
}
