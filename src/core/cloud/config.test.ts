/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { OFFICIAL_URL, checkBaseURL, displayHost, resolveBaseURL, toWebSocketURL } from './config';

describe('checkBaseURL', () => {
  const prod = { dev: false };
  const dev = { dev: true };

  test('accepts https and normalises', () => {
    expect(checkBaseURL('  https://Cloud.Example.org/ ', prod)).toEqual({ ok: true, url: 'https://cloud.example.org' });
    expect(checkBaseURL('https://example.org:8443/relay/', prod)).toEqual({ ok: true, url: 'https://example.org:8443/relay' });
    expect(checkBaseURL('https://[::1]:8443', prod)).toEqual({ ok: true, url: 'https://[::1]:8443' });
  });

  test('refuses http outside development', () => {
    expect(checkBaseURL('http://example.org', prod)).toEqual({ ok: false, reason: 'insecure' });
    expect(checkBaseURL('http://10.0.2.2:8787', prod)).toEqual({ ok: false, reason: 'insecure' });
  });

  test('allows emulator/localhost http in development only', () => {
    expect(checkBaseURL('http://10.0.2.2:8787', dev)).toEqual({ ok: true, url: 'http://10.0.2.2:8787' });
    expect(checkBaseURL('http://localhost:8787/', dev)).toEqual({ ok: true, url: 'http://localhost:8787' });
    expect(checkBaseURL('http://127.0.0.1:8787', dev)).toEqual({ ok: true, url: 'http://127.0.0.1:8787' });
    expect(checkBaseURL('http://192.168.1.2:8787', dev)).toEqual({ ok: false, reason: 'insecure' });
    expect(checkBaseURL('http://10.0.2.2.evil.com', dev)).toEqual({ ok: false, reason: 'insecure' });
  });

  test('rejects malformed, credentials, queries and other schemes', () => {
    expect(checkBaseURL('', prod)).toEqual({ ok: false, reason: 'empty' });
    expect(checkBaseURL('cloud.example.org', prod)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBaseURL('ftp://example.org', prod)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBaseURL('https://user:pw@example.org', prod)).toEqual({ ok: false, reason: 'credentials' });
    expect(checkBaseURL('https://example.org/?x=1', prod)).toEqual({ ok: false, reason: 'query' });
    expect(checkBaseURL('https://example.org/#k=abc', prod)).toEqual({ ok: false, reason: 'query' });
    expect(checkBaseURL('https://exa mple.org', prod)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBaseURL('https://example..org', prod)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBaseURL('https://example.org:99999', prod)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('resolveBaseURL / helpers', () => {
  test('per mode', () => {
    expect(resolveBaseURL({ mode: 'off', customURL: 'https://x.org' }, { dev: false })).toBeUndefined();
    expect(resolveBaseURL({ mode: 'official' }, { dev: false })).toBe(OFFICIAL_URL);
    expect(resolveBaseURL({ mode: 'custom', customURL: 'https://x.org/' }, { dev: false })).toBe('https://x.org');
    expect(resolveBaseURL({ mode: 'custom', customURL: 'http://x.org' }, { dev: false })).toBeUndefined();
  });

  test('display host and websocket url', () => {
    expect(displayHost('https://cloud.example.org/relay')).toBe('cloud.example.org');
    expect(displayHost(undefined)).toBe('');
    expect(toWebSocketURL('https://a.org/p', '/v1/x')).toBe('wss://a.org/p/v1/x');
    expect(toWebSocketURL('http://10.0.2.2:8787', '/v1/x')).toBe('ws://10.0.2.2:8787/v1/x');
  });
});
