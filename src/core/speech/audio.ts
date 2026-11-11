/** PCM helpers for dictation (pure: unit-tested). Audio is 16 kHz mono 16-bit PCM in 100 ms chunks from the voice-capture module. */

export const SAMPLE_RATE = 16_000;
/** A chunk at or above this level (0…1) counts as speech. */
const SPEECH_LEVEL = 0.25;
/** A file service gets a piece once this much speech is followed by this much silence. */
const PIECE_SPEECH_MS = 800;
const PIECE_PAUSE_MS = 600;
/** …or once a piece is this long, pause or not. */
const PIECE_MAX_MS = 20_000;
const CHUNK_MS = 100;

/** base64 → bytes. */
export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 16 kHz mono 16-bit PCM wrapped as a WAV file. */
export function wavFile(pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/**
 * Cuts dictation into pieces at natural pauses, so a service that only takes finished recordings
 * can transcribe each piece while the user keeps talking. `push` returns a finished piece (PCM)
 * when one is ready; `flush` returns what is left (null when it held no speech).
 */
export class PauseSplitter {
  private chunks: Uint8Array[] = [];
  private speechMs = 0;
  private pauseMs = 0;

  push(pcm: Uint8Array, level: number): Uint8Array | null {
    this.chunks.push(pcm);
    if (level >= SPEECH_LEVEL) {
      this.speechMs += CHUNK_MS;
      this.pauseMs = 0;
    } else this.pauseMs += CHUNK_MS;
    const long = this.chunks.length * CHUNK_MS >= PIECE_MAX_MS;
    if ((this.speechMs >= PIECE_SPEECH_MS && this.pauseMs >= PIECE_PAUSE_MS) || (long && this.speechMs > 0)) return this.take();
    // Leading silence isn't worth sending: keep only the last pause's worth.
    if (this.speechMs === 0 && this.chunks.length > PIECE_PAUSE_MS / CHUNK_MS) this.chunks.shift();
    return null;
  }

  flush(): Uint8Array | null {
    return this.speechMs > 0 ? this.take() : null;
  }

  private take(): Uint8Array {
    const out = new Uint8Array(this.chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    this.chunks = [];
    this.speechMs = 0;
    this.pauseMs = 0;
    return out;
  }
}
