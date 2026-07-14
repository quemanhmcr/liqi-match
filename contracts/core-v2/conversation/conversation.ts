import { z } from 'zod';

import {
  ConversationIdSchema,
  CorrelationIdSchema,
  EventIdSchema,
  IdempotencyKeySchema,
  MatchIdSchema,
  PlayerIdSchema,
  RequestIdSchema,
  SessionIdSchema,
} from '../../core-v1/identity/semantic-ids';
import { coreV2EventSchema } from '../events/event-envelope';

export const ConversationSourceTypeV2Schema = z.enum([
  'direct_match',
  'friendship',
  'play_session',
  'system',
]);
export type ConversationSourceTypeV2 = z.infer<
  typeof ConversationSourceTypeV2Schema
>;

const SourceIdSchema = z.string().uuid();

export const ConversationSourceV2Schema = z.discriminatedUnion('sourceType', [
  z
    .object({
      sourceType: z.literal('direct_match'),
      sourceId: MatchIdSchema,
      sourceVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      sourceType: z.literal('friendship'),
      sourceId: SourceIdSchema,
      sourceVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      sourceType: z.literal('play_session'),
      sourceId: SessionIdSchema,
      sourceVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      sourceType: z.literal('system'),
      sourceId: SourceIdSchema,
      sourceVersion: z.number().int().positive(),
    })
    .strict(),
]);
export type ConversationSourceV2 = z.infer<typeof ConversationSourceV2Schema>;

export const ConversationKindV2Schema = z.enum(['direct', 'group', 'system']);
export const ConversationStateV2Schema = z.enum(['open', 'tombstoned']);
export const ConversationMemberRoleV2Schema = z.enum([
  'owner',
  'member',
  'system',
]);
export const ConversationMemberStateV2Schema = z.enum(['active', 'revoked']);
export const ConversationAccessReasonV2Schema = z.enum([
  'active_member',
  'blocked',
  'lifecycle_forbidden',
  'not_a_member',
  'source_membership_revoked',
  'conversation_tombstoned',
]);
export type ConversationAccessReasonV2 = z.infer<
  typeof ConversationAccessReasonV2Schema
>;

export const ConversationMemberV2Schema = z
  .object({
    playerId: PlayerIdSchema,
    role: ConversationMemberRoleV2Schema,
    state: ConversationMemberStateV2Schema,
    sourceVersion: z.number().int().positive(),
    version: z.number().int().positive(),
    joinedAt: z.string().datetime({ offset: true }),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
    revocationReason: ConversationAccessReasonV2Schema.nullable(),
  })
  .strict();
export type ConversationMemberV2 = z.infer<typeof ConversationMemberV2Schema>;

export const ConversationAccessV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    playerId: PlayerIdSchema,
    canRead: z.boolean(),
    canSend: z.boolean(),
    canSubscribe: z.boolean(),
    reason: ConversationAccessReasonV2Schema,
    conversationVersion: z.number().int().positive(),
    sourceVersion: z.number().int().positive(),
  })
  .strict();
export type ConversationAccessV2 = z.infer<typeof ConversationAccessV2Schema>;

export const ConversationSnapshotV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    kind: ConversationKindV2Schema,
    source: ConversationSourceV2Schema,
    state: ConversationStateV2Schema,
    title: z.string().trim().min(1).max(160).nullable(),
    version: z.number().int().positive(),
    lastSequence: z.number().int().nonnegative(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    tombstonedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type ConversationSnapshotV2 = z.infer<
  typeof ConversationSnapshotV2Schema
>;

export const MessageIdV2Schema = z.string().uuid().brand<'MessageIdV2'>();
export type MessageIdV2 = z.infer<typeof MessageIdV2Schema>;
export const MediaAssetIdV2Schema = z.string().uuid().brand<'MediaAssetIdV2'>();
export type MediaAssetIdV2 = z.infer<typeof MediaAssetIdV2Schema>;
export const MessageReportEvidenceIdV2Schema = z
  .string()
  .uuid()
  .brand<'MessageReportEvidenceIdV2'>();
export type MessageReportEvidenceIdV2 = z.infer<
  typeof MessageReportEvidenceIdV2Schema
>;

export const MessageContentV2Schema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('text'),
      text: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('media'),
      assetId: MediaAssetIdV2Schema,
      caption: z.string().trim().min(1).max(4000).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('system'),
      sourceEventId: EventIdSchema,
      sourceEventType: z.string().min(1).max(160),
      sourceEventVersion: z.number().int().positive(),
      payload: z.record(z.string(), z.unknown()),
    })
    .strict(),
]);
export type MessageContentV2 = z.infer<typeof MessageContentV2Schema>;

export const MessageV2Schema = z
  .object({
    messageId: MessageIdV2Schema,
    conversationId: ConversationIdSchema,
    senderPlayerId: PlayerIdSchema.nullable(),
    clientMessageId: IdempotencyKeySchema,
    sequence: z.number().int().positive(),
    content: MessageContentV2Schema,
    createdAt: z.string().datetime({ offset: true }),
    tombstonedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type MessageV2 = z.infer<typeof MessageV2Schema>;

export const ConversationReadCursorV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    playerId: PlayerIdSchema,
    lastReadSequence: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ConversationReadCursorV2 = z.infer<
  typeof ConversationReadCursorV2Schema
>;

export const CommandAuditMetadataV2Schema = z
  .object({
    requestId: RequestIdSchema,
    clientCreatedAt: z.string().datetime({ offset: true }),
    clientPlatform: z.enum(['android', 'ios', 'web', 'service', 'simulation']),
    clientVersion: z.string().min(1).max(80).optional(),
    installationId: z.string().uuid().optional(),
  })
  .strict();

export const CoreV2CommandMetadataSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
    causationId: EventIdSchema.nullable(),
    expectedAggregateVersion: z.number().int().nonnegative(),
    audit: CommandAuditMetadataV2Schema,
  })
  .strict();
export type CoreV2CommandMetadata = z.infer<typeof CoreV2CommandMetadataSchema>;

export const AuthoritativeConversationMemberV2Schema = z
  .object({
    playerId: PlayerIdSchema,
    role: ConversationMemberRoleV2Schema.exclude(['system']),
  })
  .strict();
export type AuthoritativeConversationMemberV2 = z.infer<
  typeof AuthoritativeConversationMemberV2Schema
>;

function authoritativeMemberListV2(minimum: number) {
  return z
    .array(AuthoritativeConversationMemberV2Schema)
    .min(minimum)
    .max(20)
    .superRefine((members, context) => {
      const seen = new Set<string>();
      members.forEach((member, index) => {
        if (seen.has(member.playerId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'conversation members must be unique',
            path: [index, 'playerId'],
          });
        }
        seen.add(member.playerId);
      });
    });
}

const ProvisioningMemberListV2Schema = authoritativeMemberListV2(2);
const ReconciliationMemberListV2Schema = authoritativeMemberListV2(0);

export const ProvisionDirectConversationCommandV2Schema = z
  .object({
    source: ConversationSourceV2Schema.refine(
      (source) =>
        source.sourceType === 'direct_match' ||
        source.sourceType === 'friendship',
      'direct conversation source must be direct_match or friendship',
    ),
    participantPlayerIds: z
      .tuple([PlayerIdSchema, PlayerIdSchema])
      .refine(
        ([left, right]) => left !== right,
        'participants must be distinct',
      ),
    metadata: CoreV2CommandMetadataSchema.refine(
      (metadata) => metadata.expectedAggregateVersion === 0,
      'create commands expect aggregate version 0',
    ),
  })
  .strict();
export type ProvisionDirectConversationCommandV2 = z.infer<
  typeof ProvisionDirectConversationCommandV2Schema
>;

export const ProvisionSessionConversationCommandV2Schema = z
  .object({
    source: ConversationSourceV2Schema.refine(
      (source) => source.sourceType === 'play_session',
      'session conversation source must be play_session',
    ),
    title: z.string().trim().min(1).max(160),
    members: ProvisioningMemberListV2Schema,
    metadata: CoreV2CommandMetadataSchema.refine(
      (metadata) => metadata.expectedAggregateVersion === 0,
      'create commands expect aggregate version 0',
    ),
  })
  .strict();
export type ProvisionSessionConversationCommandV2 = z.infer<
  typeof ProvisionSessionConversationCommandV2Schema
>;

export const SendMessageCommandV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    clientMessageId: IdempotencyKeySchema,
    text: z.string().trim().min(1).max(4000),
    metadata: CoreV2CommandMetadataSchema,
  })
  .strict();
export type SendMessageCommandV2 = z.infer<typeof SendMessageCommandV2Schema>;

export const SendMediaMessageCommandV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    clientMessageId: IdempotencyKeySchema,
    assetId: MediaAssetIdV2Schema,
    caption: z.string().trim().min(1).max(4000).optional(),
    metadata: CoreV2CommandMetadataSchema,
  })
  .strict();
export type SendMediaMessageCommandV2 = z.infer<
  typeof SendMediaMessageCommandV2Schema
>;

export const AdvanceReadCursorCommandV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    lastReadSequence: z.number().int().nonnegative(),
    metadata: CoreV2CommandMetadataSchema,
  })
  .strict();
export type AdvanceReadCursorCommandV2 = z.infer<
  typeof AdvanceReadCursorCommandV2Schema
>;

export const ConversationMuteCommandV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    metadata: CoreV2CommandMetadataSchema,
  })
  .strict();
export type ConversationMuteCommandV2 = z.infer<
  typeof ConversationMuteCommandV2Schema
>;

export const ReconcileConversationMembershipCommandV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    source: ConversationSourceV2Schema,
    members: ReconciliationMemberListV2Schema,
    revocationReason: ConversationAccessReasonV2Schema.extract([
      'blocked',
      'source_membership_revoked',
    ]),
    metadata: CoreV2CommandMetadataSchema,
  })
  .strict();
export type ReconcileConversationMembershipCommandV2 = z.infer<
  typeof ReconcileConversationMembershipCommandV2Schema
>;

export const ConversationSystemActivityInputV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    source: ConversationSourceV2Schema,
    sourceEventId: EventIdSchema,
    sourceEventType: z.string().min(1).max(160),
    sourceEventVersion: z.number().int().positive(),
    correlationId: CorrelationIdSchema,
    causationId: EventIdSchema.nullable(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ConversationSystemActivityInputV2 = z.infer<
  typeof ConversationSystemActivityInputV2Schema
>;

export const TombstoneConversationCommandV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    reason: z.enum(['source_closed', 'administrative', 'retention']),
    metadata: CoreV2CommandMetadataSchema,
  })
  .strict();
export type TombstoneConversationCommandV2 = z.infer<
  typeof TombstoneConversationCommandV2Schema
>;

export const ConversationCommandReceiptV2Schema = z
  .object({
    commandName: z.enum([
      'provision_direct_conversation_v2',
      'provision_session_conversation_v2',
      'send_message_v2',
      'send_media_message_v2',
      'advance_read_cursor_v2',
      'mute_conversation_v2',
      'unmute_conversation_v2',
      'reconcile_conversation_membership_v2',
      'tombstone_conversation_v2',
    ]),
    conversationId: ConversationIdSchema,
    actorPlayerId: PlayerIdSchema.nullable(),
    aggregateVersion: z.number().int().positive(),
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
    eventId: EventIdSchema,
    acceptedAt: z.string().datetime({ offset: true }),
    repeated: z.boolean(),
    message: MessageV2Schema.optional(),
    readCursor: ConversationReadCursorV2Schema.optional(),
  })
  .strict();
export type ConversationCommandReceiptV2 = z.infer<
  typeof ConversationCommandReceiptV2Schema
>;

const ConversationEventPayloadV2Schema = z
  .object({ conversation: ConversationSnapshotV2Schema })
  .strict();
const ConversationMemberEventPayloadV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    member: ConversationMemberV2Schema,
    source: ConversationSourceV2Schema,
  })
  .strict();

export const ConversationProvisionedEventV2Schema = coreV2EventSchema({
  aggregateType: 'conversation',
  eventType: 'conversation.provisioned.v2',
  payload: ConversationEventPayloadV2Schema,
});
export const ConversationMemberAddedEventV2Schema = coreV2EventSchema({
  aggregateType: 'conversation',
  eventType: 'conversation.member_added.v2',
  payload: ConversationMemberEventPayloadV2Schema,
});
export const ConversationMemberRemovedEventV2Schema = coreV2EventSchema({
  aggregateType: 'conversation',
  eventType: 'conversation.member_removed.v2',
  payload: ConversationMemberEventPayloadV2Schema,
});
export const MessageSentEventV2Schema = coreV2EventSchema({
  aggregateType: 'conversation',
  eventType: 'message.sent.v2',
  payload: z
    .object({
      message: MessageV2Schema,
      recipientPlayerIds: z.array(PlayerIdSchema).min(1).max(19),
    })
    .strict(),
});
export const MessageDeliveredEventV2Schema = coreV2EventSchema({
  aggregateType: 'conversation',
  eventType: 'message.delivered.v2',
  payload: z
    .object({
      messageId: MessageIdV2Schema,
      recipientPlayerId: PlayerIdSchema,
      deliveredAt: z.string().datetime({ offset: true }),
    })
    .strict(),
});
export const ConversationReadAdvancedEventV2Schema = coreV2EventSchema({
  aggregateType: 'conversation',
  eventType: 'conversation.read_advanced.v2',
  payload: z.object({ readCursor: ConversationReadCursorV2Schema }).strict(),
});
export const ConversationMutedEventV2Schema = coreV2EventSchema({
  aggregateType: 'conversation',
  eventType: 'conversation.muted.v2',
  payload: z
    .object({
      conversationId: ConversationIdSchema,
      playerId: PlayerIdSchema,
      muted: z.boolean(),
    })
    .strict(),
});
export const ConversationMembershipReconciledEventV2Schema = coreV2EventSchema({
  aggregateType: 'conversation',
  eventType: 'conversation.membership_reconciled.v2',
  payload: z
    .object({
      conversationId: ConversationIdSchema,
      source: ConversationSourceV2Schema,
      activeMemberPlayerIds: z.array(PlayerIdSchema).max(20),
    })
    .strict(),
});
export const ConversationTombstonedEventV2Schema = coreV2EventSchema({
  aggregateType: 'conversation',
  eventType: 'conversation.tombstoned.v2',
  payload: z
    .object({
      conversationId: ConversationIdSchema,
      reason: z.enum(['source_closed', 'administrative', 'retention']),
      tombstonedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
});

export const ConversationAccessRevokedEventV2Schema = coreV2EventSchema({
  aggregateType: 'conversation',
  eventType: 'conversation.access_revoked.v2',
  payload: z
    .object({
      conversationId: ConversationIdSchema,
      playerId: PlayerIdSchema,
      reason: ConversationAccessReasonV2Schema,
    })
    .strict(),
});

export const ConversationEventV2Schema = z.discriminatedUnion('eventType', [
  ConversationProvisionedEventV2Schema,
  ConversationMemberAddedEventV2Schema,
  ConversationMemberRemovedEventV2Schema,
  MessageSentEventV2Schema,
  MessageDeliveredEventV2Schema,
  ConversationReadAdvancedEventV2Schema,
  ConversationMutedEventV2Schema,
  ConversationMembershipReconciledEventV2Schema,
  ConversationTombstonedEventV2Schema,
  ConversationAccessRevokedEventV2Schema,
]);
export type ConversationEventV2 = z.infer<typeof ConversationEventV2Schema>;
