import { describe, expect, it, jest } from '@jest/globals';

import {
  createApiApplicationServices,
  createSimulationApplicationServices,
} from '../create-application-services';
import { registerQueryClientSimulationReset } from '../register-simulation-resets';

describe('application simulation reset registration', () => {
  it('clears QueryClient through the shared runtime reset lifecycle', async () => {
    const services = createSimulationApplicationServices({
      namespace: 'query-client-reset',
    });
    const queryClient = {
      cancelQueries: jest.fn(async () => undefined),
      clear: jest.fn(),
    };

    registerQueryClientSimulationReset(services, queryClient);
    registerQueryClientSimulationReset(services, queryClient);
    await services.simulationRuntime.reset();

    expect(queryClient.cancelQueries).toHaveBeenCalledTimes(1);
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(
      services.simulationRuntime.resetRegistry
        .list()
        .filter((participant) => participant.key === 'app-shell.query-client'),
    ).toHaveLength(1);
  });

  it('does not register simulation resets in API mode', () => {
    const services = createApiApplicationServices();
    const queryClient = {
      cancelQueries: jest.fn(async () => undefined),
      clear: jest.fn(),
    };

    registerQueryClientSimulationReset(services, queryClient)();

    expect(queryClient.cancelQueries).not.toHaveBeenCalled();
    expect(queryClient.clear).not.toHaveBeenCalled();
  });
});
