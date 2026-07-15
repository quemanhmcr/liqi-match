import { z } from 'zod';

import {
  ConversationIdSchema,
  CorrelationIdSchema,
  EventIdSchema,
  IdempotencyKeySchema,
  MatchIdSchema,
  PlayerIdSchema,
  RequestIdSchema,
} from '../../core-v1/identity/semantic-ids';
import { coreV2EventSchema } from '../events/event-envelope';
import {
  FriendshipAcceptedEventV2Schema,
  PlayerBlockedEventV2Schema,
  PlayerMutedEventV2Schema,
  PlayerUnblockedEventV2Schema,
  PlayerUnmutedEventV2Schema,
} from '../events/social-events';
import { PlaySessionIdSchema } from '../identity/semantic-ids';
import { PlaySessionMembershipProjectionV2Schema } from '../party/play-session';
import { SocialRelationshipSnapshotV2Schema } from '../social/relationship';

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
      sourceAggregateVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      sourceType: z.literal('friendship'),
      sourceId: SourceIdSchema,
      sourceAggregateVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      sourceType: z.literal('play_session'),
      sourceId: PlaySessionIdSchema,
      sourceAggregateVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      sourceType: z.literal('system'),
      sourceId: SourceIdSchema,
      sourceAggregateVersion: z.number().int().positive(),
    })
    .strict(),
]);
export type ConversationSourceV2 = z.infer<typeof ConversationSourceV2Schema>;

export const ConversationSourceBindingV2Schema = z
  .object({
    conversationId: ConversationIdSchema,
    source: ConversationSourceV2Schema,
    boundAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ConversationSourceBindingV2 = z.infer<
  typeof ConversationSourceBindingV2Schema
>;

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
    canMessage: z.boolean(),
    canViewConversation: z.boolean(),
    playerId: PlayerIdSchema,
    role: ConversationMemberRoleV2Schema,
    state: ConversationMemberStateV2Schema,
    membershipVersion: z.number().int().positive(),
    version: z.number().int().positive(),
    joinedAt: z.string().datetime({ offset: true }),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
    revocationReason: ConversationAccessReasonV2Schema.nullable(),
  })
  .strict()
  .superRefine((member, context) => {
    if (member.canMessage && !member.canViewConversation) {
      context.addIssue({
        code: 'custom',
        message: 'Sending requires conversation visibility.',
        path: ['canMessage'],
      });
    }
    if (
      member.state === 'revoked' &&
      (member.canMessage || member.canViewConversation)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Revoked membership cannot retain communication capabilities.',
        path: ['state'],
      });
    }
  });
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
    sourceAggregateVersion: z.number().int().positive(),
    membershipVersion: z.number().int().positive(),
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

export const MessageReportEvidenceV2Schema = z
  .object({
    evidenceId: MessageReportEvidenceIdV2Schema,
    conversationId: ConversationIdSchema,
    message: MessageV2Schema,
    reporterPlayerId: PlayerIdSchema,
    capturedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type MessageReportEvidenceV2 = z.infer<
  typeof MessageReportEvidenceV2Schema
>;

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
    membership: PlaySessionMembershipProjectionV2Schema,
    metadata: CoreV2CommandMetadataSchema.refine(
      (metadata) => metadata.expectedAggregateVersion === 0,
      'create commands expect aggregate version 0',
    ),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.membership.sessionId !== command.source.sourceId) {
      context.addIssue({
        code: 'custom',
        message: 'Session membership must belong to the conversation source.',
        path: ['membership', 'sessionId'],
      });
    }
    if (command.membership.members.length < 2) {
      context.addIssue({
        code: 'custom',
        message:
          'Session conversation provisioning requires at least two members.',
        path: ['membership', 'members'],
      });
    }
  });
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
    source: ConversationSourceV2Schema.refine(
      (source) => source.sourceType === 'play_session',
      'membership reconciliation requires a play_session source',
    ),
    membership: PlaySessionMembershipProjectionV2Schema,
    revocationReason: z.literal('source_membership_revoked'),
    metadata: CoreV2CommandMetadataSchema,
  })
  .strict()
  .superRefine((command, context) => {
    if (command.membership.sessionId !== command.source.sourceId) {
      context.addIssue({
        code: 'custom',
        message: 'Session membership must belong to the conversation source.',
        path: ['membership', 'sessionId'],
      });
    }
  });
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

export const RelationshipConversationAccessEventV2Schema = z.discriminatedUnion(
  'eventType',
  [
    FriendshipAcceptedEventV2Schema,
    PlayerBlockedEventV2Schema,
    PlayerUnblockedEventV2Schema,
    PlayerMutedEventV2Schema,
    PlayerUnmutedEventV2Schema,
  ],
);
export type RelationshipConversationAccessEventV2 = z.infer<
  typeof RelationshipConversationAccessEventV2Schema
>;

export const RelationshipConversationProjectionInputV2Schema = z
  .object({
    relationship: SocialRelationshipSnapshotV2Schema,
    sourceEventId: EventIdSchema,
    sourceEventVersion: z.literal(2),
    correlationId: CorrelationIdSchema,
    causationId: EventIdSchema.nullable(),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type RelationshipConversationProjectionInputV2 = z.infer<
  typeof RelationshipConversationProjectionInputV2Schema
>;

export const RelationshipConversationProjectionReceiptV2Schema = z
  .object({
    action: z.enum([
      'none',
      'provisioned',
      'bound_existing',
      'access_reconciled',
      'access_revoked',
      'notification_policy_reconciled',
    ]),
    conversationId: ConversationIdSchema.nullable(),
    relationshipId: z.string().uuid(),
    relationshipVersion: z.number().int().nonnegative(),
    sourceEventId: EventIdSchema,
    eventIds: z.array(EventIdSchema),
    repeated: z.boolean(),
  })
  .strict();
export type RelationshipConversationProjectionReceiptV2 = z.infer<
  typeof RelationshipConversationProjectionReceiptV2Schema
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
    acceptedSourceAggregateVersion: z.number().int().positive().optional(),
    acceptedMembership: PlaySessionMembershipProjectionV2Schema.optional(),
    message: MessageV2Schema.optional(),
    readCursor: ConversationReadCursorV2Schema.optional(),
  })
  .strict()
  .superRefine((receipt, context) => {
    const sessionCommand =
      receipt.commandName === 'provision_session_conversation_v2' ||
      receipt.commandName === 'reconcile_conversation_membership_v2';
    if (
      sessionCommand &&
      receipt.acceptedSourceAggregateVersion === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Session receipts require the accepted source aggregate version.',
        path: ['acceptedSourceAggregateVersion'],
      });
    }
    if (sessionCommand && receipt.acceptedMembership === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Session receipts require the accepted membership snapshot.',
        path: ['acceptedMembership'],
      });
    }
  });
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

export const ConversationSourceBoundEventV2Schema = coreV2EventSchema({
  aggregateType: 'conversation',
  eventType: 'conversation.source_bound.v2',
  payload: z
    .object({
      binding: ConversationSourceBindingV2Schema,
    })
    .strict(),
});
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
      membership: PlaySessionMembershipProjectionV2Schema,
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
  ConversationSourceBoundEventV2Schema,
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
