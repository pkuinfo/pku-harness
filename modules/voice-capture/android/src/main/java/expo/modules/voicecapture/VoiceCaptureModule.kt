package expo.modules.voicecapture

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.concurrent.thread
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Streams the microphone as 16 kHz mono 16-bit PCM in 100 ms chunks (base64) with a loudness
 * level 0…1, for voice input that is transcribed while the user talks.
 */
class VoiceCaptureModule : Module() {
  @Volatile private var record: AudioRecord? = null
  @Volatile private var running = false

  override fun definition() = ModuleDefinition {
    Name("VoiceCapture")
    Events("onChunk", "onError")

    AsyncFunction("start") { start() }
    AsyncFunction("stop") { stop() }

    OnDestroy { stop() }
  }

  @SuppressLint("MissingPermission") // the JS side asks for RECORD_AUDIO first
  private fun start() {
    stop()
    val min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val rec = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT, maxOf(min, CHUNK_BYTES * 4))
    if (rec.state != AudioRecord.STATE_INITIALIZED) {
      rec.release()
      throw IllegalStateException("The microphone is not available")
    }
    record = rec
    running = true
    rec.startRecording()
    thread(name = "voice-capture") {
      val buf = ByteArray(CHUNK_BYTES)
      while (running) {
        var filled = 0
        while (running && filled < CHUNK_BYTES) {
          val n = rec.read(buf, filled, CHUNK_BYTES - filled)
          if (n < 0) {
            sendEvent("onError", mapOf("message" to "Microphone read failed ($n)"))
            running = false
            break
          }
          filled += n
        }
        if (filled == 0) continue
        sendEvent("onChunk", mapOf("data" to Base64.encodeToString(buf, 0, filled, Base64.NO_WRAP), "level" to level(buf, filled)))
      }
      runCatching { rec.stop() }
      rec.release()
    }
  }

  private fun stop() {
    running = false
    record = null
  }

  /** RMS in dBFS mapped to 0…1 (-55 dB → 0). */
  private fun level(buf: ByteArray, len: Int): Double {
    var sum = 0.0
    var i = 0
    while (i + 1 < len) {
      val s = ((buf[i + 1].toInt() shl 8) or (buf[i].toInt() and 0xff)).toShort().toDouble()
      sum += s * s
      i += 2
    }
    val rms = sqrt(sum / maxOf(1, len / 2)) / 32768.0
    val db = if (rms > 0) 20 * log10(rms) else -160.0
    return ((db + 55) / 55).coerceIn(0.0, 1.0)
  }

  private companion object {
    const val RATE = 16_000
    /** 100 ms of 16-bit mono. */
    const val CHUNK_BYTES = RATE / 10 * 2
  }
}
