import forge from 'node-forge';

/**
 * RSA PKCS#1 v1.5 encryption of the IAAA password (pkucli crates/common/src/iaaa.rs
 * `encrypt_password`: Pkcs1v15Encrypt, then base64). Padding uses the caller's secure random
 * source (expo-crypto in the app) instead of forge's PRNG; forge only does the modular math.
 */
export function encryptPkcs1(pem: string, text: string, randomBytes: (n: number) => Uint8Array): string {
  const key = forge.pki.publicKeyFromPem(pem.includes('BEGIN') ? pem : `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`);
  const k = Math.ceil(key.n.bitLength() / 8);
  const message = forge.util.encodeUtf8(text);
  if (message.length > k - 11) throw new Error('密码过长');
  // EM = 0x00 || 0x02 || PS (non-zero random, ≥ 8 bytes) || 0x00 || M
  const psLength = k - 3 - message.length;
  let ps = '';
  while (ps.length < psLength) {
    for (const b of randomBytes(psLength - ps.length)) if (b !== 0 && ps.length < psLength) ps += String.fromCharCode(b);
  }
  const em = `\x00\x02${ps}\x00${message}`;
  return forge.util.encode64(key.encrypt(em, 'RAW'));
}
