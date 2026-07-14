import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { DeepLinkCoordinatorProvider } from '@/app-shell/deep-link/DeepLinkCoordinatorProvider';
import { PushDeviceLifecycleProvider } from '@/app-shell/push/PushDeviceLifecycleProvider';
import { AuthStateProvider } from '@/shared/auth/auth-context';
import { queryClient } from '@/shared/lib/query-client';

import { getApplicationServices } from '../runtime/application-service-registry';
import { registerQueryClientSimulationReset } from '../runtime/register-simulation-resets';
import { ApplicationServiceProviders } from './ApplicationServiceProviders';

const applicationServices = getApplicationServices();
registerQueryClientSimulationReset(applicationServices, queryClient);

/**
 * Runtime composition belongs to the application shell, not `shared`.
 * Feature code may consume the contexts it needs, but never owns their order.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <KeyboardProvider>
      <AuthStateProvider>
        <DeepLinkCoordinatorProvider>
          <PushDeviceLifecycleProvider>
            <ApplicationServiceProviders services={applicationServices}>
              <QueryClientProvider client={queryClient}>
                {children}
              </QueryClientProvider>
            </ApplicationServiceProviders>
          </PushDeviceLifecycleProvider>
        </DeepLinkCoordinatorProvider>
      </AuthStateProvider>
    </KeyboardProvider>
  );
}
