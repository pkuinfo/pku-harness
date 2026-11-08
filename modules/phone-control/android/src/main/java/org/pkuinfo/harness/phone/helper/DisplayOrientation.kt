// Derived from Mika, Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.helper

import android.content.pm.ActivityInfo

/** 后台屏不抢主屏焦点时,系统可能把横屏 Activity 缩在竖屏顶部。按系统报告的应用窗口比例纠正屏方向。 */
internal object DisplayOrientation {
    fun rotation(
        bufferWidth: Int,
        bufferHeight: Int,
        current: Int,
        appWidth: Int,
        appHeight: Int,
        requestedOrientation: Int = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED,
    ): Int? {
        if (bufferWidth == bufferHeight) return null
        val appLandscape = when {
            appWidth > 0 && appHeight > 0 && appWidth != appHeight -> appWidth > appHeight
            else -> requestedLandscape(requestedOrientation) ?: return null
        }
        val naturalLandscape = bufferWidth > bufferHeight
        val currentLandscape = if (current % 2 == 0) naturalLandscape else !naturalLandscape
        if (currentLandscape == appLandscape) return null
        return if (naturalLandscape == appLandscape) 0 else 1
    }

    private fun requestedLandscape(orientation: Int): Boolean? = when (orientation) {
        ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE,
        ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE,
        ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE,
        ActivityInfo.SCREEN_ORIENTATION_USER_LANDSCAPE -> true
        ActivityInfo.SCREEN_ORIENTATION_PORTRAIT,
        ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT,
        ActivityInfo.SCREEN_ORIENTATION_REVERSE_PORTRAIT,
        ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT -> false
        else -> null
    }
}
