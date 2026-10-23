/**
 * Provider configuration rules for PKU Harness Cloud (docs/CLOUD.md §2.4). Pure: no native
 * modules, so the rules are unit-tested and shared by the settings screen and the runtime.
 */

/** Which provider the user picked. 'off' = no cloud at all (the default until they opt in). */
export type ProviderMode = 'off' | 'official' | 'custom';

export type ProviderConfig = { mode: ProviderMode; customURL?: string };

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = { mode: 'off' };

/**
 * Our hosted instance. TODO(cloud stage 5): replace with the real domain once it is bought and
 * tested inside WeChat (docs/CLOUD.md §5 decisions 1–2); until then 官方 cannot connect.
 */
export const OFFICIAL_URL = 'https://cloud.pkuinfo.org';

export type URLCheck = { ok: true; url: string } | { ok: false; reason: 'empty' | 'invalid' | 'insecure' | 'credentials' | 'query' };

/**
 * Validate and normalise a provider base URL: https only. In development builds
 * `http://10.0.2.2:<port>` (the Android emulator's host loopback) and `http://localhost:<port>`
 * / `127.0.0.1` are allowed too; the debug network config already permits cleartext there
 * (config-plugins/with-debug-user-ca.js). A path prefix is kept (reverse proxies), a trailing
 * slash dropped. User info, query strings and fragments are refused.
 */
export function checkBaseURL(input: string, opts: { dev: boolean }): URLCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'empty' };
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#\s]*)(\/[^?#\s]*)?([?#].*)?$/i.exec(raw);
  if (!m) return { ok: false, reason: 'invalid' };
  const scheme = m[1]!.toLowerCase();
  const authority = m[2]!;
  if (m[4]) return { ok: false, reason: 'query' };
  if (authority.includes('@')) return { ok: false, reason: 'credentials' };
  const host = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(authority);
  if (!host || !host[1] || host[1].startsWith('.') || host[1].endsWith('.') || host[1].includes('..')) return { ok: false, reason: 'invalid' };
  if (host[2] !== undefined && (Number(host[2]) < 1 || Number(host[2]) > 65535)) return { ok: false, reason: 'invalid' };
  const hostname = host[1].toLowerCase();
  if (scheme === 'http') {
    const local = hostname === '10.0.2.2' || hostname === 'localhost' || hostname === '127.0.0.1';
    if (!opts.dev || !local) return { ok: false, reason: 'insecure' };
  } else if (scheme !== 'https') return { ok: false, reason: 'invalid' };
  const path = (m[3] ?? '').replace(/\/+$/, '');
  return { ok: true, url: `${scheme}://${hostname}${host[2] ? `:${host[2]}` : ''}${path}` };
}

/** The base URL in effect for a config, or undefined when off / invalid. */
export function resolveBaseURL(config: ProviderConfig, opts: { dev: boolean }): string | undefined {
  if (config.mode === 'off') return undefined;
  if (config.mode === 'official') return OFFICIAL_URL;
  const r = checkBaseURL(config.customURL ?? '', opts);
  return r.ok ? r.url : undefined;
}

/** `https://cloud.example.org/x` → `cloud.example.org` (for compact display). */
export function displayHost(baseURL: string | undefined): string {
  if (!baseURL) return '';
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(baseURL);
  return m ? m[1]! : baseURL;
}

/** WebSocket origin for a provider base URL (`https:` → `wss:`). */
export function toWebSocketURL(baseURL: string, path: string): string {
  return baseURL.replace(/^http(s?):\/\//i, (_, s: string) => `ws${s}://`) + path;
}
