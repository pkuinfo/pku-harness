// Derived from Mika, Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.helper

/** 一批事件只排一次扫描;后来的事件不推迟已排好的扫描,连续事件也能及时处理。 */
internal class CoalescedScan(
    private val schedule: (Runnable) -> Unit,
    private val cancel: (Runnable) -> Unit,
    private val scan: () -> Unit,
) {
    private val lock = Any()
    private var queued = false
    private var closed = false
    private val work = Runnable {
        synchronized(lock) {
            if (closed) return@Runnable
            queued = false
        }
        scan()
    }

    fun request() = synchronized(lock) {
        if (!closed && !queued) {
            queued = true
            schedule(work)
        }
    }

    fun close() = synchronized(lock) {
        closed = true
        cancel(work)
    }
}
