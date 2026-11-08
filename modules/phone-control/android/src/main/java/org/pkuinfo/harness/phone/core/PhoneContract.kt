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
)

data class PhoneExecution(val outcome: DeviceOutcome, val observation: PhoneObservation)
data class PhoneSessionState(val id: String, val packages: Set<String>, val handedOver: Boolean)

fun interface ActionPolicy {
    fun assess(frame: DeviceFrame, target: DeviceElement): PhoneEffect
}
