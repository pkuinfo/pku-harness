import { describe, expect, mock, test } from 'bun:test';

mock.module('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
mock.module('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));

const { translate } = await import('./index');

describe('translate', () => {
  test('looks up per locale', () => {
    expect(translate('zh-Hans', 'core.common.cancel')).toBe('取消');
    expect(translate('en', 'core.common.cancel')).toBe('Cancel');
  });
  test('unknown keys fall back to the key itself', () => {
    expect(translate('en', 'core.nope.missing' as never)).toBe('core.nope.missing');
  });
  test('fills {placeholders} and keeps unknown ones', () => {
    expect(translate('en', 'core.common.cancel', { x: 1 })).toBe('Cancel');
  });
});
