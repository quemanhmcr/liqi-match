import { z } from 'zod';

import {
  CorrelationIdSchema,
  IdempotencyKeySchema,
  PlayerIdSchema,
} from '../../core-v1';
import {
  FriendshipRequestIdV2Schema,
  ReportIdV2Schema,
  SocialRelationshipIdV2Schema,
} from './semantic-ids';

export const CoreV2ContractVersionSchema = z.literal(2);
export const AggregateVersionV2Schema = z.number().int().nonnegative();

export const FriendshipStateV2Schema = z.enum([
  'none',
  'pending',
  'accepted',
  'removed',
]);
export const FriendshipRequestStateV2Schema = z.enum([
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'expired',
]);
export const RelationshipFriendshipLabelV2Schema = z.enum([
  'none',
  'pending_outgoing',
  'pending_incoming',
  'friend',
  'removed',
]);
export const ProfileVisibilityV2Schema = z.enum([
  'everyone',
  'friends',
  'private',
]);
export const PresenceVisibilityV2Schema = z.enum([
  'everyone',
  'friends',
  'hidden',
]);
export const FriendshipRequestPolicyV2Schema = z.enum([
  'everyone',
  'matched_only',
  'nobody',
]);
export const SessionInvitePolicyV2Schema = z.enum([
  'everyone',
  'friends',
  'nobody',
]);

export const RelationshipCapabilitiesV2Schema = z
  .object({
    blocked: z.boolean(),
    canAcceptFriendship: z.boolean(),
    canBlock: z.boolean(),
    canCancelFriendship: z.boolean(),
    canDeclineFriendship: z.boolean(),
    canDiscover: z.boolean(),
    canInviteToSession: z.boolean(),
    canMessage: z.boolean(),
    canMute: z.boolean(),
    canRemoveFriendship: z.boolean(),
    canReport: z.boolean(),
    canRequestFriendship: z.boolean(),
    canUnblock: z.boolean(),
    canUnmute: z.boolean(),
    canViewConversation: z.boolean(),
    canViewPresence: z.boolean(),
    canViewProfile: z.boolean(),
    friendshipLabel: RelationshipFriendshipLabelV2Schema,
    muted: z.boolean(),
  })
  .strict()
  .superRefine((capabilities, context) => {
    if (!capabilities.blocked) return;

    const forbiddenWhenBlocked = [
      'canAcceptFriendship',
      'canCancelFriendship',
      'canDeclineFriendship',
      'canDiscover',
      'canInviteToSession',
      'canMessage',
      'canMute',
      'canRemoveFriendship',
      'canRequestFriendship',
      'canUnmute',
      'canViewConversation',
      'canViewPresence',
      'canViewProfile',
    ] as const;

    for (const capability of forbiddenWhenBlocked) {
      if (!capabilities[capability]) continue;
      context.addIssue({
        code: 'custom',
        message: `${capability} must be false while block override is active.`,
        path: [capability],
      });
    }
  });

export const FriendshipProjectionV2Schema = z
  .object({
    acceptedAt: z.string().datetime({ offset: true }).nullable(),
    label: RelationshipFriendshipLabelV2Schema,
    requestId: FriendshipRequestIdV2Schema.nullable(),
    requestState: FriendshipRequestStateV2Schema.nullable(),
    requestVersion: AggregateVersionV2Schema.nullable(),
    state: FriendshipStateV2Schema,
  })
  .strict();

export const BlockProjectionV2Schema = z
  .object({
    targetBlocksViewer: z.boolean(),
    viewerBlocksTarget: z.boolean(),
  })
  .strict();

export const MuteProjectionV2Schema = z
  .object({ viewerMutedTarget: z.boolean() })
  .strict();

export const PlayerPrivacySettingsV2Schema = z
  .object({
    contractVersion: CoreV2ContractVersionSchema,
    friendshipRequests: FriendshipRequestPolicyV2Schema,
    playerId: PlayerIdSchema,
    presenceVisibility: PresenceVisibilityV2Schema,
    profileVisibility: ProfileVisibilityV2Schema,
    sessionInvites: SessionInvitePolicyV2Schema,
    updatedAt: z.string().datetime({ offset: true }),
    version: AggregateVersionV2Schema,
  })
  .strict();

export const SocialRelationshipSnapshotV2Schema = z
  .object({
    block: BlockProjectionV2Schema,
    capabilities: RelationshipCapabilitiesV2Schema,
    contractVersion: CoreV2ContractVersionSchema,
    friendship: FriendshipProjectionV2Schema,
    mute: MuteProjectionV2Schema,
    relationshipId: SocialRelationshipIdV2Schema,
    targetPlayerId: PlayerIdSchema,
    targetPrivacy: PlayerPrivacySettingsV2Schema,
    updatedAt: z.string().datetime({ offset: true }),
    version: AggregateVersionV2Schema,
    viewerPlayerId: PlayerIdSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const blocked =
      snapshot.block.viewerBlocksTarget || snapshot.block.targetBlocksViewer;
    if (snapshot.capabilities.blocked !== blocked) {
      context.addIssue({
        code: 'custom',
        message:
          'capabilities.blocked must reflect directional block authority.',
        path: ['capabilities', 'blocked'],
      });
    }
    if (
      snapshot.friendship.label === 'friend' &&
      snapshot.friendship.state !== 'accepted'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Friend label requires accepted friendship authority.',
        path: ['friendship', 'label'],
      });
    }
  });

export const SocialRelationshipErrorCodeV2Schema = z.enum([
  'relationship_unauthenticated',
  'relationship_identity_mismatch',
  'relationship_player_not_found',
  'relationship_player_not_active',
  'relationship_self_forbidden',
  'relationship_version_conflict',
  'friendship_request_not_found',
  'friendship_request_not_pending',
  'friendship_request_forbidden',
  'friendship_already_exists',
  'friendship_not_found',
  'relationship_blocked',
  'block_already_active',
  'block_not_found',
  'mute_already_active',
  'mute_not_found',
  'privacy_forbidden',
  'report_target_not_found',
  'report_evidence_invalid',
  'relationship_unsupported_version',
]);

export const SocialCommandAuditMetadataV2Schema = z
  .object({
    clientCreatedAt: z.string().datetime({ offset: true }),
    clientPlatform: z.enum(['ios', 'android', 'web', 'service']),
    clientVersion: z.string().trim().min(1).max(64),
    requestId: z.string().trim().min(1).max(128),
  })
  .strict();

const RelationshipCommandBaseV2Schema = z
  .object({
    audit: SocialCommandAuditMetadataV2Schema,
    correlationId: CorrelationIdSchema,
    expectedRelationshipVersion: AggregateVersionV2Schema,
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();

export const RequestFriendshipCommandV2Schema =
  RelationshipCommandBaseV2Schema.extend({ targetPlayerId: PlayerIdSchema });
export const RemoveFriendshipCommandV2Schema =
  RelationshipCommandBaseV2Schema.extend({ targetPlayerId: PlayerIdSchema });
export const BlockPlayerCommandV2Schema =
  RelationshipCommandBaseV2Schema.extend({
    reasonCode: z.string().min(1).max(64).nullable().default(null),
    targetPlayerId: PlayerIdSchema,
  });
export const UnblockPlayerCommandV2Schema =
  RelationshipCommandBaseV2Schema.extend({ targetPlayerId: PlayerIdSchema });
export const MutePlayerCommandV2Schema = RelationshipCommandBaseV2Schema.extend(
  {
    targetPlayerId: PlayerIdSchema,
  },
);
export const UnmutePlayerCommandV2Schema =
  RelationshipCommandBaseV2Schema.extend({ targetPlayerId: PlayerIdSchema });

const FriendshipRequestCommandBaseV2Schema = z
  .object({
    audit: SocialCommandAuditMetadataV2Schema,
    correlationId: CorrelationIdSchema,
    expectedRelationshipVersion: AggregateVersionV2Schema,
    expectedRequestVersion: AggregateVersionV2Schema,
    friendshipRequestId: FriendshipRequestIdV2Schema,
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();

export const AcceptFriendshipCommandV2Schema =
  FriendshipRequestCommandBaseV2Schema;
export const DeclineFriendshipCommandV2Schema =
  FriendshipRequestCommandBaseV2Schema;
export const CancelFriendshipCommandV2Schema =
  FriendshipRequestCommandBaseV2Schema;

export const UpdatePlayerPrivacyCommandV2Schema = z
  .object({
    audit: SocialCommandAuditMetadataV2Schema,
    correlationId: CorrelationIdSchema,
    expectedPrivacyVersion: AggregateVersionV2Schema,
    friendshipRequests: FriendshipRequestPolicyV2Schema,
    idempotencyKey: IdempotencyKeySchema,
    presenceVisibility: PresenceVisibilityV2Schema,
    profileVisibility: ProfileVisibilityV2Schema,
    sessionInvites: SessionInvitePolicyV2Schema,
  })
  .strict();

export const ReportCategoryV2Schema = z.enum([
  'harassment',
  'hate',
  'spam',
  'sexual_content',
  'threat',
  'cheating',
  'other',
]);

const ReportCommandBaseV2Schema = z
  .object({
    audit: SocialCommandAuditMetadataV2Schema,
    category: ReportCategoryV2Schema,
    correlationId: CorrelationIdSchema,
    details: z.string().trim().max(2000).nullable(),
    expectedReportVersion: z.literal(0),
    idempotencyKey: IdempotencyKeySchema,
    targetPlayerId: PlayerIdSchema,
  })
  .strict();

export const ReportPlayerCommandV2Schema = ReportCommandBaseV2Schema;
export const ReportMessageCommandV2Schema = ReportCommandBaseV2Schema.extend({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export const FriendshipListPageV2Schema = z
  .object({
    contractVersion: CoreV2ContractVersionSchema,
    items: z.array(SocialRelationshipSnapshotV2Schema),
    nextCursor: PlayerIdSchema.nullable(),
  })
  .strict();

export const SocialRelationshipCommandReceiptV2Schema = z
  .object({
    correlationId: CorrelationIdSchema,
    eventIds: z.array(z.string().uuid()).min(1),
    relationship: SocialRelationshipSnapshotV2Schema,
    repeated: z.boolean(),
  })
  .strict();

export const PlayerPrivacyCommandReceiptV2Schema = z
  .object({
    correlationId: CorrelationIdSchema,
    eventIds: z.array(z.string().uuid()).length(1),
    privacy: PlayerPrivacySettingsV2Schema,
    repeated: z.boolean(),
  })
  .strict();

export const ReportReceiptV2Schema = z
  .object({
    correlationId: CorrelationIdSchema,
    eventIds: z.array(z.string().uuid()).length(1),
    repeated: z.boolean(),
    reportId: ReportIdV2Schema,
    status: z.literal('submitted'),
    version: z.literal(1),
  })
  .strict();

export type SocialCommandAuditMetadataV2 = z.infer<
  typeof SocialCommandAuditMetadataV2Schema
>;
export type RelationshipCapabilitiesV2 = z.infer<
  typeof RelationshipCapabilitiesV2Schema
>;
export type SocialRelationshipSnapshotV2 = z.infer<
  typeof SocialRelationshipSnapshotV2Schema
>;
export type PlayerPrivacySettingsV2 = z.infer<
  typeof PlayerPrivacySettingsV2Schema
>;
export type RequestFriendshipCommandV2 = z.infer<
  typeof RequestFriendshipCommandV2Schema
>;
export type AcceptFriendshipCommandV2 = z.infer<
  typeof AcceptFriendshipCommandV2Schema
>;
export type DeclineFriendshipCommandV2 = z.infer<
  typeof DeclineFriendshipCommandV2Schema
>;
export type CancelFriendshipCommandV2 = z.infer<
  typeof CancelFriendshipCommandV2Schema
>;
export type RemoveFriendshipCommandV2 = z.infer<
  typeof RemoveFriendshipCommandV2Schema
>;
export type BlockPlayerCommandV2 = z.infer<typeof BlockPlayerCommandV2Schema>;
export type UnblockPlayerCommandV2 = z.infer<
  typeof UnblockPlayerCommandV2Schema
>;
export type MutePlayerCommandV2 = z.infer<typeof MutePlayerCommandV2Schema>;
export type UnmutePlayerCommandV2 = z.infer<typeof UnmutePlayerCommandV2Schema>;
export type UpdatePlayerPrivacyCommandV2 = z.infer<
  typeof UpdatePlayerPrivacyCommandV2Schema
>;
export type ReportPlayerCommandV2 = z.infer<typeof ReportPlayerCommandV2Schema>;
export type ReportMessageCommandV2 = z.infer<
  typeof ReportMessageCommandV2Schema
>;
export type SocialRelationshipCommandReceiptV2 = z.infer<
  typeof SocialRelationshipCommandReceiptV2Schema
>;

export const TrustVisibilityV2Schema = z.enum([
  'everyone',
  'friends',
  'private',
]);

export const TrustVisibilityDecisionV2Schema = z
  .object({
    blocked: z.boolean(),
    canViewTrust: z.boolean(),
    contractVersion: CoreV2ContractVersionSchema,
    privacyVersion: AggregateVersionV2Schema,
    relationshipVersion: AggregateVersionV2Schema,
    targetPlayerId: PlayerIdSchema,
    trustVisibility: TrustVisibilityV2Schema,
    viewerPlayerId: PlayerIdSchema,
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.blocked && decision.canViewTrust) {
      context.addIssue({
        code: 'custom',
        message:
          'Trust visibility must fail closed while block override is active.',
        path: ['canViewTrust'],
      });
    }
  });

export type FriendshipListPageV2 = z.infer<typeof FriendshipListPageV2Schema>;
export type TrustVisibilityV2 = z.infer<typeof TrustVisibilityV2Schema>;
export type TrustVisibilityDecisionV2 = z.infer<
  typeof TrustVisibilityDecisionV2Schema
>;
