package com.google.android.marvin.talkback

import org.pkuinfo.harness.phone.platform.accessibility.ScreenAccessibility

/**
 * Harness-owned service with a TalkBack-compatible class name for WeChat node exposure.
 * This is not Google's TalkBack implementation: the app ID, signature and visible Copilot
 * label remain Harness's. No Google service is replaced and no touch exploration is requested.
 * Keep the manifest, PermissionCommands and R8 rule in sync with this class name.
 * Compatibility report: https://www.cnblogs.com/venblog/p/18794934
 */
class TalkBackService : ScreenAccessibility()
