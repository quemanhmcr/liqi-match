import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApplicationServiceProviders } from '@/app-shell/providers/ApplicationServiceProviders';
import type { ApplicationServices } from '@/app-shell/runtime/application-services';
import { createSimulationApplicationServices } from '@/app-shell/runtime/create-application-services';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
  type PlayerLifecycleStateV1,
} from '@/shared/contracts/core-v1';
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

export const testAccountId = '01000000-0000-4000-8000-000000000001';
export const testPlayerId = '20000000-0000-4000-8000-000000000001';
export const testProfileId = '30000000-0000-4000-8000-000000000001';

export function createTestAuthSession({
  accountId = testAccountId,
  lifecycleState = 'active',
  playerId = testPlayerId,
  profileId = testProfileId,
  sessionId = '09000000-0000-4000-8000-000000000001',
}: {
  accountId?: string;
  lifecycleState?: PlayerLifecycleStateV1;
  playerId?: string;
  profileId?: string;
  sessionId?: string;
} = {}): AuthSession {
  const active = lifecycleState === 'active';
  return {
    accessToken: 'test-access-token',
    expiresAt: 4_102_444_800,
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      discoverable: active,
      messagingAllowed: active,
      playerId,
      profileId,
      state: lifecycleState,
      updatedAt: '2026-07-14T00:00:00.000Z',
      version: active ? 2 : 1,
    }),
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId,
      expiresAt: '2100-01-01T00:00:00.000Z',
      issuedAt: '2099-12-31T23:00:00.000Z',
      playerId,
      sessionId,
    }),
    refreshToken: 'test-refresh-token',
    tokenType: 'bearer',
    user: {
      email: 'tester@example.com',
      id: accountId,
      user_metadata: { full_name: 'Test Player' },
    },
  };
}

export const testAuthSession = createTestAuthSession();
export const testOnboardingAuthSession = createTestAuthSession({
  lifecycleState: 'onboarding',
});

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
