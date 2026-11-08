import { describe, expect, test } from 'bun:test';

import { bundledUpgrade, compareVersions } from './bundled-upgrade';

const LINK = 'https://github.com/pkuinfo/pku-harness-plugins/tree/main/plugins/wallet';

describe('compareVersions', () => {
  test('numeric, not lexical', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
  });

  test('a pre-release sorts before its release', () => {
    expect(compareVersions('1.2.0-beta', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.0', '1.2.0-beta')).toBe(1);
    expect(compareVersions('1.2.0-alpha', '1.2.0-beta')).toBe(-1);
  });
});

describe('bundledUpgrade', () => {
  test('a newer bundled copy replaces the stored bundled one', () => {
    expect(bundledUpgrade({ link: LINK, source: 'bundled', version: '1.1.0' }, { link: LINK, version: '1.2.0' })).toBe('apply');
  });

  test('also when the stored copy came from a link update of the same document', () => {
    expect(bundledUpgrade({ link: LINK, source: 'link', version: '1.1.0' }, { link: LINK, version: '1.2.0' })).toBe('apply');
  });

  test('same or older bundled version: keep (a link update may already be newer)', () => {
    expect(bundledUpgrade({ link: LINK, source: 'bundled', version: '1.2.0' }, { link: LINK, version: '1.2.0' })).toBe('keep');
    expect(bundledUpgrade({ link: LINK, source: 'link', version: '1.3.0' }, { link: LINK, version: '1.2.0' })).toBe('keep');
  });

  test('a pinned rollback, a local draft or another link with the same id: keep', () => {
    expect(bundledUpgrade({ link: LINK, source: 'link', version: '1.1.0', pinned: true }, { link: LINK, version: '1.2.0' })).toBe('keep');
    expect(bundledUpgrade({ link: null, source: 'local', version: '0.1.0' }, { link: LINK, version: '1.2.0' })).toBe('keep');
    expect(bundledUpgrade({ link: 'https://example.org/wallet', source: 'link', version: '1.0.0' }, { link: LINK, version: '1.2.0' })).toBe('keep');
  });
});
