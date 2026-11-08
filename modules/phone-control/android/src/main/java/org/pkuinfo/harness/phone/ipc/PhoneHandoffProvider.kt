// Derived from Mika, Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.ipc

import org.pkuinfo.harness.phone.helper.HandoffProvider

/** 内置助手交接 Binder 的入口:清单里登记的是这个全名;实现在手机能力里。 */
class PhoneHandoffProvider : HandoffProvider()
