/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { createCipheriv } from 'node:crypto';

import { decodeCwpayBody, envelopeState, hashQuery, parseDealcasLocation, parseEnvelope } from './cwpay-crypto';

/** Real public response of GET https://cwpay.pku.edu.cn/api/pay/iaaa/getIAAALoginParam (2026-10-21). */
const LIVE_IAAA_PARAM =
  'ETXc3OJCPJL749YfAlJkMYY0r3C646jaxVw39Ve1DTlN9cLfnYjGfSz/8zGTqKdNWfvNhAM7dW8bPUEpFPwLvRFbKb1bJouFeF0aCkPUdN6moUDnD3cxt6n8o28BP7Lo1FO7qTY/ezoHNUe0PLDzmqWkui1M0J51ONTPdkKaOfjAOev1kyDNyHYV6fvPVSccVcn8B7npg6d4gLBR+0nxk4Et9IhsbIamXMytcOAETXvu74joONQcBwB7ftPAyR+ptEJdn3HvIAuiISBqbD6eq6mpIrcx/FGyQJm7QVg9gdtpKHbfgSSV78dzdAMqgkiHli9+vUkhTMFLdWKKQHtE+8o/xMgu3GE=z4eYCa5Eem';

/** Build a body the way the server does (rand10 + reversed key + rand10 + AES + rand10). */
function encode(json: string, key = 'abcdefghijklmnopqrstuvwxyz012345') {
  const c = createCipheriv('aes-256-ecb', Buffer.from(key, 'utf8'), null);
  const ct = Buffer.concat([c.update(json, 'utf8'), c.final()]).toString('base64');
  return `0123456789${key.split('').reverse().join('')}9876543210${ct}ZZZZZZZZZZ`;
}

describe('decodeCwpayBody', () => {
  test('decrypts a live response', () => {
    const env = parseEnvelope(decodeCwpayBody(LIVE_IAAA_PARAM));
    expect(env?.messageCode).toBe('0');
    expect(env?.data).toEqual({
      redirectUrl: 'http://cwpay.pku.edu.cn/dealcas',
      appName: '北京大学收费平台',
      appId: 'CWSF',
      iaaaTokenUrl: 'https://iaaa.pku.edu.cn/iaaa/svc/token/validate.do',
    });
  });

  test('round-trips chinese JSON', () => {
    const json = JSON.stringify({ messageCode: '0', data: [{ feeTypeName: '学费', shouldpay: 500000 }] });
    expect(decodeCwpayBody(encode(json))).toBe(json);
  });

  test('plain JSON errors pass through (live HTTP 500 shape)', () => {
    const err = '{"data":"","messageCode":"8100","message":"服务异常，请稍后再试"}';
    expect(decodeCwpayBody(err)).toBe(err);
    expect(envelopeState(parseEnvelope(err))).toBe('error');
  });

  test('garbage passes through unchanged', () => {
    const junk = 'x'.repeat(80);
    expect(decodeCwpayBody(junk)).toBe(junk);
  });
});

describe('envelopeState (axios interceptor)', () => {
  test.each([
    ['0', 'ok'],
    ['6003', 'ok'],
    ['-3', 'renew'],
    ['-1', 'signedOut'],
    ['-2', 'signedOut'],
  ] as const)('%s → %s', (code, state) => expect(envelopeState({ messageCode: code })).toBe(state));
  test('50014 / not an envelope', () => {
    expect(envelopeState({ messageCode: '9', code: 50014 })).toBe('signedOut');
    expect(envelopeState(null)).toBe('unknown');
  });
});

describe('dealcas redirect', () => {
  test('live failure redirect (bad token)', () => {
    const loc =
      'https://cwpay.pku.edu.cn/#/middle_page_error?errorMsg=%E7%B3%BB%E7%BB%9F%E9%94%99%E8%AF%AF%EF%BC%8C%E7%BB%9F%E4%B8%80%E7%99%BB%E5%BD%95%E7%B3%BB%E7%BB%9Ftoken%E9%AA%8C%E8%AF%81%E5%A4%B1%E8%B4%A5';
    expect(parseDealcasLocation(loc)).toEqual({ ok: false, error: '系统错误，统一登录系统token验证失败' });
  });

  test('success: token + jsonData from the hash query', () => {
    const json = encodeURIComponent(JSON.stringify({ idserial: '2000000000' }));
    const loc = `https://cwpay.pku.edu.cn/#/middle_page?token=tok-123&jsonData=${json}&domain_url_wap=https%3A%2F%2Fcwpay.pku.edu.cn%2Fmobile`;
    expect(parseDealcasLocation(loc)).toEqual({ ok: true, token: 'tok-123', jsonData: '{"idserial":"2000000000"}' });
  });

  test('intermediate hops are not final', () => {
    expect(parseDealcasLocation('https://cwpay.pku.edu.cn/dealcas/?token=abc')).toBeNull();
  });

  test('hashQuery ignores the real query string', () => {
    expect(hashQuery('https://x/?a=1#/p?b=2&c=%E4%B8%AD')).toEqual({ b: '2', c: '中' });
  });
});
