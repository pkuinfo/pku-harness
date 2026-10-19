import { BlurTargetView, BlurView } from 'expo-blur';
import { Redirect } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabButton } from '@/components/tab-bar';
import { isOnboarded } from '@/core/boot';
import { TabBarInset } from '@/hooks/use-tab-bar-inset';
import { glassTokens, spacing, useTheme, useThemeName } from '@/theme';

/**
 * Four-tab shell: Chat · Dashboard · Schedule · Settings (docs/ARCHITECTURE.md §2). The bar is
 * liquid glass floating over the content: a real blur of what scrolls beneath (expo-blur,
 * RenderNode on Android 12+), tinted with the glass tokens and lit by a top rim.
 */
export default function TabsLayout() {
  const c = useTheme();
  const name = useThemeName();
  const g = glassTokens[name];
  const insets = useSafeAreaInsets();
  const target = useRef<ComponentRef<typeof View> | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  if (!isOnboarded()) return <Redirect href="/welcome" />;
  return (
    <Tabs style={{ flex: 1, backgroundColor: c.bg }}>
      <TabBarInset value={barHeight}>
        <BlurTargetView ref={target} style={{ flex: 1, backgroundColor: c.bg }}>
          <TabSlot style={{ flex: 1 }} />
        </BlurTargetView>
      </TabBarInset>
      {/* TabList must stay a direct child of Tabs (expo-router/ui finds triggers there); the
          glass layers sit inside it and are ignored as non-triggers. */}
      <TabList asChild>
        <View
          onLayout={(e) => setBarHeight(Math.round(e.nativeEvent.layout.height))}
          style={StyleSheet.flatten([styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }])}>
          <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={60} tint={name === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View
            pointerEvents="none"
            style={StyleSheet.flatten([
              StyleSheet.absoluteFill,
              {
                backgroundColor: g.surface,
                backgroundImage: `linear-gradient(180deg, ${g.sheen[0]}, ${g.sheen[1]} 40%, transparent)`,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: name === 'dark' ? g.rim[1] : c.border,
              },
            ])}
          />
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

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingTop: spacing.xs, paddingHorizontal: spacing.sm },
});
