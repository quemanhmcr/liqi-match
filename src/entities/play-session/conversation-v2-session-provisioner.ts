import {
  ConversationCommandReceiptV2Schema,
  type CoreV2CommandMetadata,
} from '@/shared/contracts/core-v2';
import { ConversationIdSchema } from '@/shared/contracts/core-v1';
import type {
  ConversationMembershipProjection,
  ConversationProvisioningService,
} from '@/entities/conversation-v2';

import type {
  SessionConversationProvisioner,
  SessionConversationProvisioningReceipt,
  SessionConversationSyncInput,
} from './play-session-repository';

type ConversationSessionAuthority = ConversationProvisioningService &
  ConversationMembershipProjection;

type ParsedSessionConversationReceipt = Readonly<{
  conversationVersion: number;
  receipt: SessionConversationProvisioningReceipt;
}>;

export function createConversationV2SessionProvisioner(input: {
  authority: ConversationSessionAuthority;
  clock?: () => Date;
}): SessionConversationProvisioner {
  const clock = input.clock ?? (() => new Date());
  const metadataByKey = new Map<string, CoreV2CommandMetadata>();
  const conversationVersionById = new Map<string, number>();

  const metadata = (
    key: string,
    correlationId: string,
    expectedAggregateVersion: number,
  ): CoreV2CommandMetadata => {
    const existing = metadataByKey.get(key);
    if (existing) return existing;
    const value: CoreV2CommandMetadata = {
      audit: {
        clientCreatedAt: clock().toISOString(),
        clientPlatform: 'simulation',
        clientVersion: 'core-v2',
        requestId: correlationId as never,
      },
      causationId: null,
      correlationId: correlationId as never,
      expectedAggregateVersion,
      idempotencyKey: key as never,
    };
    metadataByKey.set(key, value);
    return value;
  };

  const parseReceipt = (raw: unknown): ParsedSessionConversationReceipt => {
    const parsed = ConversationCommandReceiptV2Schema.parse(raw);
    if (
      !parsed.acceptedMembership ||
      parsed.acceptedSourceAggregateVersion === undefined
    ) {
      throw new Error(
        'Conversation authority omitted accepted Session membership facts.',
      );
    }
    return {
      conversationVersion: parsed.aggregateVersion,
      receipt: {
        conversationId: ConversationIdSchema.parse(parsed.conversationId),
        membership: parsed.acceptedMembership,
        sourceAggregateVersion: parsed.acceptedSourceAggregateVersion,
      },
    };
  };

  const source = (sync: SessionConversationSyncInput) => ({
    sourceAggregateVersion: sync.sourceAggregateVersion,
    sourceId: sync.membership.sessionId,
    sourceType: 'play_session' as const,
  });

  return {
    async provision(sync) {
      const key = `session.conversation.provision.${sync.membership.sessionId}.${sync.membership.membershipVersion}.${sync.sourceAggregateVersion}`;
      const parsed = parseReceipt(
        await input.authority.provisionSession(null, {
          membership: sync.membership,
          metadata: metadata(key, sync.correlationId, 0),
          source: source(sync),
          title: sync.title,
        }),
      );
      conversationVersionById.set(
        parsed.receipt.conversationId,
        parsed.conversationVersion,
      );
      return parsed.receipt;
    },
    async reconcile(sync) {
      const currentVersion = conversationVersionById.get(sync.conversationId);
      if (currentVersion === undefined) {
        throw new Error(
          'Conversation projection version is unavailable for reconciliation.',
        );
      }
      const key = `session.conversation.reconcile.${sync.membership.sessionId}.${sync.membership.membershipVersion}.${sync.sourceAggregateVersion}`;
      const parsed = parseReceipt(
        await input.authority.reconcile(null, {
          conversationId: sync.conversationId,
          membership: sync.membership,
          metadata: metadata(key, sync.correlationId, currentVersion),
          revocationReason: 'source_membership_revoked',
          source: source(sync),
        }),
      );
      conversationVersionById.set(
        parsed.receipt.conversationId,
        parsed.conversationVersion,
      );
      return parsed.receipt;
    },
  };
}
