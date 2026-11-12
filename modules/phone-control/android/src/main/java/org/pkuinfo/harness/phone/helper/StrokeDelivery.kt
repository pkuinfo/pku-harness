package org.pkuinfo.harness.phone.helper

/** Release a started gesture even when a move fails; never report a partial gesture as success. */
internal object StrokeDelivery {
    fun deliver(count: Int, down: () -> Boolean, move: (Int) -> Boolean, up: () -> Boolean): Boolean {
        if (!down()) return false
        var moved = true
        var released = false
        try {
            for (i in 1 until count) {
                if (!move(i)) { moved = false; break }
            }
        } finally {
            released = up() || up()
        }
        return moved && released
    }
}
