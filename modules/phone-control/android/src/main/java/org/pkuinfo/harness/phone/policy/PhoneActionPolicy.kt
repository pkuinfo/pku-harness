package org.pkuinfo.harness.phone.policy

import org.pkuinfo.harness.phone.core.*
import org.pkuinfo.harness.phone.policy.types.GateTarget
import org.pkuinfo.harness.phone.policy.types.IrrevAction
import org.pkuinfo.harness.phone.platform.screen.ScreenSnapshot
import org.pkuinfo.harness.phone.platform.screen.UiElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Keeps adapted classification details inside the platform; the core owns the decision contract. */
class PhoneActionPolicy : ActionPolicy {
    private fun screen(frame: DeviceFrame) = ScreenSnapshot("assessment", frame.packageName, frame.elements.map { e ->
            UiElement(e.key, e.role, e.text, (e.bounds[0] + e.bounds[2]) * frame.width / 1998,
                (e.bounds[1] + e.bounds[3]) * frame.height / 1998, e.bounds, e.resourceId,
                e.clickable, e.editable, e.scrollable, secret = e.secret)
        }, frame.width, frame.height)

    override fun submit(frame: DeviceFrame, target: DeviceElement): PhoneEffect =
        if (IrreversibleDetector.paymentPage(screen(frame)) != null || assess(frame, target) == PhoneEffect.MONEY)
            PhoneEffect.MONEY else PhoneEffect.PUBLIC

    /** A payment sheet anywhere on screen puts every point on it behind the money gate. */
    override fun assessPoint(frame: DeviceFrame, x: Int, y: Int): PhoneEffect =
        if (IrreversibleDetector.paymentPage(screen(frame)) != null) PhoneEffect.MONEY else super.assessPoint(frame, x, y)

    /**
     * Copilot fills in the order up to the checkout page and stops there: "Submit order" / "Pay" and
     * every tap on the payment sheet need the money gate, which hands over. The user taps the
     * button on their own screen, because payment SDKs fail on Copilot's virtual display (Meituan's
     * cashier opened there reports a parameter error).
     */
    override fun assess(frame: DeviceFrame, target: DeviceElement): PhoneEffect {
        val screen = screen(frame)
        if (IrreversibleDetector.paymentPage(screen) != null) return PhoneEffect.MONEY
        val risk = IrreversibleDetector.classify(GateTarget.Tap, buildJsonObject {
            put("ref", target.key)
            put("snapshotId", screen.snapshotId)
        }, screen)
        return when (risk?.action) {
            IrrevAction.pay, IrrevAction.order -> PhoneEffect.MONEY
            IrrevAction.send, IrrevAction.submit -> PhoneEffect.PUBLIC
            else -> PhoneEffect.WRITE
        }
    }
}
