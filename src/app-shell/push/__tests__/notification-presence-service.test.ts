import { describe, expect, it, jest } from '@jest/globals';

import {
  NotificationPresenceService,
  type NotificationDeviceApiRepository,
} from '@/app-shell/push';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  ConversationIdSchema,
  NotificationPresenceV1Schema,
  PlayerIdSchema,
} from '@/shared/contracts/core-v1';

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4_000_000_000,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: { id: '01000000-0000-4000-8000-000000000001' },
};

function api() {
  const upsertPresence = jest.fn<
    NotificationDeviceApiRepository['upsertPresence']
  >(async ({ activeConversationId, deviceInstallationId, state }) =>
    NotificationPresenceV1Schema.parse({
      activeConversationId,
      deviceInstallationId,
      expiresAt: '2026-07-14T08:01:30.000Z',
      playerId: PlayerIdSchema.parse('20000000-0000-4000-8000-000000000001'),
      state,
    }),
  );
  const repository: NotificationDeviceApiRepository = {
    getAuthenticatedPlayer:
      jest.fn<NotificationDeviceApiRepository['getAuthenticatedPlayer']>(),
    registerPushDevice:
      jest.fn<NotificationDeviceApiRepository['registerPushDevice']>(),
    unregisterPushDevice:
      jest.fn<NotificationDeviceApiRepository['unregisterPushDevice']>(),
    upsertPresence,
  };
  return repository;
}

describe('NotificationPresenceService', () => {
  it('heartbeats the exact active ConversationId in foreground', async () => {
    const repository = api();
    const service = new NotificationPresenceService(repository);
    const conversationId = ConversationIdSchema.parse(
      '60000000-0000-4000-8000-000000000001',
    );

    await service.foreground({
      activeConversationId: conversationId,
      deviceInstallationId: 'installation-a',
      session,
    });

    expect(repository.upsertPresence).toHaveBeenCalledWith({
      activeConversationId: conversationId,
      deviceInstallationId: 'installation-a',
      session,
      signal: undefined,
      state: 'foreground',
    });
  });

  it('clears conversation presence on background', async () => {
    const repository = api();
    const service = new NotificationPresenceService(repository);

    await service.background({
      deviceInstallationId: 'installation-a',
      session,
    });

    expect(repository.upsertPresence).toHaveBeenCalledWith({
      activeConversationId: null,
      deviceInstallationId: 'installation-a',
      session,
      signal: undefined,
      state: 'background',
    });
  });
});
