// Derived from Mika, Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.helper

/**
 * 收尾时挪到主屏后面的任务,等它们真的退到用户看不见的地方(纯逻辑,不碰系统接口,单元测试直接测)。
 *
 * 挪过去以后系统要放一段 TO_BACK 过渡,这期间 TaskInfo.isVisible 仍是 true,不能拿某一次读到的「看得见」当失败,
 * 所以隔 [POLL_MS] 看一次:都看不见了就定下来;还看得见的每隔 [REORDER_EVERY_MS] 再排一次到最后面;
 * 到 [TIMEOUT_MS] 还看得见的不能留在用户眼前,交给退路([Plan.Done.fallback]):挪回 Mika 的屏随屏关掉,挪不回再直接关掉
 * (和挪过去又出声的同一条路),结果里记成没留下。已经不在主屏的(被别的任务拿去用了,或已经关了)不再管,也不算留下。
 */
object SettleBehind {
    const val TIMEOUT_MS = 2_000L
    const val REORDER_EVERY_MS = 750L
    const val POLL_MS = 100L

    /** 一个挪过去的任务此刻的样子:[onMain] 还在主屏上;[visible] 在主屏看得见(读不到 isVisible 时调用方按「是不是主屏最上面」给)。 */
    data class Seen(val id: Int, val onMain: Boolean, val visible: Boolean)

    sealed interface Plan {
        /** 还在过渡:[reorder] 是这一轮要再排到最后面的(可能为空),[gone] 从此不再跟;过 [POLL_MS] 再看。 */
        data class Wait(val reorder: Set<Int>, val gone: Set<Int>) : Plan

        /** 定了:[kept] 留在主屏后面;[fallback] 超时还看得见,走退路;[gone] 已不在主屏。 */
        data class Done(val kept: Set<Int>, val fallback: Set<Int>, val gone: Set<Int>) : Plan
    }

    /**
     * 这一轮怎么办。[moved] 是还在跟的任务,[seen] 是它们此刻的样子(没列出的当作已不在主屏),
     * [elapsedMs] 是从开始等起过了多久,[sinceReorderMs] 是离上次再排过了多久(还没排过为 null)。
     */
    fun plan(moved: Set<Int>, seen: List<Seen>, elapsedMs: Long, sinceReorderMs: Long?): Plan {
        val byId = seen.associateBy { it.id }
        val gone = moved.filterTo(LinkedHashSet()) { byId[it]?.onMain != true }
        val front = moved.filterTo(LinkedHashSet()) { byId[it]?.let { s -> s.onMain && s.visible } == true }
        val behind = moved - gone - front
        if (front.isEmpty()) return Plan.Done(behind, emptySet(), gone)
        if (elapsedMs >= TIMEOUT_MS) return Plan.Done(behind, front, gone)
        val due = sinceReorderMs == null || sinceReorderMs >= REORDER_EVERY_MS
        return Plan.Wait(if (due) front else emptySet(), gone)
    }

    /**
     * 等完以后、回到锁里再定一次(等的时候不占锁,这段时间里任务可能被别的任务拿走)。[moved] 是挪过去的全部,
     * [fallback] 是等到超时还看得见的,[seen] 是此刻主屏上的样子:不在主屏的不再算留下;走退路的只限超时那几个、此刻仍看得见的;
     * 原本已退到后面、此刻又看得见的是用户自己点开的,照留不动。
     */
    fun closeOut(moved: Set<Int>, fallback: Set<Int>, seen: List<Seen>): Plan.Done {
        val byId = seen.associateBy { it.id }
        val gone = moved.filterTo(LinkedHashSet()) { byId[it]?.onMain != true }
        val front = (fallback intersect moved).filterTo(LinkedHashSet()) { byId[it]?.let { s -> s.onMain && s.visible } == true }
        return Plan.Done(moved - gone - front, front, gone)
    }
}
