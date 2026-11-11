import { BlurTargetView } from 'expo-blur';
import { Redirect, usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { useRef, useState, type ComponentRef, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/aurora';
import { TAB_BAR_PAD, TabButton, TabIndicator } from '@/components/tab-bar';
import { isOnboarded } from '@/core/boot';
import { BackdropProvided } from '@/hooks/use-backdrop';
import { TabsBlurTarget, useFloatingOverlay } from '@/hooks/use-floating-overlay';
import { TabBarInset } from '@/hooks/use-tab-bar-inset';
import { useT } from '@/i18n';
import { shadows, spacing, useTheme } from '@/theme';

/**
 * Four-tab shell: Chat · Dashboard · Schedule · Settings (docs/ARCHITECTURE.md §2). The bar is a
 * pill floating above the gesture bar, inset from the edges, with the selected tab in a lighter
 * pill that slides between tabs (as in Claude's mobile app); content scrolls beneath it.
 */
const TABS = ['/', '/dashboard', '/schedule', '/settings'];

export default function TabsLayout() {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const target = useRef<ComponentRef<typeof View> | null>(null);
  const [bar, setBar] = useState({ width: 0, height: 0 });
  const path = usePathname();
  const active = TABS.indexOf(path === '/' ? '/' : (TABS.find((tab) => tab !== '/' && path.startsWith(tab)) ?? ''));
  // A pill floating above the gesture bar; screens keep their content clear of it (TabBarInset).
  const bottom = Math.max(insets.bottom, spacing.sm) + spacing.xs;
  if (!isOnboarded()) return <Redirect href="/welcome" />;
  return (
    <Tabs style={{ flex: 1, backgroundColor: c.bg }}>
      <TabBarInset value={bar.height ? bar.height + bottom + spacing.sm : 0}>
        <BackdropProvided value>
          {/* One aurora behind every tab, inside the blur target so the bar frosts it too. */}
          <BlurTargetView ref={target} style={{ flex: 1, backgroundColor: c.bg }}>
            <Aurora />
            <TabSlot style={{ flex: 1 }} />
          </BlurTargetView>
        </BackdropProvided>
      </TabBarInset>
      {/* A screen's floating element (src/hooks/use-floating-overlay.ts), outside the blur target
          so it can frost the content beneath like the bar does. */}
      <FloatingOverlay target={target} />
      {/* TabList must stay a direct child of Tabs (expo-router/ui finds triggers there); the
          glass layers sit inside it and are ignored as non-triggers. */}
      <TabList asChild>
        <View
          onLayout={(e) => setBar({ width: e.nativeEvent.layout.width, height: Math.round(e.nativeEvent.layout.height) })}
          style={StyleSheet.flatten([styles.dock, { bottom, backgroundColor: c.elevated, borderColor: c.border, boxShadow: shadows.overlay }])}>
          <TabIndicator index={active} count={TABS.length} width={bar.width} height={bar.height} />
          <TabTrigger name="chat" href="/" asChild>
            <TabButton icon="chat" label={t('app.tabs.chat')} />
          </TabTrigger>
          <TabTrigger name="dashboard" href="/dashboard" asChild>
            <TabButton icon="dashboard" label={t('app.tabs.dashboard')} />
          </TabTrigger>
          <TabTrigger name="schedule" href="/schedule" asChild>
            <TabButton icon="schedule" label={t('app.tabs.schedule')} />
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton icon="settings" label={t('app.tabs.settings')} />
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

/** Its own subscriber, so a screen updating its overlay never re-renders the whole tab shell. */
function FloatingOverlay({ target }: { target: RefObject<ComponentRef<typeof View> | null> }) {
  const overlay = useFloatingOverlay();
  if (!overlay) return null;
  return (
    <View pointerEvents="box-none" style={[styles.overlay, { bottom: overlay.bottom }]}>
      <TabsBlurTarget value={target}>{overlay.node}</TabsBlurTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  dock: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    padding: TAB_BAR_PAD,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
