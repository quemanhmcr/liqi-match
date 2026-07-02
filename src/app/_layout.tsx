import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import '@/shared/config/env';
import { AppProviders } from '@/shared/components/app-providers';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <AppProviders>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="rank" />
          <Stack.Screen name="lane" />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </AppProviders>
  );
}
