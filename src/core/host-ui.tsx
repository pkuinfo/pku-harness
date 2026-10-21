import { requireOptionalNativeModule } from 'expo';
import { router } from 'expo-router';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { View } from 'react-native';

import type { Spec } from '@json-render/core';

import { Button, IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { DateTimeField } from '@/components/date-time-field';
import { ErrorBoundary } from '@/components/error-boundary';
import { Field } from '@/components/field';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/fade-in';
import { Glass, GlassEdges } from '@/components/glass';
import { Hourglass } from '@/components/hourglass';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-group';
import { NativeCheckbox } from '@/components/native-checkbox';
import { NativeSwitch } from '@/components/native-switch';
import { PressableScale } from '@/components/pressable-scale';
import { ProgressRing } from '@/components/progress-ring';
import { Screen } from '@/components/screen';
import { QRCode } from '@/components/qr-code';
import { Segmented } from '@/components/segmented';
import { dismiss, SheetScreen } from '@/components/sheet-screen';
import { Skeleton } from '@/components/skeleton';
import { SortableList } from '@/components/sortable-list';
import { Sparkline } from '@/components/sparkline';
import { Stat } from '@/components/stat';
import { Stepper } from '@/components/stepper';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import { WeekdayPicker } from '@/components/weekday-picker';
import { sendMessage } from '@/core/agent/run';
import { formatAgo, refreshAll, useBindings, useToolData, useWidgetData } from '@/core/dashboard/live-hooks';
import { widgetStore } from '@/core/dashboard/store';
import { usePlugin } from '@/core/runtime/hooks';
import { invokeTool, services } from '@/core/runtime/invoke';
import { pluginName } from '@/core/runtime/localize';
import { usePluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import type { HostComponents, HostTheme, HostUI, WidgetSize } from '@/core/runtime/types';
import { kv } from '@/core/store/kv';
import { jobStore } from '@/core/scheduler/store';
import { timetable } from '@/core/timetable/store';
import { todoStore } from '@/core/todo/store';
import { GenUIView } from '@/genui/view';
import { useLayout } from '@/hooks/use-layout';
import { useNow } from '@/hooks/use-now';
import { useLocale, useT } from '@/i18n';
import { useSecureDisplay } from '@/hooks/use-secure-display';
import { courseColors, glassMaterial, radius, spacing, typography, useTheme, useThemeName } from '@/theme';
import { haptics } from '@/utils/haptics';

/**
 * The harness's UI kit for plugin screens (`HostUI` in @pku-harness/sdk). Our components accept
 * more props than the contract exposes; the casts narrow them to the public surface.
 */

const GAP = { xs: spacing.xs, sm: spacing.sm, md: spacing.md, lg: spacing.lg, xl: spacing.xl } as const;
const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' } as const;

function Row({ gap = 'md', align = 'center', children }: { gap?: keyof typeof GAP; align?: keyof typeof JUSTIFY; children: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: GAP[gap], justifyContent: JUSTIFY[align] }}>{children}</View>;
}

function Column({ gap = 'md', children }: { gap?: keyof typeof GAP; children: ReactNode }) {
  return <View style={{ gap: GAP[gap] }}>{children}</View>;
}

function GenUI({ spec, onSubmit }: { spec: Record<string, unknown>; onSubmit?: (form: Record<string, unknown>, label?: string) => void }) {
  return <GenUIView spec={spec as unknown as Spec} onSubmit={onSubmit} />;
}

function WidgetNotice({ icon, text }: { icon: string; text: string }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
      <Icon name={icon as 'warning'} size={16} color={c.warn} />
      <Text variant="caption" tone="muted" numberOfLines={3} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** A plugin's native dashboard widget, with its store and tool access, isolated by an error boundary. */
function PluginWidget({ source, size }: { source: { plugin: string; widget: string; config?: Record<string, unknown> }; size: WidgetSize }) {
  const t = useT();
  const locale = useLocale();
  const plugin = usePlugin(source.plugin);
  const settings = usePluginSettings(source.plugin);
  const store = useMemo(() => kv(`plugin:${source.plugin}`), [source.plugin]);
  const contribution = plugin?.contributes?.widgets?.[source.widget];
  if (!plugin || !contribution) return <WidgetNotice icon="puzzle" text={t('app.widgets.notFound', { id: `${source.plugin}/${source.widget}` })} />;
  if (!settings.enabled || registry.unavailable(plugin.id)) return <WidgetNotice icon="puzzle" text={t('app.widgets.unavailable', { name: pluginName(plugin, locale) })} />;
  const Widget = contribution.component;
  return (
    <ErrorBoundary fallback={(e) => <WidgetNotice icon="warning" text={t('app.widgets.crashed', { message: e.message })} />}>
      <Widget
        host={hostUI}
        services={services}
        kv={store}
        invoke={(tool, input) => invokeTool(tool, input ?? {}, { actor: 'user' })}
        size={size}
        config={source.config ?? {}}
      />
    </ErrorBoundary>
  );
}

const components = {
  Screen,
  Text,
  Button,
  IconButton,
  ListGroup,
  ListRow,
  Chip,
  Surface,
  EmptyState,
  Skeleton,
  FadeIn,
  Icon,
  Stat,
  Switch: NativeSwitch,
  Checkbox: NativeCheckbox,
  Segmented,
  Row,
  Column,
  Pressable: PressableScale,
  Field,
  DateTimeField,
  Stepper,
  WeekdayPicker,
  SheetScreen,
  Sparkline,
  Ring: ProgressRing,
  Hourglass,
  GenUI,
  SortableList,
  PluginWidget,
  QRCode,
  Glass,
  GlassEdges,
} as unknown as HostComponents;

function useHostTheme(): HostTheme {
  const colors = useTheme();
  const name = useThemeName();
  const { contentWidth } = useLayout();
  const g = glassMaterial[name];
  return {
    name,
    colors,
    spacing,
    radius,
    typography: typography as unknown as HostTheme['typography'],
    courseColor: (i) => {
      const list = courseColors[name];
      return list[((i % list.length) + list.length) % list.length];
    },
    glass: { surface: g.fill, rim: g.edge, sheen: g.topLight },
    contentWidth,
  };
}

let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};
let wired = false;
function subscribe(l: () => void) {
  if (!wired) {
    wired = true;
    [jobStore, todoStore, widgetStore, timetable].forEach((s) => s.subscribe(bump));
  }
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * expo-clipboard's native module, looked up optionally: it is in package.json but only present
 * in dev builds made after it was added, and its JS wrapper throws at import when missing.
 */
const clipboardModule = requireOptionalNativeModule<{ setStringAsync(text: string, options: object): Promise<boolean> }>('ExpoClipboard');

export const hostUI: HostUI = {
  components,
  haptics,
  navigate: (href) => router.push(href as never),
  back: () => (router.canGoBack() ? router.back() : router.replace('/settings')),
  useStoreVersion: () => useSyncExternalStore(subscribe, () => version),
  useTheme: useHostTheme,
  useNow,
  useLocale,
  dismiss: (fallback) => dismiss((fallback ?? '/schedule') as '/schedule'),
  ask: (text) => {
    router.navigate('/');
    sendMessage(text);
  },
  useToolData: useToolData as HostUI['useToolData'],
  useWidgetData,
  useBindings,
  refreshAll,
  formatAgo,
  useSecureDisplay,
  clipboard: clipboardModule ? { setString: (text) => clipboardModule.setStringAsync(text, {}).then(() => undefined) } : undefined,
};
