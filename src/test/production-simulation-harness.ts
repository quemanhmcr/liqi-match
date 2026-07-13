import type { ApplicationServices } from '@/app-shell/runtime/application-services';
import { createSimulationApplicationServices } from '@/app-shell/runtime/create-application-services';
import { GOLDEN_PROFILE_IDS } from '@/entities/simulation';
import type { ChatRepository } from '@/features/messages';
import type { AuthSession } from '@/shared/auth/auth-service';

export const productionSimulationSession: AuthSession = {
  accessToken: 'production-simulation-access-token',
  expiresAt: 4_102_444_800,
  refreshToken: 'production-simulation-refresh-token',
  tokenType: 'bearer',
  user: {
    email: 'quan.viewer@simulation.liqi.test',
    id: GOLDEN_PROFILE_IDS.quanViewer,
    user_metadata: { full_name: 'Quân' },
  },
};

export const productionSimulationDiscoverContext = {
  locale: 'vi-VN',
  session: productionSimulationSession,
  timezone: 'Asia/Bangkok',
  viewerId: GOLDEN_PROFILE_IDS.quanViewer,
} as const;

type SimulationMessagesAcceptancePort = ChatRepository & {
  listOutbox(): readonly unknown[];
  whenIdle(): Promise<void>;
};

export type ProductionSimulationHarness = Readonly<{
  discoverContext: typeof productionSimulationDiscoverContext;
  messages: SimulationMessagesAcceptancePort;
  services: Extract<ApplicationServices, { mode: 'simulation' }>;
  session: AuthSession;
}>;

export function createProductionSimulationHarness(
  namespace: string,
): ProductionSimulationHarness {
  const services = createSimulationApplicationServices({ namespace });
  return {
    discoverContext: productionSimulationDiscoverContext,
    messages: services.messageRepository as SimulationMessagesAcceptancePort,
    services,
    session: productionSimulationSession,
  };
}
