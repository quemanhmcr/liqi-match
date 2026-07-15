import { z } from 'zod';

import {
  PlaySessionIdSchema,
  PlaySessionInviteProjectionV2Schema,
  PlaySessionSnapshotV2Schema,
} from '@/shared/contracts/core-v2';

import type {
  PlaySessionActorContext,
  PlaySessionRepository,
} from './play-session-repository';
import {
  CoreV2RpcError,
  type CoreV2AccessTokenProvider,
  type CoreV2RpcTransport,
} from './supabase-play-session-command-service';

const SessionListSchema = z.array(PlaySessionSnapshotV2Schema).max(50);
const SessionInviteListSchema = z
  .array(PlaySessionInviteProjectionV2Schema)
  .max(50);

export function createSupabasePlaySessionRepository(input: {
  accessTokenProvider: CoreV2AccessTokenProvider;
  transport: CoreV2RpcTransport;
}): PlaySessionRepository {
  const invoke = async (rpcName: string, args: Record<string, unknown>) => {
    const accessToken = await input.accessTokenProvider.getAccessToken();
    if (!accessToken) {
      throw new CoreV2RpcError({
        code: 'unauthenticated',
        message: 'A valid Supabase access token is required.',
      });
    }
    return await input.transport.invoke({ accessToken, args, rpcName });
  };

  return {
    async get(_actor: PlaySessionActorContext, sessionId) {
      return PlaySessionSnapshotV2Schema.parse(
        await invoke('get_play_session_v2', {
          p_session_id: PlaySessionIdSchema.parse(sessionId),
        }),
      );
    },
    async listCurrent(_actor: PlaySessionActorContext) {
      return SessionListSchema.parse(
        await invoke('list_current_play_sessions_v2', { p_limit: 20 }),
      );
    },
    async listInvites(_actor: PlaySessionActorContext, limit = 20) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new CoreV2RpcError({
          code: 'validation_failed',
          message: 'Session invite list limit must be between 1 and 50.',
        });
      }
      return SessionInviteListSchema.parse(
        await invoke('list_my_session_invites_v2', { p_limit: limit }),
      );
    },
  };
}
