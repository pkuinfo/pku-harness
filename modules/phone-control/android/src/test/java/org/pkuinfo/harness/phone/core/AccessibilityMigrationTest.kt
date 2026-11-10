package org.pkuinfo.harness.phone.core

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.pkuinfo.harness.phone.connection.protocol.*

class AccessibilityMigrationTest {
    private val pkg = "org.pkuinfo.harness"
    private val old = "$pkg/.phone.platform.accessibility.PhoneAccessibilityService"
    private val other = "com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService"

    private class Store(initial: RecoveryConsent) : RecoveryConsentStore {
        override val consent = MutableStateFlow(initial)
        override fun save(consent: RecoveryConsent) { this.consent.value = consent }
    }

    private class Shell(var enabled: String, var failWrites: Boolean = false) : ShellCommandRunner {
        val writes = mutableListOf<String>()
        override suspend fun exec(command: String): String {
            if (command == PermissionCommands.READ_ACCESSIBILITY) return enabled
            writes += command
            return "${PermissionCommands.EXIT_MARK}${if (failWrites) 1 else 0}"
        }
    }

    @Test fun alreadyAppliedPermissionMigratesAnEnabledLegacyComponent() = runBlocking {
        val store = Store(RecoveryConsent(applied = RecoveryCapability.entries.toSet()))
        val shell = Shell("$other:$old")
        val permissions = RecoveryPermissions({ shell }, store, pkg)
        assertEquals(PermissionResult.Done, permissions.applyPending())
        assertEquals(PermissionCommands.checked("settings put secure enabled_accessibility_services '${other}:${PermissionCommands.accessibilityService(pkg)}'"), shell.writes.first())
        assertEquals(2, shell.writes.size)
        assertTrue(store.consent.value.isApplied(RecoveryCapability.Accessibility))
    }

    @Test fun disabledAndDeclinedPermissionsAreNotAutomaticallyReenabled() = runBlocking {
        for (declined in listOf(false, true)) {
            val store = Store(RecoveryConsent(applied = RecoveryCapability.entries.toSet(),
                declined = if (declined) setOf(RecoveryCapability.Accessibility) else emptySet()))
            val shell = Shell(if (declined) "$other:$old" else other)
            assertEquals(PermissionResult.Done, RecoveryPermissions({ shell }, store, pkg).applyPending())
            assertTrue(shell.writes.isEmpty())
        }
    }

    @Test fun failedMigrationIsReportedAndRetriedOnNextConnection() = runBlocking {
        val store = Store(RecoveryConsent(applied = RecoveryCapability.entries.toSet()))
        val shell = Shell(old, failWrites = true)
        val permissions = RecoveryPermissions({ shell }, store, pkg)
        assertTrue(permissions.applyPending() is PermissionResult.Failed)
        assertTrue(RecoveryCapability.Accessibility in permissions.autoFailed.value)
        shell.failWrites = false
        assertEquals(PermissionResult.Done, permissions.applyPending())
        assertTrue(permissions.autoFailed.value.isEmpty())
    }

    @Test fun disablingRemovesBothOwnComponentsButPreservesOtherInstallations() {
        val sibling = "org.pkuinfo.harness.dev/${PermissionCommands.legacyAccessibilityService(pkg).substringAfter('/')}"
        val current = PermissionCommands.accessibilityService(pkg)
        assertEquals("$other:$sibling", PermissionCommands.accessibilityList("$other:$old:$current:$sibling", pkg, false))
    }

    @Test fun fullAndShortLegacyNamesDeduplicateWithoutTouchingGooglesTalkBack() {
        val full = PermissionCommands.legacyAccessibilityService(pkg)
        val result = PermissionCommands.accessibilityList("$other:$old:$full", pkg, true)
        assertEquals("$other:${PermissionCommands.accessibilityService(pkg)}", result)
        assertEquals(result, PermissionCommands.accessibilityList(result, pkg, true))
    }
}
