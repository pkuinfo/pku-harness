/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import forge from 'node-forge';

import { encryptPkcs1 } from './rsa';

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

describe('encryptPkcs1', () => {
  const pair = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const pem = forge.pki.publicKeyToPem(pair.publicKey);

  test('round-trips through PKCS#1 v1.5 decryption', () => {
    const out = encryptPkcs1(pem, 'p@ss-密码', rand);
    const plain = pair.privateKey.decrypt(forge.util.decode64(out), 'RSAES-PKCS1-V1_5');
    expect(forge.util.decodeUtf8(plain)).toBe('p@ss-密码');
  });

  test('accepts a bare base64 key body (IAAA may omit PEM armour)', () => {
    const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const out = encryptPkcs1(body, 'x', rand);
    expect(forge.util.decodeUtf8(pair.privateKey.decrypt(forge.util.decode64(out), 'RSAES-PKCS1-V1_5'))).toBe('x');
  });

  test('is randomized', () => {
    expect(encryptPkcs1(pem, 'same', rand)).not.toBe(encryptPkcs1(pem, 'same', rand));
  });
});
