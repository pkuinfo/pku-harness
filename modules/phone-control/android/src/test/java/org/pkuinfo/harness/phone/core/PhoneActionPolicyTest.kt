package org.pkuinfo.harness.phone.core

import org.junit.Assert.assertEquals
import org.junit.Test
import org.pkuinfo.harness.phone.policy.PhoneActionPolicy

class PhoneActionPolicyTest {
    private val policy = PhoneActionPolicy()
    private fun button(text: String, resource: String? = null) = DeviceElement("@e1", "button", text, listOf(100, 700, 900, 900), resource, clickable = true)
    private fun frame(vararg elements: DeviceElement) = DeviceFrame("org.example.app", setOf("org.example.app"), 1080, 2400, elements.toList(), "window")

    @Test fun sendingInEitherSupportedLanguageUsesThePublicPermission() {
        for (label in listOf("Send", "发送", "发布")) {
            val target = button(label)
            assertEquals(PhoneEffect.PUBLIC, policy.assess(frame(target), target))
        }
    }

    @Test fun orderAndPayButtonsBeforeThePaymentSheetArePublicActions() {
        // Copilot places the order itself; the payment sheet that opens is the user's.
        for (label in listOf("Pay", "Buy now", "付款", "下单", "提交订单", "立即支付")) {
            val target = button(label)
            assertEquals(PhoneEffect.PUBLIC, policy.assess(frame(target), target))
        }
    }

    @Test fun everyTapOnAPaymentSheetRequiresTheMoneyGate() {
        val amount = DeviceElement("@e2", "text", "实付 ¥23.50", listOf(100, 100, 900, 200))
        val method = DeviceElement("@e3", "text", "选择支付方式", listOf(100, 300, 900, 400))
        for (label in listOf("支付宝", "微信支付", "确认支付")) {
            val target = button(label)
            assertEquals(PhoneEffect.MONEY, policy.assess(frame(target, amount, method), target))
        }
    }

    @Test fun genericConfirmationOnAPaymentScreenIsNotTreatedAsNavigation() {
        val confirm = button("确认")
        val amount = DeviceElement("@e2", "text", "合计 ¥50.00", listOf(100, 100, 900, 200))
        val payment = DeviceElement("@e3", "text", "付款方式", listOf(100, 300, 900, 400))
        assertEquals(PhoneEffect.MONEY, policy.assess(frame(confirm, amount, payment), confirm))
    }

    @Test fun ordinaryNavigationStaysInTheWritePermissionCategory() {
        val target = button("Next")
        assertEquals(PhoneEffect.WRITE, policy.assess(frame(target), target))
    }

    @Test fun aPointOnAPaymentScreenNeedsTheMoneyGateEvenWithoutAnElementUnderIt() {
        val amount = DeviceElement("@e2", "text", "合计 ¥50.00", listOf(100, 100, 900, 200))
        val payment = DeviceElement("@e3", "text", "付款方式", listOf(100, 300, 900, 400))
        assertEquals(PhoneEffect.MONEY, policy.assessPoint(frame(button("确认"), amount, payment), 540, 2300))
    }

    @Test fun aPointIsJudgedLikeATapOnTheElementUnderItAndIsAtLeastWrite() {
        // button() spans 0–999 bounds [100, 700, 900, 900] of 1080x2400: (540, 1900) is inside.
        assertEquals(PhoneEffect.PUBLIC, policy.assessPoint(frame(button("发送")), 540, 1900))
        assertEquals(PhoneEffect.WRITE, policy.assessPoint(frame(button("发送")), 540, 100))
        assertEquals(PhoneEffect.WRITE, policy.assessPoint(frame(), 540, 1200))
    }
}
