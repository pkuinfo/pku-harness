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
     * cashier opened there reports a parameter error). The buttons that only open that page (the
     * cart's 去结算, a product's 立即购买) are not the gate: Copilot goes on to the order page.
     */
    override fun assess(frame: DeviceFrame, target: DeviceElement): PhoneEffect {
        val screen = screen(frame)
        if (IrreversibleDetector.paymentPage(screen) != null) return PhoneEffect.MONEY
        if (placesOrder(target.text)) return PhoneEffect.MONEY
        if (opensOrderPage(target.text)) return PhoneEffect.WRITE
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

    companion object {
        /**
         * 去结算、结算(2)、立即购买、去下单 ¥18.5:购物车和商品页通往订单页的按钮,订单页上才有真正下单付款的
         * 「提交订单」「去支付」。光秃秃的「下单」「购买」「结账」「确认购买」和英文 Buy now(亚马逊一键下单)仍按下单算。
         */
        private val ORDER_PAGE = Regex("^(?:(?:去|立即)(?:结算|结账|下单|购买)|结算|(?:go to |proceed to )?check ?out)[\\s(（]*(?:共?\\d+件?)?[)）]?\\s*(?:[¥￥]\\s*[\\d.]+)?$", RegexOption.IGNORE_CASE)

        fun opensOrderPage(label: String) = ORDER_PAGE.matches(label.trim())

        /** 订单页上的下单按钮常把金额拼进名字(「提交订单 ¥18.5」),词表的前缀规则只容几个字。 */
        private val PLACE_ORDER = listOf("提交订单", "确认下单", "确认订单并支付")

        fun placesOrder(label: String) = label.trim().let { l -> PLACE_ORDER.any { l.startsWith(it) } }
    }
}
