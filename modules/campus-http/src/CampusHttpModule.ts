import { NativeModule, requireNativeModule } from 'expo';

export type SessionOptions = {
  userAgent?: string;
  headers?: Record<string, string>;
  /** Default false: redirects are returned so the caller can read `location`. */
  followRedirects?: boolean;
};

export type RequestOptions = {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
  followRedirects?: boolean;
  timeoutMs?: number;
  responseType?: 'text' | 'base64';
};

export type CampusResponse = {
  status: number;
  /** Final URL (differs from the request when redirects were followed). */
  url: string;
  /** Lower-case names; Set-Cookie is kept in the session's jar, not returned. */
  headers: Record<string, string>;
  location: string | null;
  body: string;
};

export type StoredCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresAt: number;
  secure: boolean;
  httpOnly: boolean;
  hostOnly: boolean;
};

declare class CampusHttpModule extends NativeModule<{}> {
  createSession(id: string, options: SessionOptions): void;
  hasSession(id: string): boolean;
  closeSession(id: string): void;
  request(id: string, options: RequestOptions): Promise<CampusResponse>;
  exportCookies(id: string): StoredCookie[];
  importCookies(id: string, cookies: StoredCookie[]): void;
  cookieValue(id: string, url: string, name: string): string | null;
}

/** Android only for now (iOS later). See android/…/CampusHttpModule.kt. */
export default requireNativeModule<CampusHttpModule>('CampusHttp');
