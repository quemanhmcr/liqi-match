import { describe, expect, it } from '@jest/globals';

import { goldenWorldAssetKeys } from '@/entities/media-asset';
import { GOLDEN_CONVERSATION_IDS } from '@/entities/simulation';

import { ApplicationServiceUnavailableError } from '../application-service-error';
import {
  createApiApplicationServices,
  createSimulationApplicationServices,
} from '../create-application-services';

const context = {
  locale: 'vi',
  session: null,
  timezone: 'Asia/Bangkok',
  viewerId: 'viewer-1',
};

describe('application service composition', () => {
  it('creates isolated simulation runtime and repository instances', async () => {
    const first = createSimulationApplicationServices({
      namespace: 'application-services-first',
      onboardingAccountId: 'account:first',
    });
    const second = createSimulationApplicationServices({
      namespace: 'application-services-second',
    });

    expect(first.mode).toBe('simulation');
    expect(first.assetResolver).not.toBe(second.assetResolver);
    expect(
      first.assetResolver.resolve(goldenWorldAssetKeys.shared.avatarFallback)
        .state,
    ).toBe('ready');
    expect(first.simulationRuntime).not.toBe(second.simulationRuntime);
    expect(first.simulationRuntime.getNamespace()).toBe(
      'application-services-first',
    );
    expect(second.simulationRuntime.getNamespace()).toBe(
      'application-services-second',
    );
    expect(first.discoverRepository).not.toBe(second.discoverRepository);
    expect(first.messageRepository).not.toBe(second.messageRepository);
    expect(first.notificationRepository).not.toBe(
      second.notificationRepository,
    );

    const participantKeys = first.simulationRuntime.resetRegistry
      .list()
      .map((participant) => participant.key);
    expect(participantKeys).toEqual(
      expect.arrayContaining([
        'messages.ui-and-drafts',
        expect.stringMatching(/^profile-edit\.recovery:/),
        'onboarding.draft:account:first',
      ]),
    );
    expect(
      second.simulationRuntime.resetRegistry
        .list()
        .some((participant) => participant.key.startsWith('onboarding.draft:')),
    ).toBe(false);

    const onlineResponse = await first.discoverRepository.listPlayers(context, {
      cursor: undefined,
      facetIds: [],
      limit: 1,
      query: '',
      sort: 'best_match',
    });
    expect(onlineResponse.data.items).toHaveLength(1);

    first.simulationRuntime.setNetwork('offline');
    expect(first.messageTransport.getNetworkState?.()).toBe('offline');
    expect(second.messageTransport.getNetworkState?.()).toBe('online');
    await expect(
      first.discoverRepository.listPlayers(context, {
        cursor: undefined,
        facetIds: [],
        limit: 1,
        query: '',
        sort: 'best_match',
      }),
    ).rejects.toMatchObject({ code: 'network_error', retryable: true });
  });

  it('preserves canonical identity from Discover into Profile', async () => {
    const services = createSimulationApplicationServices({
      namespace: 'application-services-discover-profile',
    });
    const response = await services.discoverRepository.listPlayers(context, {
      cursor: undefined,
      facetIds: [],
      limit: 50,
      query: '',
      sort: 'best_match',
    });
    const discoverPlayer = response.data.items[0];
    expect(discoverPlayer).toBeDefined();
    if (!discoverPlayer) return;

    const profile = await services.profileRepository.getProfile({
      session: simulationSession(),
      userId: discoverPlayer.profileId,
    });

    expect(profile).not.toBeNull();
    expect(profile?.id).toBe(discoverPlayer.profileId);
    expect(profile?.displayName).toBe(discoverPlayer.displayName);
    expect(profile?.avatarAssetKey).toBe(
      discoverPlayer.avatar.kind === 'fixture'
        ? discoverPlayer.avatar.assetKey
        : undefined,
    );
  });

  it('shares one canonical world across Messages and Notifications', async () => {
    const services = createSimulationApplicationServices({
      namespace: 'application-services-shared-world',
    });
    const inbox = await services.messageRepository.listConversations();
    const conversation = inbox.data.items.find(
      (item) => item.id === GOLDEN_CONVERSATION_IDS.minhAnh,
    );
    expect(conversation).toBeDefined();

    const notifications = await services.notificationRepository.list({
      session: simulationSession(),
    });
    const directMessage = notifications.items.find(
      (item) =>
        item.kind === 'direct-message' &&
        item.payload.conversationId === GOLDEN_CONVERSATION_IDS.minhAnh,
    );
    expect(directMessage).toBeDefined();
    if (directMessage?.kind !== 'direct-message') return;

    expect(
      conversation?.participants.preview.some(
        (participant) => participant.id === directMessage.payload.actor.id,
      ),
    ).toBe(true);
    expect(
      services.simulationRuntime.readWorld().profiles[
        directMessage.payload.actor.id as never
      ]?.canonicalProfile.profileBasics.displayName,
    ).toBe(directMessage.payload.actor.displayName);
  });

  it('resets the mutable Message adapter through the shared lifecycle port', async () => {
    const services = createSimulationApplicationServices({
      namespace: 'application-services-reset',
    });
    services.simulationRuntime.setNetwork('offline');
    await services.messageTransport
      .sendText({
        clientCreatedAt: services.simulationRuntime.clock.now().toISOString(),
        clientMessageId: 'application-reset-message',
        conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
        text: 'Queued before reset',
      })
      .catch(() => undefined);

    expect(services.simulationRuntime.readDebugState().controller.network).toBe(
      'offline',
    );

    await services.simulationRuntime.reset();

    expect(services.messageTransport.getNetworkState?.()).toBe('online');
    expect(
      Object.values(services.simulationRuntime.readWorld().messages).some(
        (message) =>
          message.kind === 'text' && message.text === 'Queued before reset',
      ),
    ).toBe(false);
  });

  it('does not expose simulation lifecycle or silently replace API services', async () => {
    const services = createApiApplicationServices();

    expect(services.mode).toBe('api');
    expect(services.simulationRuntime).toBeNull();
    await expect(
      services.messageRepository.listConversations(),
    ).rejects.toBeInstanceOf(ApplicationServiceUnavailableError);
    await expect(
      services.notificationRepository.list({
        session: simulationSession(),
      }),
    ).rejects.toBeInstanceOf(ApplicationServiceUnavailableError);
  });
});

function simulationSession() {
  return {
    accessToken: 'token',
    expiresAt: 4_102_444_800,
    refreshToken: 'refresh',
    tokenType: 'bearer' as const,
    user: { id: 'viewer-1', user_metadata: {} },
  };
}
