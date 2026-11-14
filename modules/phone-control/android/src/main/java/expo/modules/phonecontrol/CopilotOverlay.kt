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

/** How much of the screen height the live preview takes (it keeps the frame's shape); the user drags its grip to change it. */
private const val PREVIEW_SHARE_DEFAULT = 0.36f
private const val PREVIEW_SHARE_MIN = 0.22f
private const val PREVIEW_SHARE_MAX = 0.62f
private const val PREFS = "copilot_overlay"
private const val PREVIEW_SHARE_KEY = "previewShare"
/** The task whose panel the user minimized; survives the panel being rebuilt. */
@Volatile private var minimizedTask: String? = null

/** Harness-owned controls on the main display; the controlled apps remain on a separate display.
 * Non-focusable, content-sized windows leave the user's keyboard and outside touches alone.
 * Uses Android accessibility overlays, inspired by Mika's OverlayHost (see module NOTICE).
 */
class CopilotOverlay(private val service: ScreenAccessibility, private val sessionId: String) {
    private val manager = service.getSystemService(WindowManager::class.java)

    /** False once Android has rebound the accessibility service: this panel's window is gone with the old one. */
    fun belongsTo(current: ScreenAccessibility) = current === service
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
    // The full window by default; Minimize turns it into the ball, and tapping the ball brings it back.
    // Kept per task across panel instances: the panel is rebuilt whenever the accessibility service
    // rebinds (AccessibilityParking), and a minimized ball must not come back as the full window.
    private var expanded = minimizedTask != sessionId
        set(value) { field = value; minimizedTask = if (value) null else sessionId }
    /**
     * Harness itself is in front on the main display: chat already shows the task, so the window stays a ball.
     * Starts true: a panel built over Recents or the shade stays a ball until a real app is in front.
     */
    private var inFront = true
    /** The user tapped the ball while Harness was in front: open anyway until they leave Harness. */
    private var openInFront = false
    private fun open() = expanded && (!inFront || openInFront)
    /**
     * Null while system UI is on top (notification shade, Recents, the launcher in between): those
     * pass over the current app and must not open or close the panel.
     */
    private fun harnessInFront(): Boolean? = runCatching {
        // The topmost app window on the main display (windows come in z-order). Not "active": focus
        // can sit on Copilot's own display, and the notification shade is a system window above it.
        val top = service.windows.firstOrNull { it.type == android.view.accessibility.AccessibilityWindowInfo.TYPE_APPLICATION }
            ?.root?.packageName?.toString() ?: return@runCatching false
        if (top == "com.android.systemui" || top == launcher) null else top == service.packageName
    }.getOrDefault(null)
    private val launcher = service.packageManager.resolveActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)?.activityInfo?.packageName
    private var closed = false
    private var busy = false
    private var rendered = ""
    private var previewJob: Job? = null
    private var previewRevision = 0L
    private data class PreviewRead(val frame: Map<String, Any?>?)
    private var picture: ImageView? = null
    private var bitmap: Bitmap? = null
    private var error: String? = null
    private val prefs = service.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
    private var previewShare = prefs.getFloat(PREVIEW_SHARE_KEY, PREVIEW_SHARE_DEFAULT).coerceIn(PREVIEW_SHARE_MIN, PREVIEW_SHARE_MAX)
    private var lastApproval: Int? = null
    private var wasHanded = false
    /** A resize drag in progress: the status loop must not rebuild the panel under the finger. */
    private var resizing = false

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
                    // A new approval opens the panel, so a minimized ball never leaves a task waiting unseen.
                    if (approval != null && approval.id != lastApproval) { lastApproval = approval.id; expanded = true }
                    // A handoff opens the panel too: it says what to do and holds the Done button.
                    if (handed && !wasHanded) expanded = true
                    wasHanded = handed
                    val front = harnessInFront() ?: inFront
                    if (front != inFront) { inFront = front; if (!front) openInFront = false }
                    val activity = operationStatus()
                    val key = "${service.resources.configuration.uiMode}:$activity:${open()}:$paused:$handed:${PhoneRuntime.handoffNote}:${approval?.id}:$busy:$error"
                    if (key != rendered && menu == null && !resizing) { rendered = key; render(paused, handed, approval) }
                    if (open() && !handed && !paused && !busy && approval == null && previewJob?.isActive != true) {
                        val revision = previewRevision
                        previewJob = scope.launch {
                            val read = withTimeoutOrNull(2500) {
                                try { PreviewRead(withContext(Dispatchers.Default) { PhoneRuntime.preview(service, sessionId) }) }
                                catch (e: Exception) { if (e is CancellationException) throw e; PreviewRead(null) }
                            }
                            // A canceled/old capture must not repaint after pause, handoff, approval, or lock.
                            if (revision != previewRevision) return@launch
                            if (!open()) return@launch // Minimized meanwhile: keep the last frame for reopening.
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
        if (closed || !open() || PhoneRuntime.activeId() != sessionId) return false
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
            "look" -> R.string.copilot_operation_look
            "tapAt" -> R.string.copilot_operation_tap_at
            "typeAt" -> R.string.copilot_operation_type
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
        val expanded = open()
        ui.setTheme(overlayTheme())
        // Minimizing keeps the last frame, so reopening the window shows it at once.
        if (paused || handed || approval != null) clearPreview()
        picture?.setImageDrawable(null); picture = null
        root.removeAllViews()
        // Tight sides: the preview runs almost edge to edge, with the panel's inner gap around it.
        val pad = size(R.dimen.copilot_overlay_small_gap)
        root.setPadding(pad, 0, pad, if (expanded) pad else 0)
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
        var previewHeight = (screenHeight * previewShare).toInt()
        var previewWidth = (previewHeight * aspect).toInt()
        if (previewWidth > availableWidth - pad * 2) {
            previewWidth = availableWidth - pad * 2
            previewHeight = (previewWidth / aspect).toInt()
        }
        if (showsPreview) {
            params.width = maxOf(size(R.dimen.copilot_overlay_compact_width), minOf(previewWidth + pad * 2, availableWidth))
            // The header needs a minimum width; a narrower frame grows to fill it instead of leaving bars.
            if (previewWidth < params.width - pad * 2) {
                previewWidth = params.width - pad * 2
                previewHeight = (previewWidth / aspect).toInt()
            }
        }
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
        if (!expanded) {
            ball(compactTitle, when {
                approval != null || activity?.phase == "attention" -> R.color.copilot_overlay_attention
                paused || handed -> R.color.copilot_overlay_text_muted
                activity?.phase == "working" || activity?.phase == "thinking" -> R.color.copilot_overlay_brand
                else -> null
            })
            root.post { if (attached && !closed) { clamp(); runCatching { manager.updateViewLayout(root, params) } } }
            return
        }
        val header = LinearLayout(ui).apply { gravity = Gravity.CENTER_VERTICAL }
        val title = label(service.getString(if (expanded) R.string.copilot_name else compactTitle)).apply {
            setTypeface(typeface, Typeface.BOLD)
            maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END
            minHeight = size(R.dimen.copilot_overlay_touch)
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, 0)
            contentDescription = listOfNotNull(service.getString(compactTitle), activity?.title?.takeIf { it.isNotBlank() }).joinToString(". ")
            setOnClickListener { toggle() }
            background = ripple(null)
        }
        drag(title)
        header.addView(title, LinearLayout.LayoutParams(0, -2, 1f))
        if (expanded) header.addView(iconButton(R.string.copilot_more, R.drawable.copilot_more) { anchor ->
            PopupMenu(ui, anchor).apply {
                menu.add(service.getString(if (handed) R.string.copilot_handback else R.string.copilot_takeover)).setOnMenuItemClickListener {
                    if (handed) handBack() else action { PhoneRuntime.takeover(service, sessionId) }; true
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
            toggle()
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
            } else if (handed) {
                content.addView(label(PhoneRuntime.handoffNote ?: service.getString(R.string.copilot_handoff_hint)).apply { setTypeface(typeface, Typeface.BOLD) })
            } else if (!paused) {
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
                preview.addView(grip(preview, aspect, screenHeight, availableWidth),
                    FrameLayout.LayoutParams(size(R.dimen.copilot_overlay_grip), size(R.dimen.copilot_overlay_grip), Gravity.BOTTOM or Gravity.END))
                content.addView(preview, LinearLayout.LayoutParams(minOf(previewWidth, params.width - pad * 2), previewHeight).apply { gravity = Gravity.CENTER_HORIZONTAL })
            }
            // Keep actions reachable on short screens and at enlarged system font sizes.
            val scroll = ScrollView(ui).apply { addView(content); isFillViewport = false }
            val availableHeight = area.bounds.height() - insets.top - insets.bottom - gap * 4
            val contentLimit = maxOf(size(R.dimen.copilot_overlay_touch), availableHeight - size(R.dimen.copilot_overlay_touch) * (if (approval != null) 3 else 2))
            content.measure(View.MeasureSpec.makeMeasureSpec(params.width - pad * 2, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
            root.addView(scroll, LinearLayout.LayoutParams(-1, minOf(content.measuredHeight, contentLimit)))
            if (approval != null) row(
                button(R.string.copilot_deny) { PhoneOverlayBridge.answer(approval, false); rendered = "" },
                button(R.string.copilot_allow, filled = true) { PhoneOverlayBridge.answer(approval, true); rendered = "" })
            else if (handed) row(button(R.string.copilot_handback_done, filled = true) { handBack() })
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

    private fun toggle() {
        if (open()) { expanded = false; openInFront = false } else { expanded = true; if (inFront) openInFront = true }
        rendered = ""
    }

    /**
     * The user is done with a handed-over step (a payment, a login): the app goes back to Copilot
     * and PKU harness comes to the front, where the task goes on in the chat, instead of leaving
     * the user wherever the handoff happened.
     */
    private fun handBack() = action {
        PhoneRuntime.handback(service, sessionId)
        service.packageManager.getLaunchIntentForPackage(service.packageName)
            ?.let { service.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
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
    private fun drag(view: View, snap: Boolean = false) {
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
                MotionEvent.ACTION_UP -> {
                    if (!moved) view.performClick()
                    else if (snap) snapToEdge()
                    true
                }
                MotionEvent.ACTION_CANCEL -> true
                else -> false
            }
        }
    }
    /** The minimized ball rests against the nearer side edge, like other floating bubbles. */
    private fun snapToEdge() {
        val area = manager.currentWindowMetrics
        val inset = area.windowInsets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout())
        val left = params.x + root.width / 2 < area.bounds.width() / 2
        params.x = if (left) inset.left + gap / 2 else area.bounds.width() - root.width - inset.right - gap / 2
        clamp(); runCatching { manager.updateViewLayout(root, params) }
    }

    /** Minimized: a round button with the app icon and a dot for what Copilot is doing; tap to open, drag to move. */
    private fun ball(description: Int, dot: Int?) {
        val diameter = size(R.dimen.copilot_overlay_ball)
        root.setPadding(0, 0, 0, 0)
        root.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(service.getColor(R.color.copilot_overlay_surface)) }
        params.width = diameter
        val face = FrameLayout(ui).apply {
            contentDescription = listOf(service.getString(description), service.getString(R.string.copilot_open_panel)).joinToString(". ")
            setOnClickListener { expanded = true; if (inFront) openInFront = true; rendered = "" }
        }
        face.addView(ImageView(ui).apply {
            setImageDrawable(service.packageManager.getApplicationIcon(service.packageName))
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL }
            clipToOutline = true
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }, FrameLayout.LayoutParams(-1, -1).apply { val m = size(R.dimen.copilot_overlay_small_gap) / 2; setMargins(m, m, m, m) })
        if (dot != null) face.addView(View(ui).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL; setColor(service.getColor(dot))
                setStroke(size(R.dimen.copilot_overlay_small_gap) / 4, service.getColor(R.color.copilot_overlay_surface))
            }
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }, FrameLayout.LayoutParams(size(R.dimen.copilot_overlay_ball_dot), size(R.dimen.copilot_overlay_ball_dot), Gravity.TOP or Gravity.END))
        drag(face, snap = true)
        root.addView(face, LinearLayout.LayoutParams(diameter, diameter))
    }

    /**
     * The corner grip resizes the preview: dragging down or outward makes it larger. The panel follows
     * live, and the size is kept for later tasks.
     */
    @android.annotation.SuppressLint("ClickableViewAccessibility")
    private fun grip(preview: View, aspect: Float, screenHeight: Int, availableWidth: Int) = ImageView(ui).apply {
        setImageResource(R.drawable.copilot_resize)
        imageTintList = ColorStateList.valueOf(service.getColor(R.color.copilot_overlay_text_muted))
        contentDescription = service.getString(R.string.copilot_resize)
        val inset = size(R.dimen.copilot_overlay_small_gap)
        setPadding(inset, inset, inset / 2, inset / 2)
        var startY = 0f; var startX = 0f; var startShare = previewShare
        setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    startX = event.rawX; startY = event.rawY; startShare = previewShare; resizing = true
                    // The scroll box was sized for the old preview; let it follow the drag.
                    (preview.parent?.parent as? View)?.let { box -> box.layoutParams = box.layoutParams.apply { height = LinearLayout.LayoutParams.WRAP_CONTENT } }
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    // Width changes count through the frame's shape, so a sideways drag resizes too.
                    val grow = maxOf(event.rawY - startY, (event.rawX - startX) / aspect)
                    val maxShare = minOf(PREVIEW_SHARE_MAX, (availableWidth - size(R.dimen.copilot_overlay_small_gap) * 2) / aspect / screenHeight)
                    previewShare = (startShare + grow / screenHeight).coerceIn(PREVIEW_SHARE_MIN, maxOf(PREVIEW_SHARE_MIN, maxShare))
                    val height = (screenHeight * previewShare).toInt()
                    val width = (height * aspect).toInt()
                    preview.layoutParams = preview.layoutParams.apply { this.width = width; this.height = height }
                    params.width = maxOf(size(R.dimen.copilot_overlay_compact_width), width + size(R.dimen.copilot_overlay_small_gap) * 2)
                    root.requestLayout()
                    runCatching { manager.updateViewLayout(root, params) }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    prefs.edit().putFloat(PREVIEW_SHARE_KEY, previewShare).apply()
                    resizing = false
                    rendered = ""
                    true
                }
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
