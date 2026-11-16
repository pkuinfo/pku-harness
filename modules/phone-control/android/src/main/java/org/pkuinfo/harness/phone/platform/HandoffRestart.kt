package org.pkuinfo.harness.phone.platform

/**
 * Whether a task handed to the user was recreated on the way. Android rebuilds an activity that
 * doesn't handle a configuration change between Copilot's display and the user's (on Samsung,
 * likely the main screen's wide colour or HDR), and a WeChat mini program then starts over on its
 * home page. Read from the system event log, which the helper can read as shell.
 */
object HandoffRestart {
    /** Only the events that recreate an activity; `-v epoch` puts seconds since the epoch first. */
    const val COMMAND = "logcat -b events -d -v epoch -t 400 -s wm_relaunch_resume_activity wm_relaunch_activity wm_create_activity"

    /** How long after the move the task has had time to come up on the user's screen. */
    const val SETTLE_MS = 1500L

    /**
     * True when the log shows [taskId] relaunched or given a new activity at or after [sinceEpochMs].
     * Lines look like `1731744045.123  694  1920 I wm_relaunch_resume_activity: [0,123,317,pkg/.Act]`.
     */
    fun restarted(log: String, taskId: Int, sinceEpochMs: Long): Boolean = log.lineSequence().any { line ->
        val at = line.trim().substringBefore(' ').toDoubleOrNull() ?: return@any false
        if ((at * 1000).toLong() < sinceEpochMs) return@any false
        val fields = line.substringAfter('[', "").substringBefore(']').split(',')
        fields.getOrNull(2)?.trim()?.toIntOrNull() == taskId
    }
}
