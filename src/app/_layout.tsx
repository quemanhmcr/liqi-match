import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import '@/shared/config/env';
import { appNavigationTheme } from '@/app-shell/navigation/app-navigation-theme';
import { AppProviders } from '@/app-shell/providers/AppProviders';

/** Root owns only runtime providers and the top-level navigator. */
export default function RootLayout() {
  return (
    <AppProviders>
      <ThemeProvider value={appNavigationTheme}>
        <Stack
          screenOptions={{
            contentStyle: {
              backgroundColor: appNavigationTheme.colors.background,
            },
            headerShown: false,
          }}
        />
        <StatusBar style="light" />
      </ThemeProvider>
    </AppProviders>
  );
}
