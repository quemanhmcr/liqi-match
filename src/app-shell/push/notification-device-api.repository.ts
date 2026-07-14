import { z } from 'zod';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
  NotificationPresenceV1Schema,
  PushDeviceRegistrationV1Schema,
  type AuthenticatedPrincipalV1,
  type ConversationId,
  type NotificationPresenceV1,
  type PlayerLifecycleSnapshotV1,
  type PushDeviceRegistrationV1,
} from '@/shared/contracts/core-v1';
import { supabaseRest } from '@/shared/services/supabase-rest';

export type PushDevicePlatform = 'android' | 'ios';

export type AuthenticatedPlayerContextV1 = Readonly<{
  lifecycle: PlayerLifecycleSnapshotV1 | null;
  principal: AuthenticatedPrincipalV1;
}>;

const authenticatedPlayerContextV1Schema = z
  .object({
    lifecycle: PlayerLifecycleSnapshotV1Schema.nullable(),
    principal: AuthenticatedPrincipalV1Schema,
  })
  .strict()
  .superRefine((context, refinement) => {
    if (
      context.principal.playerId &&
      context.lifecycle &&
      context.principal.playerId !== context.lifecycle.playerId
    ) {
      refinement.addIssue({
        code: 'custom',
        message: 'Principal and lifecycle must reference the same PlayerId.',
        path: ['lifecycle', 'playerId'],
      });
    }
  });

export type NotificationDeviceApiRequest = Readonly<{
  body?: Readonly<Record<string, unknown>>;
  path: string;
  session: AuthSession;
  signal?: AbortSignal;
}>;

export interface NotificationDeviceApiTransport {
  request(request: NotificationDeviceApiRequest): Promise<unknown>;
}

export interface NotificationDeviceApiRepository {
  getAuthenticatedPlayer(
    session: AuthSession,
    signal?: AbortSignal,
  ): Promise<AuthenticatedPlayerContextV1>;
  registerPushDevice(
    input: Readonly<{
      deviceInstallationId: string;
      expoPushToken: string;
      platform: PushDevicePlatform;
      session: AuthSession;
      signal?: AbortSignal;
    }>,
  ): Promise<PushDeviceRegistrationV1>;
  unregisterPushDevice(
    input: Readonly<{
      deviceInstallationId: string;
      session: AuthSession;
      signal?: AbortSignal;
    }>,
  ): Promise<boolean>;
  upsertPresence(
    input: Readonly<{
      activeConversationId: ConversationId | null;
      deviceInstallationId: string;
      session: AuthSession;
      signal?: AbortSignal;
      state: 'foreground' | 'background';
    }>,
  ): Promise<NotificationPresenceV1>;
}

export class ApiNotificationDeviceRepository implements NotificationDeviceApiRepository {
  constructor(
    private readonly transport: NotificationDeviceApiTransport = createNotificationDeviceSupabaseTransport(),
  ) {}

  async getAuthenticatedPlayer(session: AuthSession, signal?: AbortSignal) {
    return authenticatedPlayerContextV1Schema.parse(
      await this.transport.request({
        path: 'rpc/get_authenticated_player_v1',
        session,
        signal,
      }),
    );
  }

  async registerPushDevice(input: {
    deviceInstallationId: string;
    expoPushToken: string;
    platform: PushDevicePlatform;
    session: AuthSession;
    signal?: AbortSignal;
  }) {
    return PushDeviceRegistrationV1Schema.parse(
      await this.transport.request({
        body: {
          p_device_installation_id: input.deviceInstallationId,
          p_expo_push_token: input.expoPushToken,
          p_platform: input.platform,
        },
        path: 'rpc/register_push_device_v1',
        session: input.session,
        signal: input.signal,
      }),
    );
  }

  async unregisterPushDevice(input: {
    deviceInstallationId: string;
    session: AuthSession;
    signal?: AbortSignal;
  }) {
    const response = await this.transport.request({
      body: { p_device_installation_id: input.deviceInstallationId },
      path: 'rpc/unregister_push_device_v1',
      session: input.session,
      signal: input.signal,
    });
    if (typeof response !== 'boolean') {
      throw new Error('Invalid unregister_push_device_v1 response.');
    }
    return response;
  }

  async upsertPresence(input: {
    activeConversationId: ConversationId | null;
    deviceInstallationId: string;
    session: AuthSession;
    signal?: AbortSignal;
    state: 'foreground' | 'background';
  }) {
    return NotificationPresenceV1Schema.parse(
      await this.transport.request({
        body: {
          p_active_conversation_id: input.activeConversationId,
          p_device_installation_id: input.deviceInstallationId,
          p_state: input.state,
        },
        path: 'rpc/upsert_notification_presence_v1',
        session: input.session,
        signal: input.signal,
      }),
    );
  }
}

export function createNotificationDeviceSupabaseTransport(): NotificationDeviceApiTransport {
  return {
    request: ({ body, path, session, signal }) =>
      supabaseRest<unknown>(path, {
        ...(body ? { body } : {}),
        method: 'POST',
        session,
        signal,
      }),
  };
}
