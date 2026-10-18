import { router } from 'expo-router';
import { useSyncExternalStore, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/fade-in';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-group';
import { NativeCheckbox } from '@/components/native-checkbox';
import { NativeSwitch } from '@/components/native-switch';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Skeleton } from '@/components/skeleton';
import { Stat } from '@/components/stat';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import { widgetStore } from '@/core/dashboard/store';
import type { HostComponents, HostUI } from '@/core/runtime/types';
import { jobStore } from '@/core/scheduler/store';
import { timetable } from '@/core/timetable/store';
import { todoStore } from '@/core/todo/store';
import { spacing } from '@/theme';
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
} as unknown as HostComponents;

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
};
