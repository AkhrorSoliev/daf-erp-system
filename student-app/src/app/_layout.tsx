import '@/global.css';

import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import {
  Baloo2_600SemiBold,
  Baloo2_700Bold,
  Baloo2_800ExtraBold,
} from '@expo-google-fonts/baloo-2';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from '@expo-google-fonts/nunito';

import { queryClient } from '@/api/query-client';
import { useAuth } from '@/auth/auth-store';
import { tokens } from '@/design/tokens';

const navTheme: Theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: tokens.color.bg },
};

export default function RootLayout() {
  const status = useAuth((s) => s.status);
  const hydrate = useAuth((s) => s.hydrate);

  const [fontsLoaded] = useFonts({
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const ready = fontsLoaded && status !== 'loading';

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={navTheme}>
            {!ready ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.bg }}>
                <ActivityIndicator color={tokens.color.primary} />
              </View>
            ) : (
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.color.bg } }}>
                <Stack.Protected guard={status === 'authenticated'}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
                </Stack.Protected>
                <Stack.Protected guard={status !== 'authenticated'}>
                  <Stack.Screen name="(auth)" />
                </Stack.Protected>
              </Stack>
            )}
            <StatusBar style="dark" />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
