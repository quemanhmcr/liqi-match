import {
  createGoldenWorldAssetResolver,
  createGoldenWorldSimulationAssetResolver,
} from '@/entities/media-asset';
import {
  createCanonicalSimulationNotificationInboxRepository,
  type NotificationInboxRepository,
} from '@/entities/notifications';
import { createProductionSimulationRuntime } from '@/entities/simulation';
import {
  ApiDiscoverRepository,
  createSimulationDiscoverRepository,
  type DiscoverApiRequest,
  type DiscoverApiTransport,
} from '@/features/discover';
import {
  createSimulationHomeRepository,
  fetchHomeDashboard,
  type HomeRepository,
} from '@/features/home';
import {
  createCanonicalSimulationMessagesAdapter,
  createMessagesSimulationResetParticipant,
  type ChatMessageTransport,
  type ChatRepository,
} from '@/features/messages';
import {
  createSimulationProfileReadRepository,
  createProfileEditSimulationResetParticipant,
  fetchProfileView,
  type ProfileReadRepository,
} from '@/features/profile';
import { createOnboardingSimulationResetParticipant } from '@/features/onboarding';
import { passiveAssetCacheDriver } from '@/shared/assets/asset-cache-driver';
import { env } from '@/shared/config/env';

import { ApplicationServiceUnavailableError } from './application-service-error';
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
    homeRepository: createSimulationHomeRepository(simulationRuntime),
    messageRepository: messages,
    messageTransport: messages.transport,
    mode: 'simulation',
    notificationRepository:
      createCanonicalSimulationNotificationInboxRepository({
        runtime: simulationRuntime,
      }),
    profileRepository: createSimulationProfileReadRepository(simulationRuntime),
    scenarioControl: simulationRuntime,
    simulationRuntime,
  };
}

export function createApiApplicationServices(): ApiApplicationServices {
  return {
    assetResolver: createGoldenWorldAssetResolver({
      cacheDriver: passiveAssetCacheDriver,
    }),
    discoverRepository: new ApiDiscoverRepository(
      createDiscoverHttpTransport(),
    ),
    homeRepository: createApiHomeRepository(),
    messageRepository: createUnavailableMessageRepository(),
    messageTransport: createUnavailableMessageTransport(),
    mode: 'api',
    notificationRepository: createUnavailableNotificationRepository(),
    profileRepository: createApiProfileRepository(),
    scenarioControl: null,
    simulationRuntime: null,
  };
}

function createApiHomeRepository(): HomeRepository {
  return { getDashboard: fetchHomeDashboard };
}

function createApiProfileRepository(): ProfileReadRepository {
  return { getProfile: fetchProfileView };
}

function createDiscoverHttpTransport(): DiscoverApiTransport {
  return {
    async request(request) {
      const url = createRequestUrl(request);
      const response = await fetch(url, {
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
        headers: {
          Accept: 'application/json',
          ...(request.body === undefined
            ? undefined
            : { 'Content-Type': 'application/json' }),
          ...(request.session
            ? { Authorization: `Bearer ${request.session.accessToken}` }
            : undefined),
          ...request.headers,
        },
        method: request.method,
      });

      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw new Error(
          `Discover API request failed with HTTP ${response.status}.`,
          { cause: payload },
        );
      }
      return payload;
    },
  };
}

function createRequestUrl(request: DiscoverApiRequest) {
  const base = env.EXPO_PUBLIC_API_URL.endsWith('/')
    ? env.EXPO_PUBLIC_API_URL
    : `${env.EXPO_PUBLIC_API_URL}/`;
  const url = new URL(request.path.replace(/^\//, ''), base);

  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function readJsonPayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error('API response is not valid JSON.', { cause: error });
  }
}

function createUnavailableMessageRepository(): ChatRepository {
  return {
    async getConversation() {
      throw unavailable('Messages repository');
    },
    async getMessagePage() {
      throw unavailable('Messages repository');
    },
    async listConversations() {
      throw unavailable('Messages repository');
    },
  };
}

function createUnavailableMessageTransport(): ChatMessageTransport {
  return {
    getNetworkState: () => 'online',
    async sendText() {
      throw unavailable('Messages transport');
    },
  };
}

function createUnavailableNotificationRepository(): NotificationInboxRepository {
  return {
    async getSummary() {
      throw unavailable('Notifications repository');
    },
    async list() {
      throw unavailable('Notifications repository');
    },
    async markRead() {
      throw unavailable('Notifications repository');
    },
    async markSeenThrough() {
      throw unavailable('Notifications repository');
    },
  };
}

function nextSimulationApplicationNamespace() {
  simulationApplicationSequence += 1;
  return `application-simulation-${simulationApplicationSequence}`;
}

function unavailable(service: string) {
  return new ApplicationServiceUnavailableError(service);
}
