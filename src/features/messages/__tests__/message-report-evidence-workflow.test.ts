import { describe, expect, it, jest } from '@jest/globals';

import {
  MessageReportEvidenceJournal,
  MessageReportEvidenceV2Schema,
  MessageReportEvidenceWorkflow,
} from '@/features/messages/services/message-report-evidence';
import { ReportReceiptV2Schema } from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
} from '@/shared/contracts/core-v1';

const testAccountId = '01000000-0000-4000-8000-000000001600';
const testPlayerId = '20000000-0000-4000-8000-000000001601';
const testProfileId = '30000000-0000-4000-8000-000000001600';
const conversationId = '60000000-0000-4000-8000-000000001600';
const messageId = '61000000-0000-4000-8000-000000001600';
const senderPlayerId = '20000000-0000-4000-8000-000000001600';
const reportId = '44000000-0000-4000-8000-000000001600';
const now = '2026-07-14T16:00:00.000Z';

function testSession(
  input: Readonly<{
    accountId?: string;
    lifecycleState?: 'active' | 'suspended';
    playerId?: string;
    profileId?: string;
    sessionId?: string;
  }> = {},
): AuthSession {
  const accountId = input.accountId ?? testAccountId;
  const playerId = input.playerId ?? testPlayerId;
  const profileId = input.profileId ?? testProfileId;
  const lifecycleState = input.lifecycleState ?? 'active';
  const active = lifecycleState === 'active';
  return {
    accessToken: 'workflow-access-token',
    expiresAt: 4_102_444_800,
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      discoverable: active,
      messagingAllowed: active,
      playerId,
      profileId,
      state: lifecycleState,
      updatedAt: now,
      version: active ? 2 : 3,
    }),
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId,
      expiresAt: '2100-01-01T00:00:00.000Z',
      issuedAt: '2099-12-31T23:00:00.000Z',
      playerId,
      sessionId: input.sessionId ?? '09000000-0000-4000-8000-000000001600',
    }),
    refreshToken: 'workflow-refresh-token',
    tokenType: 'bearer',
    user: { id: accountId },
  };
}

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => void values.delete(key)),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    values,
  };
}

function receipt() {
  return ReportReceiptV2Schema.parse({
    correlationId: '43000000-0000-4000-8000-000000001600',
    eventIds: ['43000000-0000-4000-8000-000000001601'],
    repeated: false,
    reportId,
    status: 'submitted',
    version: 1,
  });
}

function evidence(overrides: Record<string, unknown> = {}) {
  return MessageReportEvidenceV2Schema.parse({
    capturedAt: now,
    conversationId,
    evidenceId: '45000000-0000-4000-8000-000000001600',
    message: {
      clientMessageId: 'report-evidence-client-1600',
      content: { kind: 'text', text: 'Immutable evidence text' },
      conversationId,
      createdAt: now,
      messageId,
      senderPlayerId,
      sequence: 7,
      tombstonedAt: null,
    },
    reporterPlayerId: testPlayerId,
    ...overrides,
  });
}

function workflowHarness() {
  const persistence = storage();
  const reportMessage = jest.fn(async () => receipt());
  const captureReportEvidence = jest.fn(async () => evidence());
  const journal = new MessageReportEvidenceJournal({
    now: () => new Date(now),
    storage: persistence,
  });
  return {
    captureReportEvidence,
    journal,
    persistence,
    reportMessage,
    workflow: new MessageReportEvidenceWorkflow(
      { reportMessage } as never,
      { captureReportEvidence },
      journal,
    ),
  };
}

const submitInput = {
  category: 'harassment' as const,
  conversationId,
  details: null,
  messageId,
  session: testSession(),
  targetPlayerId: senderPlayerId,
};

describe('MessageReportEvidenceWorkflow', () => {
  it('submits once, verifies immutable evidence, then clears retry state', async () => {
    const harness = workflowHarness();

    await expect(harness.workflow.submit(submitInput)).resolves.toMatchObject({
      evidence: { message: { messageId } },
      receipt: { reportId },
      status: 'completed',
    });
    expect(harness.reportMessage).toHaveBeenCalledTimes(1);
    expect(harness.captureReportEvidence).toHaveBeenCalledTimes(1);
    expect(harness.persistence.setItem).toHaveBeenCalledTimes(1);
    expect(harness.persistence.removeItem).toHaveBeenCalledTimes(1);
  });

  it('keeps the receipt after timeout and retries evidence only', async () => {
    const harness = workflowHarness();
    harness.captureReportEvidence
      .mockRejectedValueOnce(new TypeError('network timeout'))
      .mockResolvedValueOnce(evidence());

    await expect(harness.workflow.submit(submitInput)).resolves.toMatchObject({
      evidence: null,
      receipt: { reportId },
      retryStored: true,
      status: 'evidence_pending',
    });
    expect(harness.reportMessage).toHaveBeenCalledTimes(1);
    expect(harness.persistence.removeItem).not.toHaveBeenCalled();

    await expect(
      harness.workflow.resumePendingForConversation({
        conversationId,
        session: submitInput.session,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'completed',
        receipt: expect.objectContaining({ reportId }),
      }),
    ]);
    expect(harness.reportMessage).toHaveBeenCalledTimes(1);
    expect(harness.captureReportEvidence).toHaveBeenCalledTimes(2);
    expect(harness.persistence.removeItem).toHaveBeenCalledTimes(1);
  });

  it('does not turn an authoritative receipt into failure when local persistence is unavailable', async () => {
    const harness = workflowHarness();
    harness.persistence.setItem.mockRejectedValueOnce(
      new Error('local storage unavailable'),
    );

    await expect(harness.workflow.submit(submitInput)).resolves.toMatchObject({
      evidence: { evidenceId: expect.any(String) },
      receipt: { reportId },
      status: 'completed',
    });
    expect(harness.reportMessage).toHaveBeenCalledTimes(1);
    expect(harness.captureReportEvidence).toHaveBeenCalledTimes(1);
    expect(harness.persistence.removeItem).not.toHaveBeenCalled();
  });

  it('keeps completed status when local retry cleanup fails', async () => {
    const harness = workflowHarness();
    harness.persistence.removeItem.mockRejectedValueOnce(
      new Error('local cleanup unavailable'),
    );

    await expect(harness.workflow.submit(submitInput)).resolves.toMatchObject({
      evidence: { evidenceId: expect.any(String) },
      status: 'completed',
    });
    expect(harness.reportMessage).toHaveBeenCalledTimes(1);
    expect(harness.captureReportEvidence).toHaveBeenCalledTimes(1);
  });

  it('marks pending verification as non-durable when both storage and capture fail', async () => {
    const harness = workflowHarness();
    harness.persistence.setItem.mockRejectedValueOnce(
      new Error('local storage unavailable'),
    );
    harness.captureReportEvidence.mockRejectedValueOnce(
      new TypeError('network timeout'),
    );

    await expect(harness.workflow.submit(submitInput)).resolves.toMatchObject({
      evidence: null,
      receipt: { reportId },
      retryStored: false,
      status: 'evidence_pending',
    });
    expect(harness.reportMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects suspended lifecycle before submitting a report transport command', async () => {
    const harness = workflowHarness();

    await expect(
      harness.workflow.submit({
        ...submitInput,
        session: testSession({ lifecycleState: 'suspended' }),
      }),
    ).rejects.toMatchObject({
      code: 'relationship_player_not_active',
      retryable: false,
    });
    expect(harness.reportMessage).not.toHaveBeenCalled();
    expect(harness.captureReportEvidence).not.toHaveBeenCalled();
  });

  it('isolates pending retries by canonical account', async () => {
    const harness = workflowHarness();
    harness.captureReportEvidence.mockRejectedValueOnce(
      new TypeError('network timeout'),
    );
    await harness.workflow.submit(submitInput);

    const otherSession = testSession({
      accountId: '01000000-0000-4000-8000-000000001699',
      playerId: '20000000-0000-4000-8000-000000001699',
      profileId: '30000000-0000-4000-8000-000000001699',
      sessionId: '09000000-0000-4000-8000-000000001699',
    });
    await expect(
      harness.workflow.resumePendingForConversation({
        conversationId,
        session: otherSession,
      }),
    ).resolves.toEqual([]);
    expect(harness.captureReportEvidence).toHaveBeenCalledTimes(1);
  });

  it('retains retry state when provider evidence mismatches submitted facts', async () => {
    const harness = workflowHarness();
    harness.captureReportEvidence.mockResolvedValueOnce(
      evidence({
        message: {
          ...evidence().message,
          messageId: '61000000-0000-4000-8000-000000001699',
        },
      }),
    );

    await expect(harness.workflow.submit(submitInput)).resolves.toMatchObject({
      captureError: expect.objectContaining({
        code: 'report_evidence_invalid',
      }),
      status: 'evidence_pending',
    });
    expect(harness.persistence.removeItem).not.toHaveBeenCalled();
  });
});
