import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import {
  emitSocialTelemetry,
  socialTelemetryErrorAttributes,
  type SocialCommandCoordinator,
} from '@/entities/social-relationship';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AccountIdSchema,
  ConversationIdSchema,
  MessageIdSchema,
  MessageV1Schema,
  PlayerIdSchema,
} from '@/shared/contracts/core-v1';
import {
  ReportIdV2Schema,
  ReportReceiptV2Schema,
  type ReportCategoryV2,
  type ReportReceiptV2,
} from '@/shared/contracts/core-v2';

const MessageReportEvidenceMessageV2Schema = MessageV1Schema.extend({
  tombstonedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const MessageReportEvidenceV2Schema = z
  .object({
    capturedAt: z.string().datetime({ offset: true }),
    conversationId: ConversationIdSchema,
    evidenceId: z.string().uuid(),
    message: MessageReportEvidenceMessageV2Schema,
    reporterPlayerId: PlayerIdSchema,
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.message.conversationId !== evidence.conversationId) {
      context.addIssue({
        code: 'custom',
        message:
          'Evidence conversation must match the immutable message snapshot.',
        path: ['message', 'conversationId'],
      });
    }
  });

export type MessageReportEvidenceV2 = z.infer<
  typeof MessageReportEvidenceV2Schema
>;

export interface MessageReportEvidenceProvider {
  captureReportEvidence(
    input: Readonly<{
      reportId: string;
      session: AuthSession;
    }>,
  ): Promise<MessageReportEvidenceV2>;
}

const PendingMessageReportEvidenceV2Schema = z
  .object({
    accountId: AccountIdSchema,
    conversationId: ConversationIdSchema,
    createdAt: z.string().datetime({ offset: true }),
    messageId: MessageIdSchema,
    receipt: ReportReceiptV2Schema,
    reporterPlayerId: PlayerIdSchema,
    targetPlayerId: PlayerIdSchema,
    version: z.literal(1),
  })
  .strict();

export type PendingMessageReportEvidenceV2 = z.infer<
  typeof PendingMessageReportEvidenceV2Schema
>;

const PendingMessageReportEvidenceStoreV2Schema = z
  .object({
    entries: z.array(PendingMessageReportEvidenceV2Schema).max(100),
    version: z.literal(1),
  })
  .strict();

type StoragePort = Pick<
  typeof AsyncStorage,
  'getItem' | 'removeItem' | 'setItem'
>;

type MessageReportEvidenceJournalOptions = Readonly<{
  now?: () => Date;
  storage?: StoragePort;
}>;

const pendingEvidenceNamespace = '@liqi-match/message-report-evidence-v2';

export class MessageReportEvidenceJournal {
  private readonly now: () => Date;
  private readonly storage: StoragePort;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(options: MessageReportEvidenceJournalOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.storage = options.storage ?? AsyncStorage;
  }

  remember(
    input: Readonly<{
      accountId: string;
      conversationId: string;
      messageId: string;
      receipt: ReportReceiptV2;
      reporterPlayerId: string;
      targetPlayerId: string;
    }>,
  ) {
    return this.serialized(async () => {
      const accountId = AccountIdSchema.parse(input.accountId);
      const store = await this.read(accountId);
      const entry = PendingMessageReportEvidenceV2Schema.parse({
        accountId,
        conversationId: input.conversationId,
        createdAt: this.now().toISOString(),
        messageId: input.messageId,
        receipt: input.receipt,
        reporterPlayerId: input.reporterPlayerId,
        targetPlayerId: input.targetPlayerId,
        version: 1,
      });
      const entries = [
        entry,
        ...store.entries.filter(
          (candidate) => candidate.receipt.reportId !== entry.receipt.reportId,
        ),
      ].slice(0, 100);
      await this.write(accountId, entries);
      return entry;
    });
  }

  listForConversation(accountIdInput: string, conversationIdInput: string) {
    return this.serialized(async () => {
      const accountId = AccountIdSchema.parse(accountIdInput);
      const conversationId = ConversationIdSchema.parse(conversationIdInput);
      const store = await this.read(accountId);
      return store.entries.filter(
        (entry) => entry.conversationId === conversationId,
      );
    });
  }

  remove(accountIdInput: string, reportIdInput: string) {
    return this.serialized(async () => {
      const accountId = AccountIdSchema.parse(accountIdInput);
      const reportId = ReportIdV2Schema.parse(reportIdInput);
      const store = await this.read(accountId);
      const entries = store.entries.filter(
        (entry) => entry.receipt.reportId !== reportId,
      );
      if (entries.length === 0) {
        await this.storage.removeItem(storageKey(accountId));
        return;
      }
      await this.write(accountId, entries);
    });
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async read(accountId: string) {
    const key = storageKey(accountId);
    const raw = await this.storage.getItem(key);
    if (!raw) return { entries: [], version: 1 } as const;
    try {
      const parsed = PendingMessageReportEvidenceStoreV2Schema.safeParse(
        JSON.parse(raw),
      );
      if (parsed.success) return parsed.data;
    } catch {
      // Corrupt local retry state is discarded. The database snapshot remains
      // authoritative because it is captured in the report transaction.
    }
    await this.storage.removeItem(key);
    return { entries: [], version: 1 } as const;
  }

  private write(
    accountId: string,
    entries: readonly PendingMessageReportEvidenceV2[],
  ) {
    return this.storage.setItem(
      storageKey(accountId),
      JSON.stringify(
        PendingMessageReportEvidenceStoreV2Schema.parse({
          entries,
          version: 1,
        }),
      ),
    );
  }
}

export type MessageReportEvidenceResultV2 =
  | Readonly<{
      evidence: MessageReportEvidenceV2;
      receipt: ReportReceiptV2;
      status: 'completed';
    }>
  | Readonly<{
      captureError: unknown;
      evidence: null;
      receipt: ReportReceiptV2;
      retryStored: boolean;
      status: 'evidence_pending';
    }>;

const sharedMessageReportEvidenceJournal = new MessageReportEvidenceJournal();

export class MessageReportEvidenceWorkflow {
  constructor(
    private readonly coordinator: Pick<
      SocialCommandCoordinator,
      'reportMessage'
    >,
    private readonly provider: MessageReportEvidenceProvider,
    private readonly journal = sharedMessageReportEvidenceJournal,
  ) {}

  async submit(
    input: Readonly<{
      category: ReportCategoryV2;
      conversationId: string;
      details: string | null;
      messageId: string;
      session: AuthSession;
      targetPlayerId: string;
    }>,
  ): Promise<MessageReportEvidenceResultV2> {
    const canonical = canonicalInput(input);
    const accountId = canonicalAccountId(input.session);
    const reporterPlayerId = canonicalReporterPlayerId(input.session);
    const receipt = ReportReceiptV2Schema.parse(
      await this.coordinator.reportMessage(canonical),
    );
    const pendingInput = {
      accountId,
      conversationId: canonical.conversationId,
      messageId: canonical.messageId,
      receipt,
      reporterPlayerId,
      targetPlayerId: canonical.targetPlayerId,
    };
    try {
      const pending = await this.journal.remember(pendingInput);
      return this.capture({
        pending,
        retry: false,
        retryStored: true,
        session: input.session,
      });
    } catch (error) {
      emitSocialTelemetry('social.report_evidence.persistence_failed', {
        correlationId: receipt.correlationId,
        operation: 'report_message',
        ...socialTelemetryErrorAttributes(error),
      });
      // The authoritative report receipt must never be presented as a failed
      // report merely because local retry persistence is unavailable. The
      // database trigger already captured the immutable snapshot transactionally.
      const pending = PendingMessageReportEvidenceV2Schema.parse({
        ...pendingInput,
        createdAt: new Date().toISOString(),
        version: 1,
      });
      return this.capture({
        pending,
        retry: false,
        retryStored: false,
        session: input.session,
      });
    }
  }

  async resumePendingForConversation(
    input: Readonly<{
      conversationId: string;
      session: AuthSession;
    }>,
  ) {
    const accountId = canonicalAccountId(input.session);
    const pendingEntries = await this.journal.listForConversation(
      accountId,
      input.conversationId,
    );
    const results: MessageReportEvidenceResultV2[] = [];
    for (const pending of pendingEntries) {
      results.push(
        await this.capture({
          pending,
          retry: true,
          retryStored: true,
          session: input.session,
        }),
      );
    }
    return results;
  }

  private async capture(
    input: Readonly<{
      pending: PendingMessageReportEvidenceV2;
      retry: boolean;
      retryStored: boolean;
      session: AuthSession;
    }>,
  ): Promise<MessageReportEvidenceResultV2> {
    try {
      const evidence = MessageReportEvidenceV2Schema.parse(
        await this.provider.captureReportEvidence({
          reportId: input.pending.receipt.reportId,
          session: input.session,
        }),
      );
      assertEvidenceMatchesPending(evidence, input.pending);
      if (input.retryStored) {
        try {
          await this.journal.remove(
            input.pending.accountId,
            input.pending.receipt.reportId,
          );
        } catch {
          // Evidence is already authoritative and idempotent. A stale local
          // retry entry may be cleaned by a later successful replay.
        }
      }
      emitSocialTelemetry('social.report_evidence.completed', {
        correlationId: input.pending.receipt.correlationId,
        operation: 'report_message',
        repeated: input.pending.receipt.repeated,
        retry: input.retry,
        retryStored: input.retryStored,
      });
      return {
        evidence,
        receipt: input.pending.receipt,
        status: 'completed',
      };
    } catch (captureError) {
      emitSocialTelemetry('social.report_evidence.pending', {
        correlationId: input.pending.receipt.correlationId,
        operation: 'report_message',
        repeated: input.pending.receipt.repeated,
        retry: input.retry,
        retryStored: input.retryStored,
        ...socialTelemetryErrorAttributes(captureError),
      });
      return {
        captureError,
        evidence: null,
        receipt: input.pending.receipt,
        retryStored: input.retryStored,
        status: 'evidence_pending',
      };
    }
  }
}

function canonicalInput(
  input: Readonly<{
    category: ReportCategoryV2;
    conversationId: string;
    details: string | null;
    messageId: string;
    session: AuthSession;
    targetPlayerId: string;
  }>,
) {
  return {
    category: input.category,
    conversationId: ConversationIdSchema.parse(input.conversationId),
    details: input.details,
    messageId: MessageIdSchema.parse(input.messageId),
    session: input.session,
    targetPlayerId: PlayerIdSchema.parse(input.targetPlayerId),
  };
}

function canonicalAccountId(session: AuthSession) {
  const accountId = session.principal?.accountId;
  if (!accountId || accountId !== session.user.id) {
    throw Object.assign(
      new Error('Session does not contain a canonical account identity.'),
      { code: 'relationship_identity_mismatch', retryable: false },
    );
  }
  return AccountIdSchema.parse(accountId);
}

function canonicalReporterPlayerId(session: AuthSession) {
  const playerId = session.principal?.playerId;
  if (
    !playerId ||
    !session.lifecycle ||
    session.lifecycle.playerId !== playerId
  ) {
    throw Object.assign(
      new Error('Session does not contain a canonical player identity.'),
      { code: 'relationship_identity_mismatch', retryable: false },
    );
  }
  if (session.lifecycle.state !== 'active') {
    throw Object.assign(
      new Error('Player lifecycle does not allow report submission.'),
      { code: 'relationship_player_not_active', retryable: false },
    );
  }
  return PlayerIdSchema.parse(playerId);
}

function assertEvidenceMatchesPending(
  evidence: MessageReportEvidenceV2,
  pending: PendingMessageReportEvidenceV2,
) {
  const mismatch =
    evidence.conversationId !== pending.conversationId ||
    evidence.message.messageId !== pending.messageId ||
    evidence.message.senderPlayerId !== pending.targetPlayerId ||
    evidence.reporterPlayerId !== pending.reporterPlayerId;
  if (mismatch) {
    throw Object.assign(
      new Error(
        'Captured report evidence does not match the submitted report.',
      ),
      { code: 'report_evidence_invalid', retryable: false },
    );
  }
}

function storageKey(accountId: string) {
  return `${pendingEvidenceNamespace}:${accountId}`;
}
