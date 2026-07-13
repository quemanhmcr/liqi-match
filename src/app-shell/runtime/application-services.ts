import type { AssetResolver } from '@/entities/media-asset';
import type { NotificationInboxRepository } from '@/entities/notifications';
import type { ProductionSimulationRuntime } from '@/entities/simulation';
import type { DiscoverRepository } from '@/features/discover';
import type { HomeRepository } from '@/features/home';
import type { ChatMessageTransport, ChatRepository } from '@/features/messages';
import type { ProfileReadRepository } from '@/features/profile';

import type { ApplicationRuntimeMode } from './application-runtime-mode';

type ApplicationFeatureServices = {
  assetResolver: AssetResolver;
  discoverRepository: DiscoverRepository;
  homeRepository: HomeRepository;
  messageRepository: ChatRepository;
  messageTransport: ChatMessageTransport;
  notificationRepository: NotificationInboxRepository;
  profileRepository: ProfileReadRepository;
};

export type SimulationApplicationServices = ApplicationFeatureServices & {
  mode: 'simulation';
  simulationRuntime: ProductionSimulationRuntime;
};

export type ApiApplicationServices = ApplicationFeatureServices & {
  mode: 'api';
  simulationRuntime: null;
};

export type ApplicationServices =
  ApiApplicationServices | SimulationApplicationServices;

export function isSimulationApplicationServices(
  services: ApplicationServices,
): services is SimulationApplicationServices {
  return services.mode === 'simulation';
}

export type ApplicationServicesForMode<TMode extends ApplicationRuntimeMode> =
  TMode extends 'simulation'
    ? SimulationApplicationServices
    : ApiApplicationServices;
