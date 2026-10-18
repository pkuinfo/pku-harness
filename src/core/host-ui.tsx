import { router } from 'expo-router';
import { useSyncExternalStore, type ReactNode } from 'react';
import { View } from 'react-native';

import type { Spec } from '@json-render/core';

import { Button, IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { DateTimeField } from '@/components/date-time-field';
import { Field } from '@/components/field';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/fade-in';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-group';
import { NativeCheckbox } from '@/components/native-checkbox';
import { NativeSwitch } from '@/components/native-switch';
import { PressableScale } from '@/components/pressable-scale';
import { ProgressRing } from '@/components/progress-ring';
import { Screen } from '@/components/screen';
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
import { widgetStore } from '@/core/dashboard/store';
import type { HostComponents, HostTheme, HostUI } from '@/core/runtime/types';
import { jobStore } from '@/core/scheduler/store';
import { timetable } from '@/core/timetable/store';
import { todoStore } from '@/core/todo/store';
import { GenUIView } from '@/genui/view';
import { useLayout } from '@/hooks/use-layout';
import { useNow } from '@/hooks/use-now';
import { courseColors, glassTokens, radius, spacing, typography, useTheme, useThemeName } from '@/theme';
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
  GenUI,
  SortableList,
} as unknown as HostComponents;

function useHostTheme(): HostTheme {
  const colors = useTheme();
  const name = useThemeName();
  const { contentWidth } = useLayout();
  const g = glassTokens[name];
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
    glass: { surface: g.surface, rim: g.rim[0], sheen: `linear-gradient(180deg, ${g.sheen[0]}, ${g.sheen[1]})` },
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

export const hostUI: HostUI = {
  components,
  haptics,
  navigate: (href) => router.push(href as never),
  back: () => (router.canGoBack() ? router.back() : router.replace('/settings')),
  useStoreVersion: () => useSyncExternalStore(subscribe, () => version),
  useTheme: useHostTheme,
  useNow,
  dismiss: (fallback) => dismiss((fallback ?? '/schedule') as '/schedule'),
  ask: (text) => {
    router.navigate('/');
    sendMessage(text);
  },
};
