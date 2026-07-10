import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { AuthStateProvider } from '@/shared/auth/auth-context';
import { queryClient } from '@/shared/lib/query-client';

/**
 * Runtime composition belongs to the application shell, not `shared`.
 * Feature code may consume the contexts it needs, but never owns their order.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AuthStateProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AuthStateProvider>
  );
}
