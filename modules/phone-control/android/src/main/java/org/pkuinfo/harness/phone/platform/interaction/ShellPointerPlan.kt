package org.pkuinfo.harness.phone.platform.interaction

/** Continuous, evenly timed samples for the shell's display-scoped input injector. */
object ShellPointerPlan {
    fun linear(points: List<Pair<Int, Int>>, durationMs: Long): List<GesturePacing.Point> {
        require(points.size in 2..32 && durationMs in 1..10_000)
        val steps = maxOf(points.size - 1, ((durationMs + 15) / 16).toInt())
        return (0..steps).map { i ->
            val position = i.toDouble() * (points.size - 1) / steps
            val segment = position.toInt().coerceAtMost(points.size - 2)
            val fraction = position - segment
            val from = points[segment]
            val to = points[segment + 1]
            GesturePacing.Point(from.first + (to.first - from.first) * fraction,
                from.second + (to.second - from.second) * fraction, durationMs * i / steps)
        }
    }
}
