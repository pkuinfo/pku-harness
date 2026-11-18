/** Pure parsing for the mail login (adapters/mail.ts), kept apart so tests need no native modules. */

const ENTRY = 'https://mailh.qiye.163.com';

const query = (url: string, name: string) => {
  const m = new RegExp(`[?&]${name}=([^&#]*)`).exec(url);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
};

const absolute = (location: string, base: string) => (/^https?:\/\//i.test(location) ? location : `${/^https?:\/\/[^/]+/i.exec(base)?.[0] ?? ''}${location}`);

/** What a login step's redirect means: the SMS page, signed in (sid + mail host), or a failure. */
export function loginStep(location: string | null | undefined): { kind: 'sms'; url: string; account: string; mobile: string } | { kind: 'done'; sid: string; host: string } | { kind: 'failed' } {
  if (!location) return { kind: 'failed' };
  const url = absolute(location, ENTRY);
  if (url.includes('/static/login/sms/')) return { kind: 'sms', url, account: query(url, 'account_name') ?? '', mobile: query(url, 'mobile') ?? '' };
  const sid = query(url, 'sid');
  const host = /^https:\/\/([a-z0-9.-]+\.qiye\.163\.com)\//i.exec(url)?.[1];
  if (sid && host) return { kind: 'done', sid, host };
  return { kind: 'failed' };
}

