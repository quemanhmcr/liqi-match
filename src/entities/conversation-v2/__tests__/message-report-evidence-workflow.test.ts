import { describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AccountIdSchema,
  CorrelationIdSchema,
  IdempotencyKeySchema,
  PlayerIdSchema,
  RequestIdSchema,
  SessionIdSchema,
} from '@/shared/contracts/core-v1';
import {
  ReportMessageCommandV2Schema,
  ReportReceiptV2Schema,
} from '@/shared/contracts/core-v2';
import type { PlayerSafetyCommandService } from '@/entities/social-relationship';

import type {
  ConversationModerationProvider,
  VerifiedConversationActorV2,
} from '../conversation-v2-provider';
import { MessageReportEvidenceWorkflow } from '../message-report-evidence-workflow';

const uuid = (suffix: number) =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const actor: VerifiedConversationActorV2 = {
  accountId: AccountIdSchema.parse(uuid(1)),
  playerId: PlayerIdSchema.parse(uuid(2)),
  lifecycleVersion: 3,
  messagingAllowed: true,
};

const session = {
  accessToken: 'access-token',
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
} satisfies AuthSession;

const command = ReportMessageCommandV2Schema.parse({
  audit: {
    clientCreatedAt: '2026-07-14T12:00:00.000Z',
    clientPlatform: 'ios',
    clientVersion: '2.0.0',
    requestId: RequestIdSchema.parse('report-message-workflow-test'),
  },
  category: 'harassment',
  conversationId: uuid(10),
  correlationId: CorrelationIdSchema.parse(uuid(11)),
  details: 'Repeated harassment in the session conversation.',
  expectedReportVersion: 0,
  idempotencyKey: IdempotencyKeySchema.parse(`report-message:${uuid(12)}`),
  messageId: uuid(13),
  targetPlayerId: PlayerIdSchema.parse(uuid(14)),
});

const reportReceipt = ReportReceiptV2Schema.parse({
  correlationId: command.correlationId,
  eventIds: [uuid(15)],
  repeated: false,
  reportId: uuid(16),
  status: 'submitted',
  version: 1,
});

function evidence() {
  return {
    evidenceId: uuid(17),
    conversationId: command.conversationId,
    message: {
      messageId: uuid(13),
      conversationId: command.conversationId,
      senderPlayerId: command.targetPlayerId,
      clientMessageId: IdempotencyKeySchema.parse(
        `reported-message:${uuid(18)}`,
      ),
      sequence: 8,
      content: { kind: 'text' as const, text: 'Reported message.' },
      createdAt: '2026-07-14T12:01:00.000Z',
      tombstonedAt: null,
    },
    reporterPlayerId: actor.playerId,
    capturedAt: '2026-07-14T12:02:00.000Z',
  } as Awaited<
    ReturnType<ConversationModerationProvider['captureReportEvidence']>
  >;
}

function harness(options?: { captureFailures?: number }) {
  let remainingFailures = options?.captureFailures ?? 0;
  const reportMessage = jest.fn(async () => reportReceipt);
  const captureReportEvidence = jest.fn(async () => {
    if (remainingFailures > 0) {
      remainingFailures -= 1;
      throw new Error('evidence transport timeout');
    }
    return evidence();
  });
  const relationshipRepository = {
    reportMessage,
  } as Pick<PlayerSafetyCommandService, 'reportMessage'>;
  const moderationProvider = {
    captureReportEvidence,
  } satisfies ConversationModerationProvider;
  return {
    captureReportEvidence,
    reportMessage,
    workflow: new MessageReportEvidenceWorkflow(
      relationshipRepository,
      moderationProvider,
    ),
  };
}

describe('MessageReportEvidenceWorkflow', () => {
  it('submits the canonical report then captures immutable evidence', async () => {
    const { captureReportEvidence, reportMessage, workflow } = harness();

    await expect(workflow.submit({ actor, command, session })).resolves.toEqual(
      {
        status: 'completed',
        reportReceipt,
        evidence: evidence(),
      },
    );
    expect(reportMessage).toHaveBeenCalledTimes(1);
    expect(reportMessage).toHaveBeenCalledWith(session, command);
    expect(captureReportEvidence).toHaveBeenCalledWith({
      actor,
      conversationId: command.conversationId,
      messageId: command.messageId,
      reportId: reportReceipt.reportId,
    });
  });

  it('returns the authoritative receipt when evidence capture times out', async () => {
    const { reportMessage, workflow } = harness({ captureFailures: 1 });

    const result = await workflow.submit({ actor, command, session });
    expect(result).toMatchObject({
      status: 'evidence_pending',
      reportReceipt,
      evidence: null,
      captureError: expect.any(Error),
    });
    expect(reportMessage).toHaveBeenCalledTimes(1);
  });

  it('retries only evidence from the receipt without submitting another report', async () => {
    const { captureReportEvidence, reportMessage, workflow } = harness({
      captureFailures: 1,
    });
    const pending = await workflow.submit({ actor, command, session });
    expect(pending.status).toBe('evidence_pending');

    await expect(
      workflow.retryEvidence({ actor, command, reportReceipt }),
    ).resolves.toEqual({
      status: 'completed',
      reportReceipt,
      evidence: evidence(),
    });
    expect(reportMessage).toHaveBeenCalledTimes(1);
    expect(captureReportEvidence).toHaveBeenCalledTimes(2);
  });

  it('does not capture evidence when the report authority rejects the command', async () => {
    const reportFailure = new Error('report rejected');
    const reportMessage = jest.fn(async () => {
      throw reportFailure;
    });
    const captureReportEvidence = jest.fn(async () => evidence());
    const workflow = new MessageReportEvidenceWorkflow(
      { reportMessage } as Pick<PlayerSafetyCommandService, 'reportMessage'>,
      { captureReportEvidence },
    );

    await expect(workflow.submit({ actor, command, session })).rejects.toBe(
      reportFailure,
    );
    expect(captureReportEvidence).not.toHaveBeenCalled();
  });
});
