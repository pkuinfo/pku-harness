import { BlurTargetView, BlurView } from 'expo-blur';
import { Redirect, usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { useRef, useState, type ComponentRef, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/aurora';
import { TabButton, TabIndicator } from '@/components/tab-bar';
import { isOnboarded } from '@/core/boot';
import { BackdropProvided } from '@/hooks/use-backdrop';
import { TabsBlurTarget, useFloatingOverlay } from '@/hooks/use-floating-overlay';
import { TabBarInset } from '@/hooks/use-tab-bar-inset';
import { glassMaterial, spacing, useTheme, useThemeName } from '@/theme';

/**
 * Four-tab shell: Chat · Dashboard · Schedule · Settings (docs/ARCHITECTURE.md §2). The bar is
 * liquid glass floating over the content: a real blur of what scrolls beneath (expo-blur,
 * RenderNode on Android 12+), tinted with the glass tokens and lit by a top rim.
 */
const TABS = ['/', '/dashboard', '/schedule', '/settings'];

export default function TabsLayout() {
  const c = useTheme();
  const name = useThemeName();
  const m = glassMaterial[name];
  const insets = useSafeAreaInsets();
  const target = useRef<ComponentRef<typeof View> | null>(null);
  const [bar, setBar] = useState({ width: 0, height: 0 });
  const path = usePathname();
  const active = TABS.indexOf(path === '/' ? '/' : (TABS.find((t) => t !== '/' && path.startsWith(t)) ?? ''));
  if (!isOnboarded()) return <Redirect href="/welcome" />;
  return (
    <Tabs style={{ flex: 1, backgroundColor: c.bg }}>
      <TabBarInset value={bar.height}>
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
          style={StyleSheet.flatten([styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }])}>
          <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={60} tint={name === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View pointerEvents="none" style={StyleSheet.flatten([StyleSheet.absoluteFill, { backgroundColor: c.bg, opacity: 0.72 }])} />
          <View pointerEvents="none" style={StyleSheet.flatten([styles.edge, { backgroundColor: m.edge }])} />
          <View pointerEvents="none" style={StyleSheet.flatten([styles.light, { backgroundImage: m.topLight }])} />
          <TabIndicator index={active} count={TABS.length} width={bar.width} />
          <TabTrigger name="chat" href="/" asChild>
            <TabButton icon="chat" label="对话" />
          </TabTrigger>
          <TabTrigger name="dashboard" href="/dashboard" asChild>
            <TabButton icon="dashboard" label="看板" />
          </TabTrigger>
          <TabTrigger name="schedule" href="/schedule" asChild>
            <TabButton icon="schedule" label="日程" />
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton icon="settings" label="设置" />
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
  edge: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
  light: { position: 'absolute', top: 0, left: '15%', right: '15%', height: 1 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingTop: spacing.xs, paddingHorizontal: spacing.sm },
});
