import { kv } from '@/core/store/kv';
import { t } from '@/i18n';

import { widgetStore } from './store';
import type { Widget } from './types';

const n = null;

/**
 * First-run widgets that work without a campus login; the agent replaces them freely. Written
 * once, in the app language at first launch (the agent rewrites them in whatever language later).
 */
const starters = (): Omit<Widget, 'position' | 'createdAt' | 'updatedAt'>[] => [
  {
    id: 'today',
    title: t('app.starter.today'),
    size: 'lg',
    spec: {
      root: 'col',
      elements: {
        col: { type: 'Column', props: { gap: 'sm' }, children: ['date', 'week', 'hint'] },
        date: { type: 'Heading', props: { text: { $template: t('app.starter.date') }, size: 'lg' } },
        week: {
          type: 'Text',
          props: { text: { $template: t('app.starter.weekLine') }, tone: 'muted', size: n },
          visible: { $state: '/today/semester' },
        },
        hint: {
          type: 'Text',
          props: { text: t('app.starter.hint'), tone: 'faint', size: 'small' },
          visible: { $state: '/today/semester', not: true },
        },
      },
    },
    bindings: { '/today': { tool: 'calendar.today', ttlMinutes: 30 } },
  },
  {
    id: 'reminders',
    title: t('app.starter.reminders'),
    size: 'sm',
    spec: {
      root: 'stat',
      elements: {
        stat: {
          type: 'Stat',
          props: { label: t('app.starter.pending'), value: { $state: '/jobs' }, prefix: n, suffix: t('app.starter.pendingSuffix') || n, decimals: 0, delta: n, deltaTone: n, caption: n, icon: 'bell', size: 'lg' },
        },
      },
    },
    bindings: { '/jobs': { tool: 'scheduler.list', path: 'length', ttlMinutes: 0 } },
  },
  {
    id: 'week',
    title: t('app.starter.week'),
    size: 'sm',
    spec: {
      root: 'stat',
      elements: {
        stat: {
          type: 'Stat',
          props: { label: t('app.starter.week'), value: { $state: '/week' }, prefix: t('app.starter.weekPrefix') || n, suffix: t('app.starter.weekSuffix') || n, decimals: 0, delta: n, deltaTone: n, caption: n, icon: 'schedule', size: 'lg' },
        },
      },
    },
    bindings: { '/week': { tool: 'calendar.today', path: 'semester.week', ttlMinutes: 30 } },
  },
];

/** Seed starter widgets once per install. */
export async function seedStarterWidgets() {
  const prefs = kv('prefs');
  if (await prefs.get<boolean>('dashboard.seeded')) return;
  const now = Date.now();
  for (const [i, w] of starters().entries()) {
    await widgetStore.put({ ...w, position: i, createdAt: now, updatedAt: now });
  }
  await prefs.set('dashboard.seeded', true);
}
