import { env } from '@/shared/config/env';

import { createApplicationServices } from './create-application-services';
import { parseApplicationRuntimeMode } from './application-runtime-mode';
import { isSimulationApplicationServices } from './application-services';

const applicationServices = createApplicationServices(
  parseApplicationRuntimeMode(env.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE),
);

export function getApplicationServices() {
  return applicationServices;
}

export function getApplicationSimulationRuntime() {
  return isSimulationApplicationServices(applicationServices)
    ? applicationServices.simulationRuntime
    : null;
}
