import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import '@/shared/config/env';
import { AppProviders } from '@/app-shell/providers/AppProviders';

/** Root owns only runtime providers and the top-level navigator. */
export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AppProviders>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="light" />
      </ThemeProvider>
    </AppProviders>
  );
}
