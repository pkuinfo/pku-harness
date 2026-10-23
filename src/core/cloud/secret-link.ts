import { buildShareLink, scrubShareLinks } from '@pku-harness/cloud-protocol';
import type { SecretLink } from '@pku-harness/sdk';

/**
 * Share links as opaque values (docs/CLOUD.md §2.8). A plugin holds a `SecretLink` and can only
 * show it through the host (`host.shareLink`, `<QRCode link>`); the URL itself lives in a
 * module-private WeakMap, so it isn't a property a plugin, `JSON.stringify` or a log line can
 * reach. Only the host (this folder, host-ui) calls `revealLink`.
 */

const urls = new WeakMap<object, string>();
const REDACTED = '[secret link]';

class HostSecretLink implements SecretLink {
  readonly kind = 'secret-link' as const;
  constructor(readonly channelId: string) {
    Object.freeze(this);
  }
  toJSON(): string {
    return REDACTED;
  }
  toString(): string {
    return REDACTED;
  }
}

/** Wrap a share URL (built by the host) as a SecretLink. */
export function createSecretLink(url: string, channelId: string): SecretLink {
  const link = new HostSecretLink(channelId);
  urls.set(link, url);
  return link;
}

/** Share link for a channel on a provider (`<base>/s/<id>#k=…`). */
export function channelLink(baseURL: string, channelId: string, k: Uint8Array): SecretLink {
  return createSecretLink(buildShareLink(baseURL, channelId, k), channelId);
}

/** True for links minted by this host (a plugin can't forge one). */
export function isSecretLink(v: unknown): v is SecretLink {
  return typeof v === 'object' && v !== null && urls.has(v);
}

/** Host only: the URL behind a link. Throws for anything the host didn't mint. */
export function revealLink(link: SecretLink): string {
  const url = typeof link === 'object' && link !== null ? urls.get(link) : undefined;
  if (!url) throw new Error('not a share link from this app');
  return url;
}

export { scrubShareLinks };

function isPlain(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Remove share links from a value bound for the model, logs or a scheduled job (the second guard
 * after `toJSON`): strings lose link fragments (`scrubShareLinks`) and, unless `keepLinks`,
 * SecretLink objects become "[secret link]". Walks plain objects and arrays, copying only what
 * changes; other objects (Dates, class instances) pass through untouched.
 */
export function scrubOutput<T>(value: T, opts?: { keepLinks?: boolean }): T {
  const seen = new WeakMap<object, unknown>();
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.includes('#') ? scrubShareLinks(v) : v;
    if (typeof v !== 'object' || v === null) return v;
    if (isSecretLink(v)) return opts?.keepLinks ? v : REDACTED;
    if (seen.has(v)) return seen.get(v);
    if (Array.isArray(v)) {
      seen.set(v, v);
      let out: unknown[] | null = null;
      v.forEach((item, i) => {
        const next = walk(item);
        if (next !== item) {
          out ??= v.slice();
          out[i] = next;
        }
      });
      if (out) seen.set(v, out);
      return out ?? v;
    }
    if (!isPlain(v)) return v;
    seen.set(v, v);
    let out: Record<string, unknown> | null = null;
    for (const [k, item] of Object.entries(v)) {
      const next = walk(item);
      if (next !== item) {
        out ??= { ...(v as Record<string, unknown>) };
        out[k] = next;
      }
    }
    if (out) seen.set(v, out);
    return out ?? v;
  };
  return walk(value) as T;
}

let logsScrubbed = false;

/** Scrub share links from console output (dev logs, logcat). Idempotent. */
export function installLogScrubber() {
  if (logsScrubbed) return;
  logsScrubbed = true;
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level];
    if (typeof original !== 'function') continue;
    console[level] = (...args: unknown[]) => original.apply(console, args.map((a) => (a instanceof Error ? a : scrubOutput(a))));
  }
}
