import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApplicationServiceProviders } from '@/app-shell/providers/ApplicationServiceProviders';
import type { ApplicationServices } from '@/app-shell/runtime/application-services';
import { createSimulationApplicationServices } from '@/app-shell/runtime/create-application-services';
import type { AuthSession } from '@/shared/auth/auth-service';
import { AuthStateProvider } from '@/shared/auth/auth-context';

type ApplicationServiceOverrides = Partial<
  Pick<
    ApplicationServices,
    | 'assetResolver'
    | 'discoverRepository'
    | 'homeRepository'
    | 'messageRepository'
    | 'messageTransport'
    | 'notificationRepository'
    | 'profileRepository'
  >
>;

export const testAuthSession: AuthSession = {
  accessToken: 'test-access-token',
  expiresAt: 4102444800,
  refreshToken: 'test-refresh-token',
  tokenType: 'bearer',
  user: {
    email: 'tester@example.com',
    id: '00000000-0000-0000-0000-000000000001',
    user_metadata: { full_name: 'Test Player' },
  },
};

export async function renderWithProviders(
  ui: ReactElement,
  {
    serviceOverrides,
    services,
    session = testAuthSession,
  }: {
    serviceOverrides?: ApplicationServiceOverrides;
    services?: ApplicationServices;
    session?: AuthSession | null;
  } = {},
) {
  const resolvedServices: ApplicationServices = services ?? {
    ...createSimulationApplicationServices(),
    ...serviceOverrides,
  };
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity, retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  });

  const renderResult = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 800, width: 400, x: 0, y: 0 },
        insets: { bottom: 0, left: 0, right: 0, top: 0 },
      }}
    >
      <AuthStateProvider initialSession={session}>
        <ApplicationServiceProviders services={resolvedServices}>
          <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
        </ApplicationServiceProviders>
      </AuthStateProvider>
    </SafeAreaProvider>,
  );

  return { ...renderResult, queryClient, services: resolvedServices };
}
