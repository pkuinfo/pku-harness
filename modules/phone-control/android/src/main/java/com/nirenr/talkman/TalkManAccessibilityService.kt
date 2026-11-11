package com.nirenr.talkman

import org.pkuinfo.harness.phone.platform.accessibility.ScreenAccessibility

/**
 * Harness-owned service with the class name of TalkMan (a Chinese screen reader), one of the
 * screen readers WeChat shows its views to. Copilot enables it only while operating WeChat, and
 * tries it before the TalkBack name because keyboards such as Samsung Keyboard react to TalkBack
 * (AccessibilityIdentity). It is not TalkMan: the app ID, signature and label remain Harness's.
 * Keep the manifest, PermissionCommands and R8 rule in sync with this class name.
 */
class TalkManAccessibilityService : ScreenAccessibility()
