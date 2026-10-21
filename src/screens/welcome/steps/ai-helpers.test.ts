/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { describeVerifyError, hintLink, mergeModels } from './ai-helpers';

describe('AI step helpers', () => {
  test('maps provider failures to actionable copy', () => {
    expect(describeVerifyError(new Error('模型列表请求失败：HTTP 401'))).toContain('API Key 无效');
    expect(describeVerifyError(new Error('模型列表请求失败：HTTP 402'))).toContain('余额不足');
    expect(describeVerifyError(new Error('timeout'))).toContain('超时');
    expect(describeVerifyError(new TypeError('Network request failed'))).toContain('连不上');
  });

  test('turns the hint domain into a link', () => {
    expect(hintLink('在 platform.deepseek.com 的 API Keys 页面创建')).toEqual({ before: '在 ', domain: 'platform.deepseek.com', after: ' 的 API Keys 页面创建' });
    expect(hintLink('服务商提供的 API Key；本地服务可留空')).toBeNull();
    expect(hintLink(undefined)).toBeNull();
  });

  test('merges catalog and listed models', () => {
    const cat = [{ id: 'a', name: 'A' }];
    expect(mergeModels(cat, null)).toEqual(cat);
    expect(mergeModels(cat, [{ id: 'a' }, { id: 'b' }]).map((m) => m.id)).toEqual(['a', 'b']);
  });
});
