import { describe, expect, test } from 'bun:test';

import { extractCode } from './sms-code';

describe('extractCode', () => {
  test('digits after a code keyword', () => {
    expect(extractCode('【北京大学】您的验证码为：382910，5分钟内有效，请勿泄露。')).toBe('382910');
    expect(extractCode('【北大树洞】验证码 4417，用于登录。')).toBe('4417');
    expect(extractCode('Your PKU verification code is 905512. It expires in 5 minutes.')).toBe('905512');
  });
  test('the only standalone group, ignoring phones, dates, times and amounts', () => {
    expect(extractCode('【北京大学】13812345678 于 2026-10-23 14:05 申请登录，请输入 778812')).toBe('778812');
    expect(extractCode('充值 ¥100.00 成功')).toBeNull();
  });
  test('ambiguous messages give null rather than a guess', () => {
    expect(extractCode('订单 123456 和 654321')).toBeNull();
    expect(extractCode('没有数字')).toBeNull();
  });
});
