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
    override fun assess(frame: DeviceFrame, target: DeviceElement): PhoneEffect {
        val screen = ScreenSnapshot("assessment", frame.packageName, frame.elements.map { e ->
            UiElement(e.key, e.role, e.text, (e.bounds[0] + e.bounds[2]) * frame.width / 1998,
                (e.bounds[1] + e.bounds[3]) * frame.height / 1998, e.bounds, e.resourceId,
                e.clickable, e.editable, e.scrollable, secret = e.secret)
        }, frame.width, frame.height)
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
