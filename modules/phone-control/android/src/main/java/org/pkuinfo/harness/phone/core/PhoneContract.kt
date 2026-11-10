package org.pkuinfo.harness.phone.core

enum class PhoneEffect { WRITE, PUBLIC, MONEY }
enum class PhoneFailure { ENDED, BUSY, APP_SCOPE, LOCKED, STALE, INVALID, HANDOFF }

class PhoneException(val code: PhoneFailure, message: String) : IllegalStateException(message)

data class PhoneTarget(val ref: String, val element: DeviceElement)
data class PhoneObservation(
    val sessionId: String,
    val snapshotId: String,
    val packageName: String?,
    val width: Int,
    val height: Int,
    val protected: Boolean,
    val unstable: Boolean,
    val targets: List<PhoneTarget>,
    val needsUser: Boolean = false,
)

/** A concrete observed target for the host's approval sheet, never a model-supplied summary. */
data class PhoneAssessment(
    val effect: PhoneEffect,
    val label: String,
    val packageName: String?,
    val snapshotId: String,
    val ref: String,
    val submit: Boolean = false,
)

data class PhoneExecution(val outcome: DeviceOutcome, val observation: PhoneObservation)
/** A screenshot for the model (opt-in vision fallback) and the observation it belongs to. */
data class PhoneLook(val observation: PhoneObservation, val image: DevicePreview)
data class PhoneSessionState(val id: String, val packages: Set<String>, val handedOver: Boolean, val paused: Boolean = false)

fun interface ActionPolicy {
    fun assess(frame: DeviceFrame, target: DeviceElement): PhoneEffect
    fun submit(frame: DeviceFrame, target: DeviceElement): PhoneEffect =
        if (assess(frame, target) == PhoneEffect.MONEY) PhoneEffect.MONEY else PhoneEffect.PUBLIC
    /**
     * A point picked from a screenshot ([x]/[y] in display pixels). There is no observed element
     * to judge, so it is at least WRITE; an element the tree does show under the point is judged
     * like a tap on it.
     */
    fun assessPoint(frame: DeviceFrame, x: Int, y: Int): PhoneEffect =
        elementAt(frame, x, y)?.let { assess(frame, it) } ?: PhoneEffect.WRITE
}

/** The smallest observed element (bounds normalized to 0–999) containing a display-pixel point, clickable first. */
fun elementAt(frame: DeviceFrame, x: Int, y: Int): DeviceElement? {
    fun norm(p: Int, size: Int) = if (size <= 1) 0 else (p * 999.0 / (size - 1)).toInt().coerceIn(0, 999)
    val nx = norm(x, frame.width)
    val ny = norm(y, frame.height)
    return frame.elements
        .filter { it.bounds.size == 4 && nx in it.bounds[0]..it.bounds[2] && ny in it.bounds[1]..it.bounds[3] }
        .minWithOrNull(compareBy<DeviceElement>({ !it.clickable }, { (it.bounds[2] - it.bounds[0]).toLong() * (it.bounds[3] - it.bounds[1]) }))
}
