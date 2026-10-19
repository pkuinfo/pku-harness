/// <reference types="bun" />
import { createHash, createHmac } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

import { base32Decode, hmacSha1, hotp, sha1, totp } from './totp';

// otp.ts itself needs SecureStore and the native HTTP module; its math lives in totp.ts.

const ascii = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('sha1 / hmac', () => {
  test('matches node:crypto for assorted lengths', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 200, 1000]) {
      const m = Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff);
      expect(hex(sha1(m))).toBe(createHash('sha1').update(m).digest('hex'));
      const k = Uint8Array.from({ length: (n % 90) + 1 }, (_, i) => i ^ 0x5a);
      expect(hex(hmacSha1(k, m))).toBe(createHmac('sha1', k).update(m).digest('hex'));
    }
  });
  test('FIPS "abc"', () => {
    expect(hex(sha1(ascii('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
});

describe('RFC 4226 HOTP', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  test('appendix D', () => {
    expected.forEach((code, i) => expect(hotp(ascii('12345678901234567890'), i)).toBe(code));
  });
});

describe('RFC 6238 TOTP (SHA1)', () => {
  const secret = ascii('12345678901234567890');
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  test('appendix B, 8 digits', () => {
    for (const [t, code] of vectors) expect(hotp(secret, Math.floor(t / 30), 8)).toBe(code);
  });
  test('totp() from Base32 and remaining seconds', () => {
    const b32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    for (const [t, code] of vectors) {
      const r = totp(b32, t * 1000, 8);
      expect(r.code).toBe(code);
      expect(r.remainingSeconds).toBe(30 - (t % 30));
    }
    expect(totp(b32, 59_000).code).toBe('287082'); // 6 digits = last six
  });
});

describe('base32Decode', () => {
  test('RFC 4648 vectors, with and without padding', () => {
    const cases: [string, string][] = [
      ['', ''],
      ['MY', 'f'],
      ['MZXQ', 'fo'],
      ['MZXW6', 'foo'],
      ['MZXW6YQ', 'foob'],
      ['MZXW6YTB', 'fooba'],
      ['MZXW6YTBOI', 'foobar'],
    ];
    for (const [enc, dec] of cases.slice(1)) {
      expect(new TextDecoder().decode(base32Decode(enc))).toBe(dec);
      const padded = enc + '='.repeat((8 - (enc.length % 8)) % 8);
      expect(new TextDecoder().decode(base32Decode(padded))).toBe(dec);
    }
  });
  test('ignores case, spaces and dashes', () => {
    expect(new TextDecoder().decode(base32Decode('mzxw 6ytb-oi'))).toBe('foobar');
  });
  test('rejects invalid input', () => {
    expect(() => base32Decode('')).toThrow();
    expect(() => base32Decode('MZ1W')).toThrow();
  });
});
