import type { MessageKey, Params } from '@/i18n';

import type { Capability } from './types';

/**
 * Why a plugin can't run, from the capabilities this host lacks (pure: no runtime imports, so it
 * is unit-tested). A capability the user can add later (today: a cloud provider) gets a hint to
 * set it up; anything else is a device limit.
 */
export const CAPABILITY_LABEL: Record<Capability, MessageKey> = {
  network: 'app.plugins.capability.network',
  'campus-network': 'app.plugins.capability.campusNetwork',
  'campus-session': 'app.plugins.capability.campusSession',
  notifications: 'app.plugins.capability.notifications',
  background: 'app.plugins.capability.background',
  shell: 'app.plugins.capability.shell',
  filesystem: 'app.plugins.capability.filesystem',
  cloud: 'app.plugins.capability.cloud',
  ongoing: 'app.plugins.capability.ongoing',
};

/** Capabilities the user can turn on in Settings, with the hint shown while one is missing. */
export const SETUP_HINT: Partial<Record<Capability, MessageKey>> = {
  cloud: 'app.plugins.setup.cloud',
};

type Translate = (key: MessageKey, params?: Params) => string;

/** The reason in the app language, or null when nothing is missing. */
export function unavailableReason(missing: readonly Capability[], tr: Translate): string | null {
  if (!missing.length) return null;
  // A real device limit wins: setting up a cloud wouldn't make it run.
  const fixed = missing.filter((c) => !SETUP_HINT[c]);
  if (fixed.length) return tr('app.plugins.unsupported', { list: fixed.map((c) => tr(CAPABILITY_LABEL[c])).join(tr('app.ui.listSep')) });
  return missing.map((c) => tr(SETUP_HINT[c]!)).join(tr('app.ui.listSep'));
}
