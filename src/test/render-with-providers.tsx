import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { AuthSession } from '@/shared/auth/auth-service';
import { AuthStateProvider } from '@/shared/auth/auth-context';

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

export function renderWithProviders(
  ui: ReactElement,
  { session = testAuthSession }: { session?: AuthSession | null } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity, retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  });

  return render(
    <AuthStateProvider initialSession={session}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </AuthStateProvider>,
  );
}
