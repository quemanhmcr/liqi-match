import type { HomeMatchFactsRepository } from '@/entities/home-match-facts';
import type { MatchDecisionRepository } from '@/entities/match-decision';
import type { MatchIntentRepository } from '@/entities/match-intent';
import type { MatchSetRepository } from '@/entities/match-set';
import type { AssetResolver } from '@/entities/media-asset';
import type {
  PlaySessionCommandService,
  PlaySessionRepository,
} from '@/entities/play-session';
import type {
  ConversationRepository as ConversationV2Repository,
  MessageTransport as ConversationV2MessageTransport,
} from '@/entities/conversation-v2';
import type { NotificationInboxRepository } from '@/entities/notifications';
import type { SocialRelationshipRepository } from '@/entities/social-relationship';
import type {
  ProductionSimulationRuntime,
  SimulationWorldSnapshot,
} from '@/entities/simulation';
import type { ScenarioControlPort } from '@/shared/simulation';
import type { DiscoverRepository } from '@/features/discover';
import type { HomeRepository } from '@/features/home';
import type { ChatMessageTransport, ChatRepository } from '@/features/messages';
import type { ProfileReadRepository } from '@/features/profile';

import type { ApplicationRuntimeMode } from './application-runtime-mode';

type ApplicationFeatureServices = {
  assetResolver: AssetResolver;
  discoverRepository: DiscoverRepository;
  homeMatchFactsRepository: HomeMatchFactsRepository;
  homeRepository: HomeRepository;
  matchDecisionRepository: MatchDecisionRepository;
  matchIntentRepository: MatchIntentRepository;
  matchSetRepository: MatchSetRepository;
  messageRepository: ChatRepository;
  messageTransport: ChatMessageTransport;
  notificationRepository: NotificationInboxRepository;
  profileRepository: ProfileReadRepository;
  playSessionCommandService: PlaySessionCommandService;
  playSessionRepository: PlaySessionRepository;
  conversationV2Repository: ConversationV2Repository | null;
  conversationV2MessageTransport: ConversationV2MessageTransport | null;
  relationshipRepository: SocialRelationshipRepository;
};

export type SimulationApplicationServices = ApplicationFeatureServices & {
  mode: 'simulation';
  scenarioControl: ScenarioControlPort<SimulationWorldSnapshot>;
  simulationRuntime: ProductionSimulationRuntime;
};

export type ApiApplicationServices = ApplicationFeatureServices & {
  mode: 'api';
  scenarioControl: null;
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
