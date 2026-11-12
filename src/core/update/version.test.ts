import { describe, expect, test } from 'bun:test';

import { isNewer, parseVersion, pickApk, releaseNotes } from './version';

describe('versions', () => {
  test('parses tags and plain versions', () => {
    expect(parseVersion('v1.0.6')).toEqual([1, 0, 6]);
    expect(parseVersion('1.10.0')).toEqual([1, 10, 0]);
    expect(parseVersion('1.0')).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });

  test('compares numerically, never newer when unparseable', () => {
    expect(isNewer('v1.0.7', '1.0.6')).toBe(true);
    expect(isNewer('v1.10.0', '1.9.9')).toBe(true);
    expect(isNewer('v1.0.6', '1.0.6')).toBe(false);
    expect(isNewer('v1.0.5', '1.0.6')).toBe(false);
    expect(isNewer('nightly', '1.0.6')).toBe(false);
  });
});

describe('pickApk', () => {
  const asset = (abi: string) => ({ name: `pku-harness-1.0.7-${abi}.apk`, url: `u/${abi}`, size: 1 });
  const assets = [asset('arm64-v8a'), asset('armeabi-v7a'), asset('x86_64'), { name: 'notes.txt', url: 'n', size: 1 }];

  test('takes the first ABI the phone supports', () => {
    expect(pickApk(assets, ['x86_64', 'arm64-v8a'])?.url).toBe('u/x86_64');
    expect(pickApk(assets, ['armeabi-v7a', 'armeabi'])?.url).toBe('u/armeabi-v7a');
  });

  test('falls back to arm64, then any APK', () => {
    expect(pickApk(assets, null)?.url).toBe('u/arm64-v8a');
    expect(pickApk([asset('x86_64')], ['mips'])?.url).toBe('u/x86_64');
    expect(pickApk([], ['arm64-v8a'])).toBeNull();
  });
});

describe('releaseNotes', () => {
  const body = [
    '## 更新内容',
    '',
    '- 更新提示改为底部面板',
    '- **Copilot** 权限引导',
    '',
    "## What's new",
    '- The update prompt is a bottom sheet',
    '* `Copilot` setup guide',
    '',
    '## Checksums',
    '- not a note',
  ].join('\n');

  test('reads both languages and stops at the next heading', () => {
    expect(releaseNotes(body)).toEqual({
      'zh-Hans': ['更新提示改为底部面板', 'Copilot 权限引导'],
      en: ['The update prompt is a bottom sheet', 'Copilot setup guide'],
    });
  });

  test('is empty without a section', () => {
    expect(releaseNotes('PKU harness v1.0.7 for Android 7.0+.')).toEqual({ en: [], 'zh-Hans': [] });
    expect(releaseNotes(undefined)).toEqual({ en: [], 'zh-Hans': [] });
  });

  test('keeps at most six', () => {
    const many = ["## What's new", ...Array.from({ length: 9 }, (_, i) => `- n${i}`)].join('\n');
    expect(releaseNotes(many).en).toHaveLength(6);
  });
});
