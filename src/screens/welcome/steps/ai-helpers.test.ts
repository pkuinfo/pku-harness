/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { describeVerifyError, hintLink, mergeModels } from './ai-helpers';

describe('AI step helpers', () => {
  test('maps provider failures to actionable copy', () => {
    const tr = (k: string) => k;
    expect(describeVerifyError(new Error('模型列表请求失败：HTTP 401'), tr)).toBe('welcome.ai.errors.badKey');
    expect(describeVerifyError(new Error('Model list failed: HTTP 402'), tr)).toBe('welcome.ai.errors.balance');
    expect(describeVerifyError(new Error('HTTP 503'), tr)).toBe('welcome.ai.errors.server');
    expect(describeVerifyError(new Error('timeout'), tr)).toBe('welcome.ai.errors.timeout');
    expect(describeVerifyError(new TypeError('Network request failed'), tr)).toBe('welcome.ai.errors.network');
    expect(describeVerifyError(new Error('something odd'), tr)).toBe('something odd');
  });

  test('turns the hint domain into a link', () => {
    expect(hintLink('在 platform.deepseek.com 的 API Keys 页面创建')).toEqual({ before: '在 ', domain: 'platform.deepseek.com', after: ' 的 API Keys 页面创建' });
    expect(hintLink('服务商提供的 API Key；本地服务可留空')).toBeNull();
    expect(hintLink('Create one under API Keys at platform.deepseek.com.')).toEqual({ before: 'Create one under API Keys at ', domain: 'platform.deepseek.com', after: '.' });
    expect(hintLink(undefined)).toBeNull();
  });

  test('merges catalog and listed models', () => {
    const cat = [{ id: 'a', name: 'A' }];
    expect(mergeModels(cat, null)).toEqual(cat);
    expect(mergeModels(cat, [{ id: 'a' }, { id: 'b' }]).map((m) => m.id)).toEqual(['a', 'b']);
  });
});
