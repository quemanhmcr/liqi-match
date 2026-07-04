import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { AuthStateProvider as AppAuthProvider } from '@/shared/auth/auth-context';
import { queryClient } from '@/shared/lib/query-client';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AppAuthProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AppAuthProvider>
  );
}
