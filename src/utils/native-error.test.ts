import { expect, test } from 'bun:test';

import { nativeReason } from './native-error';

test('nativeReason keeps only the cause of an Expo native rejection', () => {
  expect(nativeReason("Call to function 'PhoneControl.handoff' has been rejected.\n→ Caused by: No app is open")).toBe('No app is open');
  expect(nativeReason("Call to function 'PhoneControl.handoff' has been rejected.")).toBe("Call to function 'PhoneControl.handoff' has been rejected.");
  expect(nativeReason('STALE: The screen changed; observe again')).toBe('STALE: The screen changed; observe again');
});
