package expo.modules.phonecontrol

import org.pkuinfo.harness.phone.platform.accessibility.ScreenAccessibility

/**
 * Copilot's accessibility service under its own, neutral name: the identity it normally runs
 * under, so keyboards and other apps don't take it for a screen reader. The screen-reader names
 * (com.nirenr.talkman.TalkManAccessibilityService, com.google.android.marvin.talkback.TalkBackService)
 * are switched to only while Copilot operates WeChat (AccessibilityIdentity, AccessibilityParking).
 * Keep the manifest, PermissionCommands and R8 rule in sync with this class name.
 */
class CopilotAccessibilityService : ScreenAccessibility()
