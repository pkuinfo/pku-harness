import '@/polyfills';
import '../global.css';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { ApprovalPrompt } from '@/components/approval-prompt';
import { wakeAurora } from '@/components/aurora';
import { VerificationPrompt } from '@/components/verification-prompt';
import { boot } from '@/core/boot';
import { useNotificationRouting } from '@/core/notify/use-routing';
import { radius, useTheme, useThemeName } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    boot()
      .catch((e) => console.error('boot failed', e))
      .finally(() => setReady(true));
  }, []);
  const name = useThemeName();
  const c = useTheme();
  useNotificationRouting();

  useEffect(() => {
    if (fontsLoaded && ready) SplashScreen.hideAsync();
  }, [fontsLoaded, ready]);

  if (!fontsLoaded || !ready) return null;

  const base = name === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: c.bg, card: c.surface, text: c.text, border: c.border, primary: c.accent },
  };

  return (
    // Any touch wakes the backdrop's drift; it rests again once the app sits idle.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }} onTouchStartCapture={wakeAurora}>
      <KeyboardProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="ai-settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="campus" options={{ presentation: 'modal' }} />
          <Stack.Screen name="m/[plugin]/[screen]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="plugins/add" options={{ presentation: 'modal' }} />
          {/* Composer model picker (docs/AGENT-HARNESS.md §4.5): solid elevated form sheet. */}
          <Stack.Screen
            name="model-picker"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: 'fitToContents',
              sheetGrabberVisible: true,
              sheetCornerRadius: radius.xl,
              contentStyle: { backgroundColor: c.elevated },
            }}
          />
          {/* Sessions sheet (docs/AGENT-HARNESS.md §2). */}
          <Stack.Screen
            name="sessions"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.7, 1],
              sheetGrabberVisible: true,
              sheetCornerRadius: radius.xl,
              contentStyle: { backgroundColor: c.elevated },
            }}
          />
          {/* Context sheet (docs/AGENT-HARNESS.md §6.3): sized to its content. */}
          <Stack.Screen
            name="context"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: 'fitToContents',
              sheetGrabberVisible: true,
              sheetCornerRadius: radius.xl,
              contentStyle: { backgroundColor: c.elevated },
            }}
          />
          {/* Usage screen (docs/AGENT-HARNESS.md §6.4): a pushed screen. */}
          <Stack.Screen name="usage" />
        </Stack>
        <ApprovalPrompt />
        <VerificationPrompt />
      </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
