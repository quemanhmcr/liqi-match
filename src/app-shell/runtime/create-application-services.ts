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
import { InMemoryConversationV2Authority } from '@/entities/conversation-v2';
import {
  InMemoryPlayerIdentityRepository,
  SupabasePlayerIdentityRepository,
} from '@/entities/player-identity';
import {
  InMemoryRepeatPlaySessionService,
  createConversationV2SessionProvisioner,
  createRepeatAwareRecommendationProvider,
  createSimulationParticipantLifecycleProvider,
  createSimulationPlaySessionSourceProvider,
  createSimulationRelationshipEligibilityProvider,
  createSupabaseCoreV2RpcTransport,
  createSupabasePlaySessionCommandService,
  createSupabasePlaySessionRepository,
} from '@/entities/play-session';
import {
  InMemorySocialRelationshipRepository,
  SupabaseSocialRelationshipRepository,
} from '@/entities/social-relationship';
import {
  InMemoryTrustOutcomesEngine,
  SupabaseTrustOutcomesEngine,
  createTrustAwarePlaySessionCommandService,
} from '@/entities/trust-outcomes';
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
  createSupabaseConversationV2Adapter,
} from '@/features/messages';
import {
  createSimulationProfileReadRepository,
  createProfileEditSimulationResetParticipant,
  fetchProfileView,
  type ProfileReadRepository,
} from '@/features/profile';
import { createOnboardingSimulationResetParticipant } from '@/features/onboarding';
import { passiveAssetCacheDriver } from '@/shared/assets/asset-cache-driver';
import { isConversationV2Enabled } from '@/shared/config/conversation-v2-rollout';
import {
  getValidAccessToken,
  subscribeAccessToken,
} from '@/shared/auth/auth-service';
import { supabaseAuthClient } from '@/shared/auth/supabase-auth-client';
import { env } from '@/shared/config/env';

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
  const relationshipRepository = new InMemorySocialRelationshipRepository();
  const trustOutcomesEngine = new InMemoryTrustOutcomesEngine(
    () => simulationRuntime.clock.now(),
    relationshipRepository,
  );
  const conversationV2Authority = new InMemoryConversationV2Authority({
    clock: () => simulationRuntime.clock.now(),
  });
  const playSessionService = new InMemoryRepeatPlaySessionService({
    clock: () => simulationRuntime.clock.now(),
    conversationProvisioner: createConversationV2SessionProvisioner({
      authority: conversationV2Authority,
      clock: () => simulationRuntime.clock.now(),
    }),
    lifecycleProvider:
      createSimulationParticipantLifecycleProvider(simulationRuntime),
    relationshipProvider:
      createSimulationRelationshipEligibilityProvider(simulationRuntime),
    sourceProvider:
      createSimulationPlaySessionSourceProvider(simulationRuntime),
  });
  const trustAwarePlaySessionCommandService =
    createTrustAwarePlaySessionCommandService({
      delegate: playSessionService,
      eventLog: playSessionService,
      sessionOutcomeRepository: trustOutcomesEngine,
    });
  const repeatAwareRecommendationProvider =
    createRepeatAwareRecommendationProvider({
      consumer: playSessionService,
      delegate: trustOutcomesEngine,
      eventLog: trustOutcomesEngine,
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
    activityFeedRepository: trustOutcomesEngine,
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
    messageReportEvidenceProvider: null,
    messageRepository: messages,
    messageTransport: messages.transport,
    mode: 'simulation',
    notificationRepository:
      createCanonicalSimulationNotificationInboxRepository({
        runtime: simulationRuntime,
      }),
    profileRepository: createSimulationProfileReadRepository(simulationRuntime),
    playerIdentityRepository: new InMemoryPlayerIdentityRepository(),
    playSessionCommandService: trustAwarePlaySessionCommandService,
    playSessionRepository: playSessionService,
    relationshipRepository,
    endorsementCommandService: trustOutcomesEngine,
    engagementPolicyProvider: trustOutcomesEngine,
    playerTrustProjectionProvider: trustOutcomesEngine,
    reputationLedgerProvider: trustOutcomesEngine,
    repeatPlayRecommendationProvider: repeatAwareRecommendationProvider,
    sessionOutcomeRepository: trustOutcomesEngine,
    scenarioControl: simulationRuntime,
    simulationRuntime,
  };
}

export function createApiApplicationServices(
  options: Readonly<{ conversationV2Enabled?: boolean }> = {},
): ApiApplicationServices {
  const relationshipRepository = new SupabaseSocialRelationshipRepository();
  const trustOutcomesEngine = new SupabaseTrustOutcomesEngine();
  const conversationV2Enabled =
    options.conversationV2Enabled ?? isConversationV2Enabled();
  const messages = conversationV2Enabled
    ? createSupabaseConversationV2Adapter({
        accessTokenProvider: getValidAccessToken,
        accessTokenSubscriber: subscribeAccessToken,
        realtimeClient: supabaseAuthClient,
      })
    : createSupabaseConversationAdapter({
        accessTokenProvider: getValidAccessToken,
        accessTokenSubscriber: subscribeAccessToken,
        realtimeClient: supabaseAuthClient,
      });
  const coreV2Transport = createSupabaseCoreV2RpcTransport({
    anonKey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL,
  });
  const coreV2AccessTokenProvider = { getAccessToken: getValidAccessToken };
  const playSessionCommandService = createSupabasePlaySessionCommandService({
    accessTokenProvider: coreV2AccessTokenProvider,
    transport: coreV2Transport,
  });
  const playSessionRepository = createSupabasePlaySessionRepository({
    accessTokenProvider: coreV2AccessTokenProvider,
    transport: coreV2Transport,
  });
  return {
    activityFeedRepository: trustOutcomesEngine,
    assetResolver: createGoldenWorldAssetResolver({
      cacheDriver: passiveAssetCacheDriver,
    }),
    discoverRepository: new ApiDiscoverRepository(),
    homeMatchFactsRepository: new SupabaseHomeMatchFactsRepository(),
    homeRepository: createApiHomeRepository(),
    matchDecisionRepository: new SupabaseMatchDecisionRepository(),
    matchIntentRepository: new SupabaseMatchIntentRepository(),
    matchSetRepository: new SupabaseMatchSetRepository(),
    conversationLifecycle: 'setMuted' in messages ? messages : undefined,
    messageReportEvidenceProvider: messages,
    messageRepository: messages,
    messageTransport: messages,
    mode: 'api',
    notificationRepository: createApiNotificationInboxRepository(),
    profileRepository: createApiProfileRepository(),
    playerIdentityRepository: new SupabasePlayerIdentityRepository(),
    playSessionCommandService,
    playSessionRepository,
    relationshipRepository,
    endorsementCommandService: trustOutcomesEngine,
    engagementPolicyProvider: trustOutcomesEngine,
    playerTrustProjectionProvider: trustOutcomesEngine,
    reputationLedgerProvider: trustOutcomesEngine,
    repeatPlayRecommendationProvider: trustOutcomesEngine,
    sessionOutcomeRepository: trustOutcomesEngine,
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
