package org.pkuinfo.harness.phone.platform

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HandoffRestartTest {
    private val log = """
        --------- beginning of events
        1731744040.100   694  1920 I wm_create_activity: [0,130919405,317,com.tencent.mm/.plugin.appbrand.ui.AppBrandUI00,NULL,NULL,NULL,268435456]
        1731744045.500   694  1920 I wm_relaunch_resume_activity: [0,130919405,317,com.tencent.mm/.plugin.appbrand.ui.AppBrandUI00]
        1731744045.600   694  1920 I wm_create_activity: [0,66001611,316,com.tencent.mm/.ui.LauncherUI,android.intent.action.MAIN,NULL,NULL,270532608]
    """.trimIndent()

    @Test fun aRelaunchOfTheMovedTaskAfterTheMoveCounts() {
        assertTrue(HandoffRestart.restarted(log, taskId = 317, sinceEpochMs = 1731744045_000))
    }

    @Test fun eventsBeforeTheMoveOrOfOtherTasksDoNot() {
        assertFalse(HandoffRestart.restarted(log, taskId = 317, sinceEpochMs = 1731744046_000))
        assertFalse(HandoffRestart.restarted(log, taskId = 315, sinceEpochMs = 0))
        assertFalse(HandoffRestart.restarted("", taskId = 317, sinceEpochMs = 0))
    }

    @Test fun aNewActivityInTheMovedTaskCounts() {
        assertTrue(HandoffRestart.restarted(log, taskId = 316, sinceEpochMs = 1731744045_550))
    }
}
