// Derived from Mika, Apache-2.0. See the module NOTICE and LICENSE.
package org.pkuinfo.harness.phone.diagnostics

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Display
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.view.View
import expo.modules.phonecontrol.R
import org.pkuinfo.harness.phone.platform.text.AppLanguage
import org.pkuinfo.harness.phone.platform.text.tr
import org.pkuinfo.harness.phone.helper.SystemIntents
import java.lang.ref.WeakReference

/**
 * 兼容性自检在 Mika 虚拟屏上操作的那一页:一个计数按钮、一个输入框、一列能滚动的行、一行一直在跳的数字和一条来回变色的横条
 * (画面一直在变,好看出虚拟屏会不会过几秒就不动了)。页面上写明这是 Mika 自己的测试页。
 *
 * 清单里导出,但要求调用方持有 INTERACT_ACROSS_USERS_FULL(shell 和系统有,普通 App 拿不到),没有 intent-filter:
 * 只由内置助手以 shell 身份按组件名打开到 Mika 的屏上(见 [intent])。
 * 万一开到了主屏(屏号是 0),马上关掉,不打扰用户。控件用普通的 View 和资源 id;
 * 文字按 App 语言取([tr]),自检那边按同样的文字认控件(读屏时有字的控件不带资源 id)。
 */
class SelfCheckTargetActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private var taps = 0
    private var ticks = 0
    private lateinit var count: TextView
    private lateinit var tick: TextView
    private lateinit var strip: View

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(AppLanguage.wrap(newBase))
    }

    private val ticker = object : Runnable {
        override fun run() {
            ticks++
            tick.text = tr(R.string.selfcheck_target_tick, ticks)
            strip.setBackgroundColor(if (ticks % 2 == 0) STRIP_DARK else STRIP_LIGHT)
            main.postDelayed(this, TICK_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if ((display?.displayId ?: Display.DEFAULT_DISPLAY) == Display.DEFAULT_DISPLAY) {
            finish()
            return
        }
        current = WeakReference(this)
        setContentView(content())
    }

    // 再打开一次时从头来:计数清零、输入框清空、滚回顶上
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setContentView(content())
    }

    // 看得见就一直跳(虚拟屏上的页面不一定拿到焦点,不按 onResume 算)
    override fun onStart() {
        super.onStart()
        main.removeCallbacks(ticker)
        if (::tick.isInitialized) main.post(ticker)
    }

    override fun onStop() {
        super.onStop()
        main.removeCallbacks(ticker)
    }

    override fun onDestroy() {
        main.removeCallbacks(ticker)
        if (current?.get() === this) current = null
        super.onDestroy()
    }

    private fun content(): View {
        taps = 0
        val pad = (16 * resources.displayMetrics.density).toInt()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(Color.WHITE)
        }
        fun text(id: Int, s: String, size: Float) = TextView(this).apply {
            this.id = id
            text = s
            textSize = size
            setTextColor(Color.BLACK)
            setPadding(0, pad / 4, 0, pad / 4)
        }
        column.addView(text(R.id.selfcheck_title, tr(R.string.selfcheck_target_title), 20f))
        column.addView(text(R.id.selfcheck_note, tr(R.string.selfcheck_target_note), 14f))
        count = text(R.id.selfcheck_count, tr(R.string.selfcheck_target_taps, 0), 16f)
        column.addView(count)
        column.addView(Button(this).apply {
            id = R.id.selfcheck_button
            text = tr(R.string.selfcheck_target_button)
            // 按钮默认按主题显示成全大写,读屏读到的也就变了样:照写的样子显示
            isAllCaps = false
            setOnClickListener {
                taps++
                count.text = tr(R.string.selfcheck_target_taps, taps)
            }
        })
        column.addView(EditText(this).apply {
            id = R.id.selfcheck_input
            hint = tr(R.string.selfcheck_target_input)
            inputType = InputType.TYPE_CLASS_TEXT
            isSingleLine = true
        }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        tick = text(R.id.selfcheck_tick, tr(R.string.selfcheck_target_tick, ticks), 14f)
        column.addView(tick)
        strip = View(this).apply { setBackgroundColor(STRIP_DARK) }
        column.addView(strip, LinearLayout.LayoutParams(MATCH_PARENT, pad * 4))
        val rows = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        for (i in 1..ROWS) rows.addView(text(View.NO_ID, tr(R.string.selfcheck_target_row, i), 16f).apply { setPadding(0, pad, 0, pad) })
        column.addView(ScrollView(this).apply {
            id = R.id.selfcheck_list
            addView(rows)
        }, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        return column
    }

    companion object {
        private const val TICK_MS = 250L
        private const val ROWS = 60
        private val STRIP_DARK = Color.rgb(0x33, 0x33, 0x33)
        private val STRIP_LIGHT = Color.rgb(0xEE, 0xEE, 0xEE)

        @Volatile private var current: WeakReference<SelfCheckTargetActivity>? = null

        /** 打开这一页用的 intent:指明组件,单独一个任务,不进最近任务。 */
        fun intent(context: Context): Intent = Intent()
            .setClassName(context.packageName, SystemIntents.OWN_PAGE_CLASS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        /** 自检结束或取消:还开着就关掉。主线程调。 */
        fun finishOpen() {
            current?.get()?.finish()
            current = null
        }
    }
}
