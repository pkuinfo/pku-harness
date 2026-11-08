package expo.modules.phonecontrol

/** Requests are tied to both the session and host approval ID. Never persist approvals. */
object PhoneOverlayBridge {
    private val operations = PhoneOperationStatus()
    fun startOperation(sessionId: String, operation: String): PhoneOperationStatus.Activity? =
        if (PhoneRuntime.activeId() == sessionId) operations.begin(sessionId, operation) else null
    fun finishOperation(ticket: PhoneOperationStatus.Activity?, failed: Boolean) {
        if (ticket != null) operations.finish(ticket, failed)
    }
    fun operation(sessionId: String) = operations.current(sessionId)
    data class Status(val sessionId: String, val phase: String, val title: String, val updatedAt: Long = System.nanoTime())
    @Volatile var status: Status? = null
    data class Approval(val sessionId: String, val id: Int, val title: String, val detail: String)
    @Volatile var approval: Approval? = null
    @Volatile var onControlStopped: ((String) -> Unit)? = null
    @Volatile var onAnswer: ((Approval, Boolean) -> Unit)? = null
    @Synchronized fun update(value: Approval?) { approval = value }
    @Synchronized fun answer(value: Approval, allowed: Boolean) {
        if (approval != value || PhoneRuntime.activeId() != value.sessionId) return
        approval = null
        onAnswer?.invoke(value, allowed)
    }
    @Synchronized fun clear(sessionId: String) {
        operations.clear(sessionId)
        if (approval?.sessionId == sessionId) approval = null
        if (status?.sessionId == sessionId) status = null
    }
}
