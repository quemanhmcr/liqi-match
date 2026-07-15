import { describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AccountIdSchema,
  PlayerIdSchema,
  SessionIdSchema,
} from '@/shared/contracts/core-v1';
import type { VerifiedConversationActorV2 } from '@/entities/conversation-v2';

import {
  createSupabaseConversationAdapter,
  type RpcRequest,
} from '../services/supabase-conversation-adapter';

const uuid = (suffix: number) =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const actor: VerifiedConversationActorV2 = {
  accountId: AccountIdSchema.parse(uuid(1)),
  playerId: PlayerIdSchema.parse(uuid(2)),
  lifecycleVersion: 3,
  messagingAllowed: true,
};

const session: AuthSession = {
  accessToken: 'stale-token',
  expiresAt: 4_102_444_800,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: { id: actor.accountId },
  principal: {
    accountId: actor.accountId,
    playerId: actor.playerId,
    sessionId: SessionIdSchema.parse(uuid(3)),
    issuedAt: '2026-07-14T12:00:00.000Z',
    expiresAt: '2099-12-31T00:00:00.000Z',
  },
};

const evidence = {
  evidenceId: uuid(10),
  conversationId: uuid(11),
  message: {
    messageId: uuid(12),
    conversationId: uuid(11),
    senderPlayerId: uuid(13),
    clientMessageId: `reported-message:${uuid(14)}`,
    sequence: 9,
    content: { kind: 'text', text: 'Immutable reported message.' },
    createdAt: '2026-07-14T12:01:00.000Z',
    tombstonedAt: null,
  },
  reporterPlayerId: actor.playerId,
  capturedAt: '2026-07-14T12:02:00.000Z',
};

describe('Supabase Conversation V2 report evidence', () => {
  it('uses the refreshed session and parses the exact immutable evidence contract', async () => {
    const request = jest.fn(async <T>() => evidence as T) as RpcRequest;
    const adapter = createSupabaseConversationAdapter({
      accessTokenProvider: jest.fn(async () => 'refreshed-token'),
      accessTokenSubscriber: jest.fn(() => () => undefined),
      realtimeClient: {
        channel: jest.fn(),
        removeChannel: jest.fn(async () => 'ok'),
        realtime: { setAuth: jest.fn(async () => undefined) },
      } as never,
      request,
    });
    await adapter.setSession(session);

    await expect(
      adapter.captureReportEvidence({
        actor,
        conversationId: evidence.conversationId,
        messageId: evidence.message.messageId,
        reportId: uuid(15),
      }),
    ).resolves.toEqual(evidence);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { p_report_id: uuid(15) },
        functionName: 'capture_message_report_evidence_v2',
        session: expect.objectContaining({ accessToken: 'refreshed-token' }),
      }),
    );
    await adapter.dispose();
  });
});
