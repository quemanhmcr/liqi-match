import { describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  ApiNotificationDeviceRepository,
  type NotificationDeviceApiTransport,
} from '@/app-shell/push';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
  ConversationIdSchema,
} from '@/shared/contracts/core-v1';

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4_000_000_000,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: { id: '01000000-0000-4000-8000-000000000001' },
};

function fixture<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'contracts/core-v1/fixtures/provider', name),
      'utf8',
    ),
  ) as T;
}

function authenticatedPlayerFixture() {
  const principal = AuthenticatedPrincipalV1Schema.parse(
    fixture<unknown>('authenticated-principal-valid.json'),
  );
  const lifecycle = PlayerLifecycleSnapshotV1Schema.parse({
    discoverable: true,
    messagingAllowed: true,
    playerId: principal.playerId,
    profileId: '30000000-0000-4000-8000-000000000001',
    state: 'active',
    updatedAt: '2026-07-14T08:02:00.000Z',
    version: 2,
  });
  return { lifecycle, principal };
}

function repositoryWith(responses: Record<string, unknown>) {
  const request = jest.fn<NotificationDeviceApiTransport['request']>();
  request.mockImplementation(async ({ path: rpcPath }) => {
    if (!(rpcPath in responses)) throw new Error(`Unexpected RPC ${rpcPath}`);
    return responses[rpcPath];
  });
  return {
    repository: new ApiNotificationDeviceRepository({ request }),
    request,
  };
}

describe('ApiNotificationDeviceRepository', () => {
  it('loads authoritative principal and lifecycle without client inference', async () => {
    const context = authenticatedPlayerFixture();
    const { repository, request } = repositoryWith({
      'rpc/get_authenticated_player_v1': context,
    });

    await expect(repository.getAuthenticatedPlayer(session)).resolves.toEqual(
      context,
    );
    expect(request).toHaveBeenCalledWith({
      path: 'rpc/get_authenticated_player_v1',
      session,
      signal: undefined,
    });
  });

  it('rejects a principal/lifecycle identity mismatch', async () => {
    const context = authenticatedPlayerFixture();
    const { repository } = repositoryWith({
      'rpc/get_authenticated_player_v1': {
        ...context,
        lifecycle: { ...context.lifecycle, playerId: crypto.randomUUID() },
      },
    });

    await expect(repository.getAuthenticatedPlayer(session)).rejects.toThrow(
      'Principal and lifecycle must reference the same PlayerId.',
    );
  });

  it('registers a token with named semantic device arguments', async () => {
    const response = fixture<unknown>('push-device-registration.json');
    const { repository, request } = repositoryWith({
      'rpc/register_push_device_v1': response,
    });

    await expect(
      repository.registerPushDevice({
        deviceInstallationId: 'device-installation-a',
        expoPushToken: 'ExponentPushToken[token-a]',
        platform: 'android',
        session,
      }),
    ).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith({
      body: {
        p_device_installation_id: 'device-installation-a',
        p_expo_push_token: 'ExponentPushToken[token-a]',
        p_platform: 'android',
      },
      path: 'rpc/register_push_device_v1',
      session,
      signal: undefined,
    });
  });

  it('writes exact foreground conversation presence', async () => {
    const response = fixture<unknown>('notification-presence-foreground.json');
    const conversationId = ConversationIdSchema.parse(
      '60000000-0000-4000-8000-000000000001',
    );
    const { repository, request } = repositoryWith({
      'rpc/upsert_notification_presence_v1': response,
    });

    await expect(
      repository.upsertPresence({
        activeConversationId: conversationId,
        deviceInstallationId: 'device-installation-a',
        session,
        state: 'foreground',
      }),
    ).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith({
      body: {
        p_active_conversation_id: conversationId,
        p_device_installation_id: 'device-installation-a',
        p_state: 'foreground',
      },
      path: 'rpc/upsert_notification_presence_v1',
      session,
      signal: undefined,
    });
  });

  it('requires unregister to return a boolean acknowledgement', async () => {
    const { repository } = repositoryWith({
      'rpc/unregister_push_device_v1': { deleted: true },
    });

    await expect(
      repository.unregisterPushDevice({
        deviceInstallationId: 'device-installation-a',
        session,
      }),
    ).rejects.toThrow('Invalid unregister_push_device_v1 response');
  });
});
