import { describe, expect, test } from 'bun:test';

import { decodeBase64, PauseSplitter, wavFile } from './audio';

describe('audio helpers', () => {
  test('base64 decodes to bytes', () => {
    expect(decodeBase64(btoa('\x00\x01\xff'))).toEqual(new Uint8Array([0, 1, 255]));
  });

  test('WAV header describes 16 kHz mono 16-bit PCM', () => {
    const wav = wavFile(new Uint8Array(3200));
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(40, true)).toBe(3200);
    expect(wav.length).toBe(3244);
  });

  test('PauseSplitter: a piece after speech then a pause; silence alone sends nothing', () => {
    const s = new PauseSplitter();
    const chunk = new Uint8Array(3200);
    for (let i = 0; i < 20; i++) expect(s.push(chunk, 0.05)).toBeNull(); // 2 s of silence
    for (let i = 0; i < 10; i++) expect(s.push(chunk, 0.6)).toBeNull(); // 1 s of speech
    let piece: Uint8Array | null = null;
    for (let i = 0; i < 6 && !piece; i++) piece = s.push(chunk, 0.05);
    expect(piece).not.toBeNull();
    // Kept at most 0.6 s of leading silence + 1 s speech + 0.6 s pause.
    expect(piece!.length).toBeLessThanOrEqual(22 * 3200);
    expect(s.flush()).toBeNull();
    s.push(chunk, 0.6);
    expect(s.flush()?.length).toBeGreaterThan(0);
  });
});
