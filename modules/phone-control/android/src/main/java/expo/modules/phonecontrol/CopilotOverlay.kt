package expo.modules.phonecontrol

import android.app.KeyguardManager
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.RippleDrawable
import android.graphics.drawable.InsetDrawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.util.Base64
import android.util.TypedValue
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.PopupMenu
import android.widget.ScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.*
import org.pkuinfo.harness.phone.platform.accessibility.ScreenAccessibility

/** How much of the screen height the live preview may take (it keeps the frame's shape). */
private const val PREVIEW_SCREEN_SHARE = 0.48f

/** Harness-owned controls on the main display; the controlled apps remain on a separate display.
 * Non-focusable, content-sized windows leave the user's keyboard and outside touches alone.
 * Uses Android accessibility overlays, inspired by Mika's OverlayHost (see module NOTICE).
 */
class CopilotOverlay(private val service: ScreenAccessibility, private val sessionId: String) {
    private val manager = service.getSystemService(WindowManager::class.java)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private fun overlayTheme() = if (
        service.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK ==
        android.content.res.Configuration.UI_MODE_NIGHT_YES
    ) android.R.style.Theme_Material_NoActionBar else android.R.style.Theme_Material_Light_NoActionBar
    private val ui = ContextThemeWrapper(service, overlayTheme())
    private var menu: PopupMenu? = null
    private val root = LinearLayout(ui).apply { orientation = LinearLayout.VERTICAL }
    private val gap = size(R.dimen.copilot_overlay_gap)
    private val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
        PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START; x = gap; y = size(R.dimen.copilot_overlay_touch) * 2; title = "Harness Copilot controls" }
    private var attached = false
    private var expanded = false
    private var closed = false
    private var busy = false
    private var rendered = ""
    private var previewJob: Job? = null
    private var previewRevision = 0L
    private data class PreviewRead(val frame: Map<String, Any?>?)
    private var picture: ImageView? = null
    private var bitmap: Bitmap? = null
    private var error: String? = null

    fun show(): Boolean {
        if (attached) return true
        render(false, false, null)
        attached = runCatching { manager.addView(root, params); true }.getOrDefault(false)
        if (!attached) { close(); return false }
        scope.launch {
            while (isActive && !closed) {
                if (PhoneRuntime.activeId() != sessionId) { close(); break }
                val locked = service.getSystemService(KeyguardManager::class.java).isKeyguardLocked
                root.visibility = if (locked) View.GONE else View.VISIBLE
                if (locked) { menu?.dismiss(); clearPreview() }
                if (!locked) {
                    val state = PhoneRuntime.readiness(service)
                    val paused = state["paused"] == true
                    val handed = state["handedOver"] == true
                    val approval = PhoneOverlayBridge.approval?.takeIf { it.sessionId == sessionId }
                    val activity = operationStatus()
                    val key = "${service.resources.configuration.uiMode}:$activity:$expanded:$paused:$handed:${approval?.id}:$busy:$error"
                    if (key != rendered && menu == null) { rendered = key; render(paused, handed, approval) }
                    if (expanded && !handed && !paused && !busy && approval == null && previewJob?.isActive != true) {
                        val revision = previewRevision
                        previewJob = scope.launch {
                            val read = withTimeoutOrNull(2500) {
                                try { PreviewRead(withContext(Dispatchers.Default) { PhoneRuntime.preview(service, sessionId) }) }
                                catch (e: Exception) { if (e is CancellationException) throw e; PreviewRead(null) }
                            }
                            // A canceled/old capture must not repaint after pause, handoff, approval, or lock.
                            if (revision != previewRevision) return@launch
                            if (!canShowPreview()) { clearPreview(); return@launch }
                            if (read != null) {
                                val frame = read.frame
                                if (frame == null) { clearPreview(); return@launch }
                                val uri = frame["uri"] as? String
                                val next = runCatching {
                                    val bytes = uri?.substringAfter(',')?.let { Base64.decode(it, Base64.NO_WRAP) }
                                    bytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
                                }.getOrNull()
                                if (next == null) { clearPreview(); return@launch }
                                picture?.setImageBitmap(next)
                                picture?.setBackgroundColor(service.getColor(R.color.copilot_overlay_preview_surface))
                                bitmap?.recycle(); bitmap = next
                            }
                            // A timeout alone retains the last verified frame while a slow capture retries.
                        }
                    }
                }
                delay(750)
            }
        }
        return true
    }

    private fun canShowPreview(): Boolean {
        if (closed || !expanded || PhoneRuntime.activeId() != sessionId) return false
        if (service.getSystemService(KeyguardManager::class.java).isKeyguardLocked) return false
        val state = PhoneRuntime.readiness(service)
        return state["paused"] != true && state["handedOver"] != true &&
            PhoneOverlayBridge.approval?.sessionId != sessionId
    }

    private fun clearPreview() {
        previewRevision++
        previewJob?.cancel(); previewJob = null
        picture?.setImageDrawable(null)
        picture?.background = null
        bitmap?.recycle(); bitmap = null
    }

    private fun operationStatus(): PhoneOverlayBridge.Status? {
        val host = PhoneOverlayBridge.status?.takeIf { it.sessionId == sessionId }
        val operation = PhoneOverlayBridge.operation(sessionId) ?: return host
        if (host != null && PhoneOperationStatus.preferHost(operation, host.phase, host.updatedAt)) return host
        val title = service.getString(when (operation.operation) {
            "launch" -> R.string.copilot_operation_launch
            "observe" -> R.string.copilot_operation_observe
            "tap" -> R.string.copilot_operation_tap
            "type" -> R.string.copilot_operation_type
            "submit" -> R.string.copilot_operation_submit
            "setProgress" -> R.string.copilot_operation_slider
            "readBrightness" -> R.string.copilot_operation_read_brightness
            "setBrightness" -> R.string.copilot_operation_set_brightness
            "scroll" -> R.string.copilot_operation_scroll
            "back" -> R.string.copilot_operation_back
            "wait" -> R.string.copilot_operation_wait
            "review" -> R.string.copilot_operation_review
            else -> R.string.copilot_running
        })
        return PhoneOverlayBridge.Status(sessionId, operation.phase,
            if (operation.phase == "thinking") service.getString(R.string.copilot_last_operation, title) else title, operation.updatedAt)
    }

    private fun render(paused: Boolean, handed: Boolean, approval: PhoneOverlayBridge.Approval?) {
        ui.setTheme(overlayTheme())
        if (paused || handed || approval != null || !expanded) clearPreview()
        picture?.setImageDrawable(null); picture = null
        root.removeAllViews()
        root.setPadding(gap, 0, gap, if (expanded) gap else 0)
        root.background = surface(R.color.copilot_overlay_surface, R.dimen.copilot_overlay_corner)
        root.elevation = size(R.dimen.copilot_overlay_elevation).toFloat()
        val area = manager.currentWindowMetrics
        val insets = area.windowInsets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout())
        val availableWidth = area.bounds.width() - insets.left - insets.right - gap * 2
        params.width = minOf(size(if (expanded) R.dimen.copilot_overlay_width else R.dimen.copilot_overlay_compact_width), availableWidth)
        // The preview takes the frame's own shape (a phone screen is tall), up to about half the screen
        // height, and the panel is sized around it: no letterbox bars, and the app stays readable.
        val showsPreview = expanded && approval == null && !handed && !paused
        val frame = bitmap
        val aspect = if (frame != null && frame.height > 0) frame.width.toFloat() / frame.height else area.bounds.width().toFloat() / area.bounds.height()
        val screenHeight = area.bounds.height() - insets.top - insets.bottom - gap * 4
        var previewHeight = (screenHeight * PREVIEW_SCREEN_SHARE).toInt()
        var previewWidth = (previewHeight * aspect).toInt()
        if (previewWidth > availableWidth - gap * 2) {
            previewWidth = availableWidth - gap * 2
            previewHeight = (previewWidth / aspect).toInt()
        }
        if (showsPreview) params.width = maxOf(size(R.dimen.copilot_overlay_compact_width), minOf(previewWidth + gap * 2, availableWidth))
        val activity = operationStatus()
        val compactTitle = when {
            approval != null -> R.string.copilot_compact_review
            paused -> R.string.copilot_compact_paused
            handed -> R.string.copilot_compact_user
            activity?.phase == "working" -> R.string.copilot_compact_working
            activity?.phase == "thinking" -> R.string.copilot_compact_thinking
            activity?.phase == "attention" -> R.string.copilot_compact_attention
            else -> R.string.copilot_compact_ready
        }
        val header = LinearLayout(ui).apply { gravity = Gravity.CENTER_VERTICAL }
        val title = label(service.getString(if (expanded) R.string.copilot_name else compactTitle)).apply {
            setTypeface(typeface, Typeface.BOLD)
            maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END
            minHeight = size(R.dimen.copilot_overlay_touch)
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, 0)
            contentDescription = listOfNotNull(service.getString(compactTitle), activity?.title?.takeIf { it.isNotBlank() }).joinToString(". ")
            setOnClickListener { expanded = !expanded; rendered = "" }
            background = ripple(null)
        }
        drag(title)
        header.addView(title, LinearLayout.LayoutParams(0, -2, 1f))
        if (expanded) header.addView(iconButton(R.string.copilot_more, R.drawable.copilot_more) { anchor ->
            PopupMenu(ui, anchor).apply {
                menu.add(service.getString(if (handed) R.string.copilot_handback else R.string.copilot_takeover)).setOnMenuItemClickListener {
                    action { if (handed) PhoneRuntime.handback(service, sessionId) else PhoneRuntime.takeover(service, sessionId) }; true
                }
                menu.add(service.getString(R.string.copilot_panel)).setOnMenuItemClickListener {
                    service.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("pkuharness://p/copilot/home"))
                        .setPackage(service.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
                }
                setOnDismissListener { this@CopilotOverlay.menu = null; rendered = "" }
                this@CopilotOverlay.menu = this
                show()
            }
        })
        header.addView(iconButton(if (expanded) R.string.copilot_collapse else R.string.copilot_expand,
            if (expanded) R.drawable.copilot_collapse else R.drawable.copilot_expand) {
            expanded = !expanded; rendered = ""
        })
        root.addView(header)
        if (expanded) {
            val phase = when {
                paused -> R.string.copilot_paused
                handed -> R.string.copilot_user_control
                approval != null -> R.string.copilot_review
                activity?.phase == "working" -> R.string.copilot_running
                activity?.phase == "thinking" -> R.string.copilot_thinking
                activity?.phase == "attention" -> R.string.copilot_attention
                else -> R.string.copilot_ready
            }
            val content = LinearLayout(ui).apply { orientation = LinearLayout.VERTICAL }
            val detail = if (!paused && !handed && approval == null) activity?.title?.takeIf { it.isNotBlank() } else null
            content.addView(label(error ?: detail ?: service.getString(phase)).apply {
                setTextColor(service.getColor(if (error != null) R.color.copilot_overlay_error else R.color.copilot_overlay_text_muted))
                maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.END
            })
            if (approval != null) {
                content.addView(label(approval.title).apply { setTypeface(typeface, Typeface.BOLD) })
                content.addView(label(approval.detail))
            } else if (!handed && !paused) {
                val preview = FrameLayout(ui).apply {
                    background = surface(R.color.copilot_overlay_preview_surface, R.dimen.copilot_overlay_inner_corner)
                    clipToOutline = true
                }
                preview.addView(label(service.getString(R.string.copilot_preview_loading)).apply {
                    gravity = Gravity.CENTER; setPadding(gap, gap, gap, gap)
                    setTextColor(service.getColor(R.color.copilot_overlay_text_muted))
                }, FrameLayout.LayoutParams(-1, -1))
                picture = ImageView(ui).apply {
                    contentDescription = service.getString(R.string.copilot_preview)
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    setImageBitmap(bitmap)
                    // Opaque only when a frame exists so the empty state stays readable.
                    if (bitmap != null) setBackgroundColor(service.getColor(R.color.copilot_overlay_preview_surface))
                }
                preview.addView(picture, FrameLayout.LayoutParams(-1, -1))
                content.addView(preview, LinearLayout.LayoutParams(minOf(previewWidth, params.width - gap * 2), previewHeight).apply { gravity = Gravity.CENTER_HORIZONTAL })
            }
            // Keep actions reachable on short screens and at enlarged system font sizes.
            val scroll = ScrollView(ui).apply { addView(content); isFillViewport = false }
            val availableHeight = area.bounds.height() - insets.top - insets.bottom - gap * 4
            val contentLimit = maxOf(size(R.dimen.copilot_overlay_touch), availableHeight - size(R.dimen.copilot_overlay_touch) * (if (approval != null) 3 else 2))
            content.measure(View.MeasureSpec.makeMeasureSpec(params.width - gap * 2, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
            root.addView(scroll, LinearLayout.LayoutParams(-1, minOf(content.measuredHeight, contentLimit)))
            if (approval != null) row(
                button(R.string.copilot_deny) { PhoneOverlayBridge.answer(approval, false); rendered = "" },
                button(R.string.copilot_allow, filled = true) { PhoneOverlayBridge.answer(approval, true); rendered = "" })
            root.addView(LinearLayout(ui).apply {
                gravity = Gravity.END
                addView(iconButton(if (paused) R.string.copilot_resume else R.string.copilot_pause,
                    if (paused) R.drawable.copilot_play else R.drawable.copilot_pause, enabled = !busy) {
                    action { PhoneRuntime.pause(sessionId, !paused) }
                })
                addView(iconButton(R.string.copilot_stop, R.drawable.copilot_stop, danger = true) {
                    PhoneRuntime.requestStop(sessionId)
                    service.startService(Intent(service, CopilotService::class.java).setAction("copilot.stop").putExtra("sessionId", sessionId))
                })
            })
        }
        root.post { if (attached && !closed) { clamp(); runCatching { manager.updateViewLayout(root, params) } } }
    }

    private fun action(block: suspend () -> Unit) {
        if (busy) return
        busy = true; error = null; rendered = ""
        scope.launch {
            try { withContext(Dispatchers.Default) { block() } }
            catch (e: Exception) { if (e is CancellationException) throw e; error = e.message }
            finally { busy = false; rendered = "" }
        }
    }
    private fun surface(color: Int, radius: Int) = GradientDrawable().apply {
        setColor(service.getColor(color)); cornerRadius = size(radius).toFloat()
    }
    private fun ripple(background: android.graphics.drawable.Drawable?) = RippleDrawable(
        ColorStateList.valueOf(service.getColor(R.color.copilot_overlay_ripple)), background,
        surface(R.color.copilot_overlay_text, R.dimen.copilot_overlay_inner_corner),
    )
    private fun label(value: String) = TextView(ui).apply {
        text = value; setTextColor(service.getColor(R.color.copilot_overlay_text))
        setTextSize(TypedValue.COMPLEX_UNIT_PX, service.resources.getDimension(R.dimen.copilot_overlay_text))
        setPadding(0, size(R.dimen.copilot_overlay_small_gap), 0, size(R.dimen.copilot_overlay_small_gap))
    }
    private fun iconButton(title: Int, icon: Int, danger: Boolean = false, enabled: Boolean = true, click: (View) -> Unit) = ImageButton(ui).apply {
        setImageResource(icon)
        val color = service.getColor(if (danger) R.color.copilot_overlay_error else R.color.copilot_overlay_text_muted)
        imageTintList = ColorStateList(arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()), intArrayOf(service.getColor(R.color.copilot_overlay_text_muted), color))
        isEnabled = enabled; alpha = if (enabled) 1f else 0.38f
        contentDescription = service.getString(title); tooltipText = contentDescription
        background = ripple(null)
        val padding = size(R.dimen.copilot_overlay_gap)
        setPadding(padding, padding, padding, padding)
        layoutParams = LinearLayout.LayoutParams(size(R.dimen.copilot_overlay_touch), size(R.dimen.copilot_overlay_touch))
        setOnClickListener { click(it) }
    }
    private fun button(title: Int, filled: Boolean = false, click: () -> Unit) = Button(ui, null, android.R.attr.borderlessButtonStyle).apply {
        text = service.getString(title); contentDescription = text; isAllCaps = false
        setTextSize(TypedValue.COMPLEX_UNIT_PX, service.resources.getDimension(R.dimen.copilot_overlay_text))
        val color = service.getColor(when { filled -> R.color.copilot_overlay_on_brand; else -> R.color.copilot_overlay_accent })
        setTextColor(ColorStateList(arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()), intArrayOf(service.getColor(R.color.copilot_overlay_text_muted), color)))
        background = if (filled) InsetDrawable(ripple(surface(R.color.copilot_overlay_brand, R.dimen.copilot_overlay_inner_corner)), 0, size(R.dimen.copilot_overlay_small_gap) / 2, 0, size(R.dimen.copilot_overlay_small_gap) / 2) else ripple(null)
        minHeight = size(R.dimen.copilot_overlay_touch); minimumHeight = minHeight
        minWidth = 0; minimumWidth = 0
        setPadding(size(R.dimen.copilot_overlay_small_gap), 0, size(R.dimen.copilot_overlay_small_gap), 0)
        isEnabled = !busy || title == R.string.copilot_stop
        setOnClickListener { click() }
    }
    private fun row(vararg buttons: Button) {
        root.addView(LinearLayout(ui).apply {
            orientation = LinearLayout.HORIZONTAL
            buttons.forEach { addView(it, LinearLayout.LayoutParams(0, -2, 1f)) }
        })
    }
    @android.annotation.SuppressLint("ClickableViewAccessibility")
    private fun drag(view: View) {
        var x = 0f; var y = 0f; var startX = 0; var startY = 0; var moved = false
        val slop = ViewConfiguration.get(service).scaledTouchSlop
        view.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> { x = event.rawX; y = event.rawY; startX = params.x; startY = params.y; moved = false; true }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - x; val dy = event.rawY - y
                    if (kotlin.math.abs(dx) + kotlin.math.abs(dy) > slop) moved = true
                    if (moved) { params.x = startX + dx.toInt(); params.y = startY + dy.toInt(); clamp(); runCatching { manager.updateViewLayout(root, params) } }
                    true
                }
                MotionEvent.ACTION_UP -> { if (!moved) view.performClick(); true }
                MotionEvent.ACTION_CANCEL -> true
                else -> false
            }
        }
    }
    private fun clamp() {
        val area = manager.currentWindowMetrics
        val inset = area.windowInsets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout())
        params.x = params.x.coerceIn(inset.left, maxOf(inset.left, area.bounds.width() - root.width - inset.right))
        params.y = params.y.coerceIn(inset.top, maxOf(inset.top, area.bounds.height() - root.height - inset.bottom))
    }
    private fun size(id: Int) = service.resources.getDimensionPixelSize(id)
    fun close() {
        if (closed) return
        closed = true
        menu?.dismiss(); menu = null
        if (attached) runCatching { manager.removeViewImmediate(root) }
        attached = false; clearPreview(); picture = null
        scope.cancel()
        PhoneOverlayBridge.clear(sessionId)
    }
}
