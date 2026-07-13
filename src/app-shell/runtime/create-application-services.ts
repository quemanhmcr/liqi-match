import { createGoldenWorldAssetResolver } from '@/entities/media-asset';
import {
  MockNotificationInboxRepository,
  type NotificationInboxRepository,
} from '@/entities/notifications';
import {
  ApiDiscoverRepository,
  MockDiscoverRepository,
  type DiscoverApiRequest,
  type DiscoverApiTransport,
} from '@/features/discover';
import {
  buildPreviewHomeDashboard,
  fetchHomeDashboard,
  type HomeRepository,
} from '@/features/home';
import {
  createChatScenarioController,
  createLocalChatRepository,
  type ChatMessageTransport,
  type ChatRepository,
} from '@/features/messages';
import {
  buildPreviewProfile,
  fetchProfileView,
  type ProfileReadRepository,
} from '@/features/profile';
import { passiveAssetCacheDriver } from '@/shared/assets/asset-cache-driver';
import { env } from '@/shared/config/env';

import { ApplicationServiceUnavailableError } from './application-service-error';
import type { ApplicationServices } from './application-services';
import type { ApplicationRuntimeMode } from './application-runtime-mode';

export function createApplicationServices(
  mode: ApplicationRuntimeMode,
): ApplicationServices {
  return mode === 'simulation'
    ? createSimulationApplicationServices()
    : createApiApplicationServices();
}

export function createSimulationApplicationServices(): ApplicationServices {
  const messageScenario = createChatScenarioController();

  return {
    assetResolver: createGoldenWorldAssetResolver({
      cacheDriver: passiveAssetCacheDriver,
    }),
    discoverRepository: new MockDiscoverRepository(),
    homeRepository: {
      async getDashboard(session) {
        return buildPreviewHomeDashboard(session);
      },
    },
    messageRepository: createLocalChatRepository(),
    messageTransport: messageScenario.transport,
    mode: 'simulation',
    notificationRepository: new MockNotificationInboxRepository(),
    profileRepository: {
      async getProfile({ session, userId }) {
        return buildPreviewProfile(session, userId);
      },
    },
  };
}

export function createApiApplicationServices(): ApplicationServices {
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

function unavailable(service: string) {
  return new ApplicationServiceUnavailableError(service);
}
