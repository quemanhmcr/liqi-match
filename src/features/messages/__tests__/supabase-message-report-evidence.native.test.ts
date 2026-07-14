import { describe, expect, it, jest } from '@jest/globals';

import { createSupabaseConversationAdapter } from '@/features/messages/services/supabase-conversation-adapter';
import { MessagesServiceError } from '@/features/messages/contracts/messages-contracts';
import {
  createTestAuthSession,
  testPlayerId,
} from '@/test/render-with-providers';

const session = createTestAuthSession();
const reportId = '44000000-0000-4000-8000-000000001700';
const evidence = {
  capturedAt: '2026-07-14T17:00:00.000Z',
  conversationId: '60000000-0000-4000-8000-000000001700',
  evidenceId: '45000000-0000-4000-8000-000000001700',
  message: {
    clientMessageId: 'report-evidence-client-1700',
    content: { kind: 'text', text: 'Immutable adapter evidence' },
    conversationId: '60000000-0000-4000-8000-000000001700',
    createdAt: '2026-07-14T16:59:00.000Z',
    messageId: '61000000-0000-4000-8000-000000001700',
    senderPlayerId: '20000000-0000-4000-8000-000000001700',
    sequence: 3,
    tombstonedAt: null,
  },
  reporterPlayerId: testPlayerId,
};

function adapterWithResponse(response: unknown) {
  const request = jest.fn(async () => response);
  const adapter = createSupabaseConversationAdapter({
    accessTokenProvider: jest.fn(async () => 'fresh-access-token'),
    accessTokenSubscriber: jest.fn(() => () => undefined),
    realtimeClient: {
      channel: jest.fn(),
      removeChannel: jest.fn(async () => 'ok'),
      realtime: { setAuth: jest.fn(async () => undefined) },
    } as never,
    request: request as never,
  });
  return { adapter, request };
}

describe('Supabase message report evidence provider', () => {
  it('uses a refreshed token and parses the exact immutable evidence contract', async () => {
    const { adapter, request } = adapterWithResponse(evidence);
    await adapter.setSession(session);

    await expect(
      adapter.captureReportEvidence({ reportId, session }),
    ).resolves.toEqual(evidence);
    expect(request).toHaveBeenCalledWith({
      body: { p_report_id: reportId },
      functionName: 'capture_message_report_evidence_v2',
      session: expect.objectContaining({ accessToken: 'fresh-access-token' }),
    });
    await adapter.dispose();
  });

  it('rejects evidence capture when the caller session no longer matches the active account', async () => {
    const { adapter, request } = adapterWithResponse(evidence);
    await adapter.setSession(session);
    const staleSession = createTestAuthSession({
      accountId: '01000000-0000-4000-8000-000000001799',
      playerId: '20000000-0000-4000-8000-000000001799',
      profileId: '30000000-0000-4000-8000-000000001799',
      sessionId: '09000000-0000-4000-8000-000000001799',
    });

    await expect(
      adapter.captureReportEvidence({ reportId, session: staleSession }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(request).not.toHaveBeenCalled();
    await adapter.dispose();
  });

  it('fails closed when the RPC returns a malformed snapshot', async () => {
    const { adapter } = adapterWithResponse({
      ...evidence,
      reporterPlayerId: null,
    });
    await adapter.setSession(session);

    await expect(
      adapter.captureReportEvidence({ reportId, session }),
    ).rejects.toBeInstanceOf(MessagesServiceError);
    await expect(
      adapter.captureReportEvidence({ reportId, session }),
    ).rejects.toMatchObject({ code: 'contract_violation' });
    await adapter.dispose();
  });
});
