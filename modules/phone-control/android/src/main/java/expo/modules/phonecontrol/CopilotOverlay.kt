package expo.modules.phonecontrol

import android.app.KeyguardManager
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.util.Base64
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.*
import org.pkuinfo.harness.phone.platform.accessibility.ScreenAccessibility

/** Harness-owned controls on the main display; the controlled apps remain on a separate display.
 * Non-focusable, content-sized windows leave the user's keyboard and outside touches alone.
 * Uses Android accessibility overlays, inspired by Mika's OverlayHost (see module NOTICE).
 */
class CopilotOverlay(private val service: ScreenAccessibility, private val sessionId: String) {
    private val manager = service.getSystemService(WindowManager::class.java)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val root = LinearLayout(service).apply { orientation = LinearLayout.VERTICAL }
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
                if (locked) clearPreview()
                if (!locked) {
                    val state = PhoneRuntime.readiness(service)
                    val paused = state["paused"] == true
                    val handed = state["handedOver"] == true
                    val approval = PhoneOverlayBridge.approval?.takeIf { it.sessionId == sessionId }
                    val activity = operationStatus()
                    val key = "$activity:$expanded:$paused:$handed:${approval?.id}:$busy:$error"
                    if (key != rendered) { rendered = key; render(paused, handed, approval) }
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
        if (paused || handed || approval != null || !expanded) clearPreview()
        picture?.setImageDrawable(null); picture = null
        root.removeAllViews()
        root.setPadding(gap, gap, gap, gap)
        root.background = GradientDrawable().apply {
            setColor(service.getColor(R.color.copilot_overlay_surface))
            cornerRadius = size(R.dimen.copilot_overlay_corner).toFloat()
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
        val header = button(if (expanded) R.string.copilot_collapse else compactTitle) {
            expanded = !expanded; rendered = ""
        }
        if (!expanded) {
            header.maxWidth = size(R.dimen.copilot_overlay_compact_width) - gap * 2
            header.maxLines = 1
            header.ellipsize = android.text.TextUtils.TruncateAt.END
            header.contentDescription = listOfNotNull(service.getString(compactTitle), activity?.title?.takeIf { it.isNotBlank() }).joinToString(". ")
        }
        drag(header)
        root.addView(header)
        params.width = if (expanded) size(R.dimen.copilot_overlay_width) else WindowManager.LayoutParams.WRAP_CONTENT
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
            root.addView(label(error ?: service.getString(phase)))
            if (!paused && !handed && approval == null && activity?.title?.isNotBlank() == true) {
                root.addView(label(activity.title).apply { maxLines = 2 })
            }
            if (approval != null) {
                root.addView(label(approval.title))
                root.addView(label(approval.detail).apply { maxLines = 8 })
                row(button(R.string.copilot_deny) { PhoneOverlayBridge.answer(approval, false); rendered = "" },
                    button(R.string.copilot_allow) { PhoneOverlayBridge.answer(approval, true); rendered = "" })
            } else if (!handed && !paused) {
                picture = ImageView(service).apply {
                    contentDescription = service.getString(R.string.copilot_preview)
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    setImageBitmap(bitmap)
                }
                root.addView(picture, LinearLayout.LayoutParams(-1, size(R.dimen.copilot_overlay_preview_height)))
            }
            row(button(if (paused) R.string.copilot_resume else R.string.copilot_pause) {
                action { PhoneRuntime.pause(sessionId, !paused) }
            }, button(R.string.copilot_stop) {
                PhoneRuntime.requestStop(sessionId)
                service.startService(Intent(service, CopilotService::class.java).setAction("copilot.stop").putExtra("sessionId", sessionId))
            })
            root.addView(button(if (handed) R.string.copilot_handback else R.string.copilot_takeover) {
                action { if (handed) PhoneRuntime.handback(service, sessionId) else PhoneRuntime.takeover(service, sessionId) }
            })
            root.addView(button(R.string.copilot_panel) {
                service.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("pkuharness://p/copilot/home"))
                    .setPackage(service.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
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
    private fun label(value: String) = TextView(service).apply {
        text = value; setTextColor(service.getColor(R.color.copilot_overlay_text))
        setTextSize(TypedValue.COMPLEX_UNIT_PX, service.resources.getDimension(R.dimen.copilot_overlay_text))
        setPadding(0, gap, 0, gap)
    }
    private fun button(title: Int, click: () -> Unit) = Button(service).apply {
        text = service.getString(title); contentDescription = text; isAllCaps = false
        setTextSize(TypedValue.COMPLEX_UNIT_PX, service.resources.getDimension(R.dimen.copilot_overlay_text))
        backgroundTintList = ColorStateList.valueOf(service.getColor(R.color.copilot_overlay_brand))
        setTextColor(service.getColor(R.color.copilot_overlay_on_brand))
        minHeight = size(R.dimen.copilot_overlay_touch); isEnabled = !busy || title == R.string.copilot_stop
        setOnClickListener { click() }
    }
    private fun row(vararg buttons: Button) {
        root.addView(LinearLayout(service).apply {
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
        if (attached) runCatching { manager.removeViewImmediate(root) }
        attached = false; clearPreview(); picture = null
        scope.cancel()
        PhoneOverlayBridge.clear(sessionId)
    }
}
