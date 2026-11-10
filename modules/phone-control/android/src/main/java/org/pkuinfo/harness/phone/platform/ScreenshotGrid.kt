package org.pkuinfo.harness.phone.platform

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import kotlin.math.roundToInt

/**
 * Labelled rulers drawn onto the screenshot a vision model reads before a point action. Models are
 * poor at estimating raw pixel positions in an unmarked image (a tap meant for a bottom tab landed
 * mid-screen); with a grid line every tenth of the image and its pixel value on the edges, they read
 * coordinates off the rulers instead. Labels are in the image's own pixels, the space `tapAt` takes.
 */
internal object ScreenshotGrid {
    private const val DIVISIONS = 10

    fun draw(shot: Bitmap) {
        val canvas = Canvas(shot)
        val w = shot.width.toFloat()
        val h = shot.height.toFloat()
        val unit = minOf(w, h) / 40f
        val line = Paint().apply { color = Color.argb(150, 255, 0, 170); strokeWidth = maxOf(1f, unit / 6f) }
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textSize = unit * 1.15f; isFakeBoldText = true }
        val box = Paint().apply { color = Color.argb(200, 120, 0, 80) }
        val pad = unit / 4f
        fun label(value: Int, x: Float, y: Float) {
            val s = value.toString()
            val tw = text.measureText(s)
            val left = (x - tw / 2f - pad).coerceIn(0f, w - tw - pad * 2)
            val top = y.coerceIn(0f, h - text.textSize - pad * 2)
            canvas.drawRect(RectF(left, top, left + tw + pad * 2, top + text.textSize + pad * 2), box)
            canvas.drawText(s, left + pad, top + pad + text.textSize * 0.85f, text)
        }
        for (i in 1 until DIVISIONS) {
            val x = w * i / DIVISIONS
            val y = h * i / DIVISIONS
            canvas.drawLine(x, 0f, x, h, line)
            canvas.drawLine(0f, y, w, y, line)
            label(x.roundToInt(), x, 0f)
            label(y.roundToInt(), 0f, y - (text.textSize + pad * 2) / 2f)
        }
    }
}
