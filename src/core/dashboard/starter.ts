import { kv } from '@/core/store/kv';
import { getLocale, LOCALES, subscribeLocale, translate, type Locale } from '@/i18n';

import { widgetStore } from './store';
import type { Widget } from '@pku-harness/sdk';

const n = null;

/**
 * First-run widgets that work without a campus login; the agent replaces them freely. Written
 * once, in the app language at first launch (the agent rewrites them in whatever language later).
 */
const starters = (locale: Locale = getLocale()): Omit<Widget, 'position' | 'createdAt' | 'updatedAt'>[] => {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return [
  {
    id: 'today',
    title: t('app.starter.today'),
    size: 'md',
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
};

type Starter = ReturnType<typeof starters>[number];
const fingerprint = (w: Pick<Widget, 'title' | 'size' | 'spec' | 'bindings'>) => JSON.stringify([w.title, w.size, w.spec, w.bindings]);

/**
 * Every form a starter card had when nobody edited it: each language, and the first "Today"
 * card (a tall card that showed the raw ISO date in English).
 */
function pristineForms(): Map<string, Set<string>> {
  const forms = new Map<string, Set<string>>();
  for (const locale of LOCALES) {
    for (const w of starters(locale)) {
      const set = forms.get(w.id) ?? new Set<string>();
      set.add(fingerprint(w));
      if (w.id === 'today') {
        const spec = structuredClone(w.spec) as { elements: { date: { props: { text: { $template: string } } } } };
        if (locale === 'en') spec.elements.date.props.text.$template = '${/today/date}';
        set.add(fingerprint({ ...w, size: 'lg', spec: spec as Starter['spec'] }));
      }
      forms.set(w.id, set);
    }
  }
  return forms;
}

/**
 * Starter cards nobody edited follow the app: the current language and the current design.
 * A card the user or the agent changed is left exactly as it is.
 */
async function refreshStarters() {
  const forms = pristineForms();
  for (const fresh of starters()) {
    const w = widgetStore.get(fresh.id);
    if (!w || !forms.get(fresh.id)?.has(fingerprint(w)) || fingerprint(w) === fingerprint(fresh)) continue;
    await widgetStore.put({ ...w, title: fresh.title, size: fresh.size, spec: fresh.spec, bindings: fresh.bindings });
  }
}

let following = false;

/** Seed starter widgets once per install. */
export async function seedStarterWidgets() {
  const prefs = kv('prefs');
  if (!following) {
    following = true;
    subscribeLocale(() => void refreshStarters());
  }
  if (await prefs.get<boolean>('dashboard.seeded')) return refreshStarters();
  const now = Date.now();
  for (const [i, w] of starters().entries()) {
    await widgetStore.put({ ...w, position: i, createdAt: now, updatedAt: now });
  }
  await prefs.set('dashboard.seeded', true);
}

/**
 * Put a plugin's widget at the top of the dashboard, once: nothing happens when that widget is
 * already there (the user or the agent may have placed it).
 */
export async function addPluginWidget(source: { plugin: string; widget: string }, title: string, size: Widget['size'] = 'md') {
  if (widgetStore.list().some((w) => w.source?.plugin === source.plugin && w.source.widget === source.widget)) return;
  const now = Date.now();
  await widgetStore.put({ id: widgetStore.newId(), title, size, spec: {}, bindings: {}, source, position: -1, createdAt: now, updatedAt: now });
  await widgetStore.reorder(widgetStore.list().map((w) => w.id));
}
