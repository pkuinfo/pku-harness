package org.pkuinfo.harness.phone.platform

import org.pkuinfo.harness.phone.platform.scope.AppAccessPolicy
import org.pkuinfo.harness.phone.platform.scope.AppAccessState

/** Process-wide event filtering. The engine additionally enforces a strict per-session allowlist. */
object PhoneScope {
    @Volatile var state = AppAccessState(available = false)
    val policy = AppAccessPolicy { state }
}
