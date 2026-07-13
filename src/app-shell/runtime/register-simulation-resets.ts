import type { ApplicationServices } from './application-services';
import { isSimulationApplicationServices } from './application-services';

type QueryClientResetPort = {
  cancelQueries(): Promise<unknown>;
  clear(): void;
};

const QUERY_CLIENT_PARTICIPANT_KEY = 'app-shell.query-client';

export function registerQueryClientSimulationReset(
  services: ApplicationServices,
  queryClient: QueryClientResetPort,
) {
  if (!isSimulationApplicationServices(services)) return () => undefined;
  if (
    services.simulationRuntime.resetRegistry
      .list()
      .some((participant) => participant.key === QUERY_CLIENT_PARTICIPANT_KEY)
  ) {
    return () => undefined;
  }
  return services.simulationRuntime.registerResetParticipant({
    key: QUERY_CLIENT_PARTICIPANT_KEY,
    order: -1_000,
    async reset() {
      await queryClient.cancelQueries();
      queryClient.clear();
    },
  });
}
