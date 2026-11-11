package org.pkuinfo.harness.phone.core

import org.junit.Assert.*
import org.junit.Test
import org.pkuinfo.harness.phone.connection.protocol.*

class AccessibilityIdentityTest {
    private val pkg = "org.pkuinfo.harness"
    private val google = "com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService"
    private fun own(i: AccessibilityIdentity) = PermissionCommands.accessibilityService(pkg, i)

    @Test fun neutralIsTheDefaultAndCarriesNoScreenReaderName() {
        assertEquals(own(AccessibilityIdentity.Neutral), PermissionCommands.accessibilityService(pkg))
        assertFalse(PermissionCommands.accessibilityService(pkg).contains("talkback", ignoreCase = true))
    }

    @Test fun switchingReplacesTheOtherNamesAndKeepsOtherServices() {
        val before = "$google:${own(AccessibilityIdentity.Neutral)}"
        val talkman = PermissionCommands.accessibilityList(before, pkg, true, AccessibilityIdentity.TalkMan)
        assertEquals(listOf(google, own(AccessibilityIdentity.TalkMan)), AccessibilityList.entries(talkman))
        val talkback = PermissionCommands.accessibilityList(talkman, pkg, true, AccessibilityIdentity.TalkBack)
        assertEquals(listOf(google, own(AccessibilityIdentity.TalkBack)), AccessibilityList.entries(talkback))
        val neutral = PermissionCommands.accessibilityList(talkback, pkg, true)
        assertEquals(listOf(google, own(AccessibilityIdentity.Neutral)), AccessibilityList.entries(neutral))
    }

    @Test fun offRemovesEveryOwnNameIncludingLegacy() {
        val all = (PermissionCommands.ownServices(pkg) + google).joinToString(":")
        assertEquals(google, PermissionCommands.accessibilityList(all, pkg, false))
        assertEquals("", PermissionCommands.accessibilityList("null", pkg, false))
    }

    @Test fun anyOwnNameCountsAsListedForRestores() {
        val listed = "$google:${own(AccessibilityIdentity.TalkMan)}"
        assertTrue(AccessibilityList.containsAny(listed, PermissionCommands.ownServices(pkg)))
        assertEquals(listOf(RestoreCommands.ENABLE_ACCESSIBILITY), RestoreCommands.accessibility(listed, own(AccessibilityIdentity.Neutral), PermissionCommands.ownServices(pkg)))
        assertFalse(AccessibilityList.containsAny(google, PermissionCommands.ownServices(pkg)))
    }

    @Test fun classNamesResolveToIdentities() {
        for (i in AccessibilityIdentity.entries) assertEquals(i, AccessibilityIdentity.ofClass(i.className))
        assertNull(AccessibilityIdentity.ofClass("other.Service"))
    }
}
