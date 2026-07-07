import '@/global.css';

import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { DefaultTheme, DarkTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from '@expo-google-fonts/nunito';

import { queryClient } from '@/api/query-client';
import { observability } from '@/lib/observability';
import { useAuth } from '@/auth/auth-store';
import { useLanguageStore } from '@/i18n';
import { useThemeStore } from '@/design/theme';
import { ThemeTransitionProvider } from '@/design/theme-transition';
import { useColors, themeColors } from '@/design/colors';
import { tokens } from '@/design/tokens';

// Lazily required so a dev build WITHOUT the native module doesn't hard-crash
// (e.g. running new JS on an older APK). Falls back to no nav-bar theming.
let NavigationBar: typeof import('expo-navigation-bar') | null = null;
try {
  NavigationBar = require('expo-navigation-bar');
} catch {
  NavigationBar = null;
}

export default function RootLayout() {
  const status = useAuth((s) => s.status);
  const hydrate = useAuth((s) => s.hydrate);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const hydrateLang = useLanguageStore((s) => s.hydrate);
  const [themeReady, setThemeReady] = useState(false);
  const [langReady, setLangReady] = useState(false);

  const { colorScheme } = useColorScheme();
  const colors = useColors();
  const isDark = colorScheme === 'dark';

  const navTheme: Theme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: colors.bg,
      card: colors.surface,
      text: colors.fg,
      border: colors.border,
      primary: tokens.color.primary,
    },
  };

  const [fontsLoaded, fontError] = useFonts({
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });

  // Watchdog: if any boot gate wedges (font fetch error, SecureStore reject),
  // never strand the user on the loader forever — bail out after a few seconds
  // and log which gate was still pending so it shows up in diagnostics.
  const [bailout, setBailout] = useState(false);

  useEffect(() => {
    hydrate();
    hydrateTheme().finally(() => setThemeReady(true));
    hydrateLang().finally(() => setLangReady(true));
  }, [hydrate, hydrateTheme, hydrateLang]);

  useEffect(() => {
    if (fontError) observability.captureError(fontError, { where: 'root.useFonts' });
  }, [fontError]);

  // Theme the Android system navigation bar to match (no-op on iOS / older builds).
  useEffect(() => {
    if (Platform.OS !== 'android' || !NavigationBar) return;
    NavigationBar.setBackgroundColorAsync(colors.bg).catch(() => {});
    NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark').catch(() => {});
  }, [colors.bg, isDark]);

  // Fonts failing to load shouldn't block forever — render with the system
  // fallback font instead of an endless spinner.
  const ready = (fontsLoaded || fontError != null) && status !== 'loading' && themeReady && langReady;

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => {
      observability.captureError(new Error('Boot watchdog tripped — loader stuck'), {
        where: 'root.watchdog',
        fontsLoaded,
        fontError: fontError != null,
        status,
        themeReady,
      });
      setBailout(true);
    }, 8000);
    return () => clearTimeout(t);
  }, [ready, fontsLoaded, fontError, status, themeReady]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={navTheme}>
            <ThemeTransitionProvider>
            {!(ready || bailout) ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
                <ActivityIndicator color={tokens.color.primary} />
              </View>
            ) : (
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                <Stack.Protected guard={status === 'authenticated'}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="schedule" />
                  <Stack.Screen name="attendance" />
                  <Stack.Screen name="payments" />
                  <Stack.Screen name="battle" />
                  <Stack.Screen name="battle-play" />
                  <Stack.Screen name="vocabulary" />
                  <Stack.Screen name="hoeren" />
                  <Stack.Screen name="leaderboard" />
                  <Stack.Screen name="profile" />
                  <Stack.Screen name="settings" />
                  <Stack.Screen name="faq" />
                  <Stack.Screen name="about" />
                  <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
                </Stack.Protected>
                <Stack.Protected guard={status !== 'authenticated'}>
                  <Stack.Screen name="(auth)" />
                </Stack.Protected>
              </Stack>
            )}
            <StatusBar style={isDark ? 'light' : 'dark'} />
            </ThemeTransitionProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
