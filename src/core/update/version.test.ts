import { describe, expect, test } from 'bun:test';

import { isNewer, parseVersion, pickApk } from './version';

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
