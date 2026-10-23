import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import {
  assetsToKeep,
  BOUNDARY,
  buildManifest,
  contentUuid,
  multipart,
  parseMultipart,
  rollbackResponse,
  sha256Base64Url,
  signatureOf,
  updateResponse,
  verify,
} from './lib';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const bytes = (s: string) => new TextEncoder().encode(s);
const built = buildManifest({
  platform: 'android',
  runtimeVersion: 'abc123',
  baseUrl: 'https://example.com/updates/',
  createdAt: '2026-10-23T00:00:00.000Z',
  bundle: { path: '_expo/static/js/android/entry.hbc', ext: 'hbc', bytes: bytes('bundle') },
  assets: [{ path: 'assets/0f1e', ext: 'png', bytes: bytes('png') }],
  metadata: { channel: 'production' },
});

describe('manifest', () => {
  test('content-addressed assets with Base64URL SHA-256 hashes', () => {
    const m = built.manifest;
    expect(m.launchAsset.hash).toBe(sha256Base64Url(bytes('bundle')));
    expect(m.launchAsset.hash).not.toMatch(/[+/=]/);
    expect(m.launchAsset.contentType).toBe('application/javascript');
    expect(m.launchAsset.fileExtension).toBeUndefined();
    expect(m.launchAsset.url).toBe(`https://example.com/updates/assets/${m.launchAsset.hash}.bundle`);
    expect(m.assets[0]).toMatchObject({ contentType: 'image/png', fileExtension: '.png' });
    expect(m.assets[0].key).toMatch(/^[0-9a-f]{32}$/);
    expect(built.files.map((f) => f.from)).toEqual(['_expo/static/js/android/entry.hbc', 'assets/0f1e']);
  });

  test('id is a UUID derived from content', () => {
    expect(built.manifest.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(contentUuid(['a'])).toBe(contentUuid(['a']));
    expect(contentUuid(['a'])).not.toBe(contentUuid(['b']));
  });

  test('rejects runtime versions the server would not route', () => {
    expect(() =>
      buildManifest({ ...{ platform: 'android', baseUrl: 'x', createdAt: 'x', assets: [] }, runtimeVersion: '../x', bundle: { path: 'b', ext: 'hbc', bytes: bytes('') } }),
    ).toThrow();
  });
});

describe('signed multipart', () => {
  test('manifest part is signed over its exact body', () => {
    const parts = parseMultipart(updateResponse(built.manifest, privateKey));
    expect(parts.map((p) => p.name)).toEqual(['manifest', 'extensions']);
    const sig = signatureOf(parts[0].headers['expo-signature']);
    expect(parts[0].headers['expo-signature']).toContain('keyid="main"');
    expect(sig).toBeTruthy();
    expect(verify(parts[0].body, sig ?? '', publicKey)).toBe(true);
    expect(verify(`${parts[0].body} `, sig ?? '', publicKey)).toBe(false);
    expect(JSON.parse(parts[0].body)).toEqual(built.manifest);
  });

  test('rollback directive', () => {
    const [part] = parseMultipart(rollbackResponse('2026-10-23T00:00:00.000Z', privateKey));
    expect(part.name).toBe('directive');
    expect(JSON.parse(part.body)).toEqual({
      type: 'rollBackToEmbedded',
      parameters: { commitTime: '2026-10-23T00:00:00.000Z' },
    });
    expect(verify(part.body, signatureOf(part.headers['expo-signature']) ?? '', publicKey)).toBe(true);
  });

  test('CRLF framing and closing boundary', () => {
    const body = multipart([{ name: 'extensions', body: '{}' }]);
    expect(body.startsWith(`--${BOUNDARY}\r\n`)).toBe(true);
    expect(body.endsWith(`\r\n--${BOUNDARY}--\r\n`)).toBe(true);
    expect(() => multipart([{ name: 'manifest', body: `--${BOUNDARY}` }])).toThrow();
  });
});

test('pruning keeps the newest N updates per target', () => {
  const kept = assetsToKeep(
    [
      { target: 'production/android/1', createdAt: '2026-01-01', assets: ['old'] },
      { target: 'production/android/1', createdAt: '2026-01-02', assets: ['mid', 'shared'] },
      { target: 'production/android/1', createdAt: '2026-01-03', assets: ['new', 'shared'] },
      { target: 'preview/android/1', createdAt: '2026-01-01', assets: ['preview'] },
    ],
    2,
  );
  expect([...kept].sort()).toEqual(['mid', 'new', 'preview', 'shared']);
});
