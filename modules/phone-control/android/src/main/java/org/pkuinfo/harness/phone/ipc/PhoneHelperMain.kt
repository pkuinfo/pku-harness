// Derived from Mika, Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.ipc

import org.pkuinfo.harness.phone.helper.HelperProcess

/** 内置助手进程的入口:启动命令里写的是这个全名(见 HelperHandoff.HELPER_CLASS);实现在手机能力里。 */
object PhoneHelperMain {
    @JvmStatic
    fun main(args: Array<String>) = HelperProcess.main(args)
}
