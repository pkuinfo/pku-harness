// Derived from Mika, Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.helper

/**
 * 任务结束时 Mika 屏上的 App 怎么办(外壳一侧的规则,不碰系统接口,单元测试直接测)。
 *
 * 默认留下:挪到主屏、排在最后面,用户在最近任务里看得到它停在 Mika 做完的那一页,下次 Mika 打开它也接着这一页。
 * 此刻正在出声(播放音视频)的默认关掉,免得任务结束、静音还原时突然响起来。模型按用户的话标过的([keep] / [close])
 * 优先于默认。Mika 自己的页面、不是普通 App 页面的(桌面、最近任务一类)一律随屏关掉。
 */
object AppsAfterTask {
    /** 一个任务的去留为什么这样定;[wire] 写进结果和运行记录。 */
    enum class Why(val wire: String) {
        /** 模型标过。 */
        Marked("marked"),
        /** 此刻正在出声。 */
        Playing("playing"),
        /** 读不到在不在出声,而它正被 Mika 静着:还原静音时可能突然响,按出声算。 */
        PlaybackUnknown("playback_unknown"),
        /** 默认:留下。 */
        Default("default"),
        /** Mika 自己的页面。 */
        Own("mika"),
        /** 不是普通 App 的页面。 */
        NotApp("not_app"),
        /** 这台系统挪不了任务,照旧随屏关掉。 */
        MoveUnsupported("move_not_supported"),
        /** 挪到主屏后等到超时还看得见:不能留在用户眼前,挪回 Mika 的屏随屏关掉。 */
        StillInFront("still_in_front"),
    }

    /**
     * 屏上的一个任务:[keys] 是它的页面所属的包换成的键(见 [keyOf]),[playing] 读不到时为 null,
     * [muted] 是它此刻正被 Mika 静着(收尾时会还原)。
     */
    data class Task(val id: Int, val keys: List<String>, val standard: Boolean, val own: Boolean, val playing: Boolean?, val muted: Boolean = false)

    data class Fate(val task: Task, val keep: Boolean, val why: Why) {
        val key: String get() = task.keys.firstOrNull().orEmpty()
    }

    /** 键:本来那份(Mika 所在的用户)就是包名,另一份是 包名@用户,和静音记录同一种写法([AppAudioKey])。 */
    fun keyOf(packageName: String, userId: Int, myUser: Int): String =
        AppAudioKey.of(packageName, userId.takeIf { it != myUser && it >= 0 })

    /** 模型标的键换成同一种写法:写成 Mika 所在用户的另一份等于本来那份;不合格式的丢掉。 */
    fun normalize(keys: Array<String>?, myUser: Int): Set<String> = keys.orEmpty().mapNotNull { k ->
        AppAudioKey.parse(k)?.let { (pkg, user) -> AppAudioKey.of(pkg, user?.takeIf { it != myUser }) }
    }.toSet()

    fun decide(tasks: List<Task>, keep: Set<String>, close: Set<String>): List<Fate> = tasks.map { t ->
        when {
            t.own -> Fate(t, false, Why.Own)
            !t.standard -> Fate(t, false, Why.NotApp)
            t.keys.any { it in close } -> Fate(t, false, Why.Marked)
            t.keys.any { it in keep } -> Fate(t, true, Why.Marked)
            t.playing == true -> Fate(t, false, Why.Playing)
            // 读不到在不在出声:没被静着的留下(它要出声早就有声了,收尾不改变什么);静着的按出声算,免得还原时突然响
            t.playing == null && t.muted -> Fate(t, false, Why.PlaybackUnknown)
            else -> Fate(t, true, Why.Default)
        }
    }

    /**
     * 挪过去之后再看一眼:没标过 keep、这会儿开始出声的,改成关掉(静音一还原就会响)。标过 keep 的照留。
     */
    fun recheck(fate: Fate, playingNow: Boolean?): Fate =
        if (fate.keep && fate.why != Why.Marked && playingNow == true) fate.copy(keep = false, why = Why.Playing) else fate

    /**
     * `dumpsys audio` 里正在播放的那些 uid:每个播放器一行 `AudioPlaybackConfiguration piid:.. u/pid:<uid>/<pid> state:started ..`。
     * 认不出是音频服务的输出(没有播放记录那一段)时为 null,调用方按「读不到」处理。
     */
    fun playingUids(dumpsys: String): Set<Int>? {
        if (!dumpsys.contains(PLAYBACK_SECTION)) return null
        return dumpsys.lineSequence().filter { "AudioPlaybackConfiguration" in it }
            .mapNotNull { PLAYER.find(it) }
            .filter { it.groupValues[2] == "started" }
            .mapNotNull { it.groupValues[1].toIntOrNull() }
            .filter { it >= 0 }
            .toSet()
    }

    /** 结果里关掉的那一项:键:原因。 */
    fun closedEntry(f: Fate): String = "${f.key}:${f.why.wire}"

    /**
     * 诊断信息里的一行:只数个数,不列包名(诊断信息不写装了什么、开过什么)。
     * 如「kept 1, closed 1 (playing 1)」「closed 2 (move not supported)」「none」。
     */
    fun diagnosticsLine(kept: Int, closed: List<String>, note: String?): String {
        if (kept == 0 && closed.isEmpty()) return note?.let { "none ($it)" } ?: "none"
        val reasons = closed.map { it.substringAfterLast(':') }.groupingBy { it }.eachCount()
            .entries.sortedBy { it.key }.joinToString(", ") { "${it.key.replace('_', ' ')} ${it.value}" }
        val parts = listOfNotNull(
            "kept $kept".takeIf { kept > 0 },
            if (closed.isEmpty()) null else "closed ${closed.size}" + (if (reasons.isEmpty()) "" else " ($reasons)"),
        )
        return parts.joinToString(", ") + (note?.let { "; $it" } ?: "")
    }

    // finishDisplay 的 Bundle
    const val KEY_KEPT = "kept"
    const val KEY_CLOSED = "closed"
    const val KEY_NOTE = "note"

    /** 挪不了时写进 note 的话。 */
    const val NOTE_MOVE_UNSUPPORTED = "move not supported"
    const val NOTE_PLAYBACK_UNKNOWN = "playback unknown"
    /** 有任务挪过去以后一直看得见,没留下。 */
    const val NOTE_STILL_IN_FRONT = "still visible on main, closed"
    /** 前面带个数:挪过去了却没能取消隐藏,最近任务里看不见,下次打开同一份时挪回来补上。 */
    const val NOTE_LEFT_HIDDEN = "left hidden on main"
    /** 读不了主屏的任务列表,没核对上留下的是不是已退到后面。 */
    const val NOTE_SETTLE_UNKNOWN = "behind check unavailable"

    // AudioPlaybackConfiguration.PLAYER_STATE_STARTED
    const val PLAYER_STATE_STARTED = 2
    private const val PLAYBACK_SECTION = "PlaybackActivityMonitor"
    private val PLAYER = Regex("""u/pid:(-?\d+)/-?\d+\s+state:(\w+)""")
}
