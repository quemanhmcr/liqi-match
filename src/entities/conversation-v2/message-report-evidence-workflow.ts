import {
  ReportMessageCommandV2Schema,
  ReportReceiptV2Schema,
  type ReportMessageCommandV2,
  type ReportReceiptV2,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';
import type { PlayerSafetyCommandService } from '@/entities/social-relationship';

import type {
  ConversationModerationProvider,
  VerifiedConversationActorV2,
} from './conversation-v2-provider';

export type MessageReportEvidence = Awaited<
  ReturnType<ConversationModerationProvider['captureReportEvidence']>
>;

export type MessageReportEvidenceResult =
  | Readonly<{
      status: 'completed';
      reportReceipt: ReportReceiptV2;
      evidence: MessageReportEvidence;
    }>
  | Readonly<{
      status: 'evidence_pending';
      reportReceipt: ReportReceiptV2;
      evidence: null;
      captureError: unknown;
    }>;

export type SubmitMessageReportEvidenceInput = Readonly<{
  actor: VerifiedConversationActorV2;
  command: ReportMessageCommandV2;
  session: AuthSession;
}>;

export type RetryMessageReportEvidenceInput = Readonly<{
  actor: VerifiedConversationActorV2;
  command: Pick<
    ReportMessageCommandV2,
    'conversationId' | 'messageId' | 'targetPlayerId'
  >;
  reportReceipt: ReportReceiptV2;
}>;

export class MessageReportEvidenceWorkflow {
  constructor(
    private readonly relationshipRepository: Pick<
      PlayerSafetyCommandService,
      'reportMessage'
    >,
    private readonly moderationProvider: ConversationModerationProvider,
  ) {}

  async submit(
    input: SubmitMessageReportEvidenceInput,
  ): Promise<MessageReportEvidenceResult> {
    const command = ReportMessageCommandV2Schema.parse(input.command);
    const reportReceipt = ReportReceiptV2Schema.parse(
      await this.relationshipRepository.reportMessage(input.session, command),
    );
    return this.capture({
      actor: input.actor,
      command,
      reportReceipt,
    });
  }

  async retryEvidence(
    input: RetryMessageReportEvidenceInput,
  ): Promise<MessageReportEvidenceResult> {
    return this.capture({
      actor: input.actor,
      command: {
        conversationId: input.command.conversationId,
        messageId: input.command.messageId,
        targetPlayerId: input.command.targetPlayerId,
      },
      reportReceipt: ReportReceiptV2Schema.parse(input.reportReceipt),
    });
  }

  private async capture(input: RetryMessageReportEvidenceInput) {
    try {
      const evidence = await this.moderationProvider.captureReportEvidence({
        actor: input.actor,
        conversationId: input.command.conversationId,
        messageId: input.command.messageId,
        reportId: input.reportReceipt.reportId,
      });
      return {
        status: 'completed',
        reportReceipt: input.reportReceipt,
        evidence,
      } as const;
    } catch (captureError) {
      return {
        status: 'evidence_pending',
        reportReceipt: input.reportReceipt,
        evidence: null,
        captureError,
      } as const;
    }
  }
}
