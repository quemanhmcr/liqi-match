import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AuthSession } from '@/shared/auth/auth-service';
import { AuthStateProvider } from '@/shared/auth/auth-context';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

notifyManager.setScheduler((callback) => callback());

const discoverTestSession: AuthSession = {
  accessToken: 'discover-test-access-token',
  expiresAt: 4102444800,
  refreshToken: 'discover-test-refresh-token',
  tokenType: 'bearer',
  user: {
    email: 'discover@example.com',
    id: '00000000-0000-0000-0000-000000000099',
    user_metadata: { full_name: 'Discover Tester' },
  },
};

type SafeAreaMetrics = {
  frame: { height: number; width: number; x: number; y: number };
  insets: { bottom: number; left: number; right: number; top: number };
};

export function renderDiscoverScreen(
  ui: ReactElement,
  initialMetrics: SafeAreaMetrics,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity, retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: Infinity },
    },
  });

  return render(
    <AuthStateProvider initialSession={discoverTestSession}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          {ui}
        </SafeAreaProvider>
      </QueryClientProvider>
    </AuthStateProvider>,
  );
}
