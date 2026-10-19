/**
 * RFC 6238 TOTP (HMAC-SHA1, 30 s step, 6 digits) for the IAAA 手机令牌, in pure TS so it runs
 * the same in Hermes and bun tests. Ported from pkucli crates/common/src/otp.rs
 * (`generate_totp` / `generate_hotp`). Kept free of app imports so it is unit-testable.
 */

export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 Base32 (padding, spaces, dashes and case ignored), as pkucli accepts with/without padding. */
export function base32Decode(input: string): Uint8Array {
  const s = input.toUpperCase().replace(/[\s=-]/g, '');
  if (!s) throw new Error('令牌密钥为空');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('令牌密钥不是有效的 Base32');
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

/** FIPS 180-4 SHA-1 (only used inside HMAC for TOTP). */
export function sha1(msg: Uint8Array): Uint8Array {
  const ml = msg.length;
  const total = (((ml + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[ml] = 0x80;
  const dv = new DataView(buf.buffer);
  // Message length in bits, big-endian 64-bit (high word covers inputs >= 512 MiB).
  dv.setUint32(total - 8, Math.floor(ml / 0x20000000));
  dv.setUint32(total - 4, (ml << 3) >>> 0);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Int32Array(80);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = t;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => odv.setInt32(i * 4, h));
  return out;
}

/** RFC 2104 HMAC-SHA1. */
export function hmacSha1(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const k = key.length > 64 ? sha1(key) : key;
  const ipad = new Uint8Array(64 + msg.length);
  const opad = new Uint8Array(64 + 20);
  for (let i = 0; i < 64; i++) {
    const b = k[i] ?? 0;
    ipad[i] = b ^ 0x36;
    opad[i] = b ^ 0x5c;
  }
  ipad.set(msg, 64);
  opad.set(sha1(ipad), 64);
  return sha1(opad);
}

/** RFC 4226 HOTP with dynamic truncation. */
export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const msg = new Uint8Array(8);
  const dv = new DataView(msg.buffer);
  dv.setUint32(0, Math.floor(counter / 0x100000000));
  dv.setUint32(4, counter >>> 0);
  const h = hmacSha1(secret, msg);
  const off = h[19] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** The TOTP code for a Base32 secret at `nowMs`, and seconds until it rolls over. */
export function totp(secretBase32: string, nowMs = Date.now(), digits = TOTP_DIGITS): { code: string; remainingSeconds: number } {
  const sec = Math.floor(nowMs / 1000);
  const counter = Math.floor(sec / TOTP_PERIOD);
  return { code: hotp(base32Decode(secretBase32), counter, digits), remainingSeconds: TOTP_PERIOD - (sec % TOTP_PERIOD) };
}
