import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { AuthStateProvider } from '@/shared/auth/auth-context';
import { env } from '@/shared/config/env';
import { queryClient } from '@/shared/lib/query-client';

import { createApplicationServices } from '../runtime/create-application-services';
import { parseApplicationRuntimeMode } from '../runtime/application-runtime-mode';
import { ApplicationServiceProviders } from './ApplicationServiceProviders';

const applicationServices = createApplicationServices(
  parseApplicationRuntimeMode(env.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE),
);

/**
 * Runtime composition belongs to the application shell, not `shared`.
 * Feature code may consume the contexts it needs, but never owns their order.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <KeyboardProvider>
      <AuthStateProvider>
        <ApplicationServiceProviders services={applicationServices}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </ApplicationServiceProviders>
      </AuthStateProvider>
    </KeyboardProvider>
  );
}
