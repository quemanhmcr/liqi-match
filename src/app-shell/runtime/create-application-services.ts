import {
  InMemoryHomeMatchFactsRepository,
  SupabaseHomeMatchFactsRepository,
} from '@/entities/home-match-facts';
import {
  InMemoryMatchDecisionRepository,
  SupabaseMatchDecisionRepository,
} from '@/entities/match-decision';
import {
  InMemoryMatchIntentRepository,
  SupabaseMatchIntentRepository,
} from '@/entities/match-intent';
import {
  InMemoryMatchSetRepository,
  SupabaseMatchSetRepository,
} from '@/entities/match-set';
import {
  createGoldenWorldAssetResolver,
  createGoldenWorldSimulationAssetResolver,
} from '@/entities/media-asset';
import {
  createApiNotificationInboxRepository,
  createCanonicalSimulationNotificationInboxRepository,
} from '@/entities/notifications';
import { createProductionSimulationRuntime } from '@/entities/simulation';
import {
  InMemorySocialRelationshipRepository,
  SupabaseSocialRelationshipRepository,
} from '@/entities/social-relationship';
import {
  ApiDiscoverRepository,
  createSimulationDiscoverRepository,
} from '@/features/discover';
import {
  createApiHomeRepository,
  createSimulationHomeRepository,
} from '@/features/home';
import {
  createCanonicalSimulationMessagesAdapter,
  createMessagesSimulationResetParticipant,
  createSupabaseConversationAdapter,
} from '@/features/messages';
import {
  createSimulationProfileReadRepository,
  createProfileEditSimulationResetParticipant,
  fetchProfileView,
  type ProfileReadRepository,
} from '@/features/profile';
import { createOnboardingSimulationResetParticipant } from '@/features/onboarding';
import { passiveAssetCacheDriver } from '@/shared/assets/asset-cache-driver';
import {
  getValidAccessToken,
  subscribeAccessToken,
} from '@/shared/auth/auth-service';
import { supabaseAuthClient } from '@/shared/auth/supabase-auth-client';

import type {
  ApiApplicationServices,
  ApplicationServices,
  SimulationApplicationServices,
} from './application-services';
import type { ApplicationRuntimeMode } from './application-runtime-mode';

export type CreateSimulationApplicationServicesOptions = Readonly<{
  namespace?: string;
  onboardingAccountId?: string;
  scenarioId?: string;
}>;

let simulationApplicationSequence = 0;

export function createApplicationServices(
  mode: ApplicationRuntimeMode,
): ApplicationServices {
  return mode === 'simulation'
    ? createSimulationApplicationServices()
    : createApiApplicationServices();
}

export function createSimulationApplicationServices(
  options: CreateSimulationApplicationServicesOptions = {},
): SimulationApplicationServices {
  const simulationRuntime = createProductionSimulationRuntime({
    ...(options.scenarioId ? { initialScenarioId: options.scenarioId } : {}),
    namespace: options.namespace ?? nextSimulationApplicationNamespace(),
  });
  const messages = createCanonicalSimulationMessagesAdapter({
    runtime: simulationRuntime,
  });
  simulationRuntime.registerResetParticipant(
    createMessagesSimulationResetParticipant(),
  );
  simulationRuntime.registerResetParticipant(
    createProfileEditSimulationResetParticipant(
      simulationRuntime.readWorld().viewerId,
    ),
  );
  if (options.onboardingAccountId) {
    simulationRuntime.registerResetParticipant(
      createOnboardingSimulationResetParticipant(options.onboardingAccountId),
    );
  }

  return {
    assetResolver: createGoldenWorldSimulationAssetResolver({
      cacheDriver: passiveAssetCacheDriver,
      runtime: simulationRuntime,
    }),
    discoverRepository: createSimulationDiscoverRepository(simulationRuntime),
    homeMatchFactsRepository: new InMemoryHomeMatchFactsRepository(),
    homeRepository: createSimulationHomeRepository(simulationRuntime),
    matchDecisionRepository: new InMemoryMatchDecisionRepository(),
    matchIntentRepository: new InMemoryMatchIntentRepository(),
    matchSetRepository: new InMemoryMatchSetRepository(),
    messageRepository: messages,
    messageTransport: messages.transport,
    mode: 'simulation',
    notificationRepository:
      createCanonicalSimulationNotificationInboxRepository({
        runtime: simulationRuntime,
      }),
    profileRepository: createSimulationProfileReadRepository(simulationRuntime),
    relationshipRepository: new InMemorySocialRelationshipRepository(),
    scenarioControl: simulationRuntime,
    simulationRuntime,
  };
}

export function createApiApplicationServices(): ApiApplicationServices {
  const relationshipRepository = new SupabaseSocialRelationshipRepository();
  const messages = createSupabaseConversationAdapter({
    accessTokenProvider: getValidAccessToken,
    accessTokenSubscriber: subscribeAccessToken,
    realtimeClient: supabaseAuthClient,
    relationshipCapabilitiesProvider: relationshipRepository,
  });
  return {
    assetResolver: createGoldenWorldAssetResolver({
      cacheDriver: passiveAssetCacheDriver,
    }),
    discoverRepository: new ApiDiscoverRepository(),
    homeMatchFactsRepository: new SupabaseHomeMatchFactsRepository(),
    homeRepository: createApiHomeRepository(),
    matchDecisionRepository: new SupabaseMatchDecisionRepository(),
    matchIntentRepository: new SupabaseMatchIntentRepository(),
    matchSetRepository: new SupabaseMatchSetRepository(),
    messageRepository: messages,
    messageTransport: messages,
    mode: 'api',
    notificationRepository: createApiNotificationInboxRepository(),
    profileRepository: createApiProfileRepository(),
    relationshipRepository,
    scenarioControl: null,
    simulationRuntime: null,
  };
}

function createApiProfileRepository(): ProfileReadRepository {
  return { getProfile: fetchProfileView };
}

function nextSimulationApplicationNamespace() {
  simulationApplicationSequence += 1;
  return `application-simulation-${simulationApplicationSequence}`;
}
