import { kv } from '@/core/store/kv';

import { widgetStore } from './store';
import type { Widget } from './types';

const n = null;

/** First-run widgets that work without a campus login; the agent replaces them freely. */
const STARTERS: Omit<Widget, 'position' | 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'today',
    title: '今天',
    size: 'lg',
    spec: {
      root: 'col',
      elements: {
        col: { type: 'Column', props: { gap: 'sm' }, children: ['date', 'week', 'hint'] },
        date: { type: 'Heading', props: { text: { $template: '${/today/month}月${/today/day}日 · ${/today/weekday}' }, size: 'lg' } },
        week: {
          type: 'Text',
          props: { text: { $template: '第 ${/today/semester/week} 周 · 距学期结束 ${/today/semester/daysLeft} 天' }, tone: 'muted', size: n },
          visible: { $state: '/today/semester' },
        },
        hint: {
          type: 'Text',
          props: { text: '告诉 AI 开学日期，这里会显示教学周', tone: 'faint', size: 'small' },
          visible: { $state: '/today/semester', not: true },
        },
      },
    },
    bindings: { '/today': { tool: 'calendar.today', ttlMinutes: 30 } },
  },
  {
    id: 'reminders',
    title: '提醒',
    size: 'sm',
    spec: {
      root: 'stat',
      elements: {
        stat: {
          type: 'Stat',
          props: { label: '待触发提醒', value: { $state: '/jobs' }, prefix: n, suffix: ' 个', decimals: 0, delta: n, deltaTone: n, caption: n, icon: 'bell', size: 'lg' },
        },
      },
    },
    bindings: { '/jobs': { tool: 'scheduler.list', path: 'length', ttlMinutes: 0 } },
  },
  {
    id: 'week',
    title: '教学周',
    size: 'sm',
    spec: {
      root: 'stat',
      elements: {
        stat: {
          type: 'Stat',
          props: { label: '教学周', value: { $state: '/week' }, prefix: '第 ', suffix: ' 周', decimals: 0, delta: n, deltaTone: n, caption: n, icon: 'schedule', size: 'lg' },
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
  for (const [i, w] of STARTERS.entries()) {
    await widgetStore.put({ ...w, position: i, createdAt: now, updatedAt: now });
  }
  await prefs.set('dashboard.seeded', true);
}
