import { describe, expect, test } from 'bun:test';

import type { MessageKey, Params } from '@/i18n';

import { unavailableReason } from './availability';

/** Echo translator: shows which message was picked and with what. */
const tr = (key: MessageKey, params?: Params) => (key === 'app.ui.listSep' ? ', ' : params ? `${key}(${params.list})` : key);

describe('unavailableReason', () => {
  test('nothing missing: available', () => {
    expect(unavailableReason([], tr)).toBeNull();
  });

  test('a missing cloud is something to set up, not a device limit', () => {
    expect(unavailableReason(['cloud'], tr)).toBe('app.plugins.setup.cloud');
  });

  test('a real device limit is unsupported, listing only the limits', () => {
    expect(unavailableReason(['shell'], tr)).toBe('app.plugins.unsupported(app.plugins.capability.shell)');
    // Setting up a cloud would not help here, so it is not offered.
    expect(unavailableReason(['cloud', 'filesystem'], tr)).toBe('app.plugins.unsupported(app.plugins.capability.filesystem)');
  });
});
