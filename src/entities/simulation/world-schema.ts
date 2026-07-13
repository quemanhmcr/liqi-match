import { z } from 'zod';

import {
  CompletedProfileDraftSchema,
  HeroIdSchema,
  LaneSlugSchema,
} from '@/entities/player-profile';

import {
  AssetKeySchema,
  ConversationIdSchema,
  MatchIdSchema,
  MessageIdSchema,
  NotificationIdSchema,
  ProfileIdSchema,
  ScenarioIdSchema,
  SetIdSchema,
  type AssetKey,
  type ConversationId,
  type MatchId,
  type MessageId,
  type NotificationId,
  type ProfileId,
  type SetId,
} from './identity';

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const unique = <T>(values: readonly T[]) =>
  new Set(values).size === values.length;

export const SIMULATION_WORLD_VERSION = 1 as const;

export const SimulatedDiscoverFacetSchema = z.enum([
  'rank',
  'soulmate',
  'team-rank',
  'mic',
  'non-toxic',
]);
export type SimulatedDiscoverFacet = z.infer<
  typeof SimulatedDiscoverFacetSchema
>;

export const SimulatedOnlineStatusSchema = z.enum([
  'hidden',
  'offline',
  'online',
  'recently_online',
]);
export type SimulatedOnlineStatus = z.infer<typeof SimulatedOnlineStatusSchema>;

export const SimulatedReadyModeSchema = z.enum([
  'normal',
  'rank',
  'set-love',
  'soulmate',
  'team-rank',
]);
export type SimulatedReadyMode = z.infer<typeof SimulatedReadyModeSchema>;

export const SimulatedAssetStateSchema = z.enum([
  'available',
  'corrupt',
  'missing',
  'unassociated',
]);
export type SimulatedAssetState = z.infer<typeof SimulatedAssetStateSchema>;

export const SimulatedAssetKindSchema = z.enum([
  'avatar',
  'build-preview',
  'cover',
  'message-image',
  'message-video',
  'role-icon',
  'set-artwork',
  'shared-fallback',
  'vibe-artwork',
  'wall',
]);
export type SimulatedAssetKind = z.infer<typeof SimulatedAssetKindSchema>;

export const SimulatedAssetOwnerSchema = z.discriminatedUnion('kind', [
  z.object({ id: ProfileIdSchema, kind: z.literal('profile') }),
  z.object({ id: SetIdSchema, kind: z.literal('set') }),
  z.object({ id: MessageIdSchema, kind: z.literal('message') }),
  z.object({ id: z.string().min(1), kind: z.literal('shared') }),
]);

export const SimulatedAssetManifestEntrySchema = z.object({
  altText: z.string().min(1),
  height: z.number().int().positive().optional(),
  key: AssetKeySchema,
  kind: SimulatedAssetKindSchema,
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  owner: SimulatedAssetOwnerSchema,
  state: SimulatedAssetStateSchema,
  width: z.number().int().positive().optional(),
});
export type SimulatedAssetManifestEntry = z.infer<
  typeof SimulatedAssetManifestEntrySchema
>;

export const SimulatedProfileMediaSchema = z.object({
  avatarAssetKey: AssetKeySchema.nullable(),
  coverAssetKey: AssetKeySchema.nullable(),
  pendingAssociations: z
    .array(
      z.object({
        assetKey: AssetKeySchema,
        position: z.number().int().min(0).max(3),
        slot: z.enum(['avatar', 'cover', 'wall']),
      }),
    )
    .refine(
      (items) => unique(items.map((item) => `${item.slot}:${item.position}`)),
      'Pending media targets must be unique.',
    ),
  wallAssetKeys: z.array(AssetKeySchema).max(4).refine(unique, {
    message: 'Wall asset keys must be unique.',
  }),
});
export type SimulatedProfileMedia = z.infer<typeof SimulatedProfileMediaSchema>;

export const SimulatedProfileSchema = z.object({
  bio: z.string().max(500),
  canonicalProfile: CompletedProfileDraftSchema,
  createdAt: IsoDateTimeSchema,
  discoverable: z.boolean(),
  facets: z.array(SimulatedDiscoverFacetSchema).refine(unique, {
    message: 'Profile facets must be unique.',
  }),
  id: ProfileIdSchema,
  identityKey: z.string().min(1),
  media: SimulatedProfileMediaSchema,
  presence: z.object({
    changedAt: IsoDateTimeSchema,
    state: SimulatedOnlineStatusSchema,
  }),
  readiness: z.object({
    mode: SimulatedReadyModeSchema.nullable(),
    since: IsoDateTimeSchema.nullable(),
    state: z.enum(['busy', 'offline', 'ready']),
  }),
  region: z.string().min(1),
  stats: z.object({
    matches: z.number().int().nonnegative(),
    rating: z.number().min(0).max(5),
    reputation: z.number().int().min(0).max(100),
    winRate: z.number().min(0).max(100),
  }),
  traits: z.array(z.string().min(1)).refine(unique, {
    message: 'Profile traits must be unique.',
  }),
  updatedAt: IsoDateTimeSchema,
  verified: z.boolean(),
});
export type SimulatedProfile = z.infer<typeof SimulatedProfileSchema>;

export const SimulatedSetTagSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['hero', 'other', 'role', 'schedule', 'trait']),
  label: z.string().min(1),
});

const profileStatusRecord = <Value extends z.ZodType>(value: Value) =>
  z.record(ProfileIdSchema, value);

export const SimulatedSetSchema = z
  .object({
    artworkAssetKey: AssetKeySchema,
    capacity: z.number().int().min(2).max(10),
    compatibilityByProfile: profileStatusRecord(
      z.number().int().min(0).max(100),
    ),
    createdAt: IsoDateTimeSchema,
    facets: z.array(SimulatedDiscoverFacetSchema).refine(unique, {
      message: 'Set facets must be unique.',
    }),
    id: SetIdSchema,
    invites: profileStatusRecord(
      z.enum(['accepted', 'cancelled', 'declined', 'pending']),
    ),
    joinRequests: profileStatusRecord(
      z.enum(['accepted', 'cancelled', 'declined', 'pending']),
    ),
    memberIds: z.array(ProfileIdSchema).min(1).refine(unique, {
      message: 'Set members must be unique.',
    }),
    missingLaneIds: z.array(LaneSlugSchema).refine(unique, {
      message: 'Missing lanes must be unique.',
    }),
    mode: z.enum(['rank', 'team_rank']),
    openedAt: IsoDateTimeSchema,
    ownerId: ProfileIdSchema,
    requiresApproval: z.boolean(),
    requiresRoleSelection: z.boolean(),
    status: z.enum(['closed', 'full', 'open']),
    tags: z.array(SimulatedSetTagSchema),
    title: z.string().min(1),
    version: z.number().int().positive(),
    voicePolicy: z.enum(['off', 'preferred', 'required']),
  })
  .refine((set) => set.memberIds.length <= set.capacity, {
    message: 'Set member count must not exceed capacity.',
    path: ['memberIds'],
  })
  .refine((set) => set.memberIds.includes(set.ownerId), {
    message: 'Set owner must be a member.',
    path: ['ownerId'],
  });
export type SimulatedSet = z.infer<typeof SimulatedSetSchema>;

export const SimulatedMatchKindSchema = z.enum([
  'normal',
  'rank',
  'set-love',
  'soulmate',
  'team-rank',
]);
export type SimulatedMatchKind = z.infer<typeof SimulatedMatchKindSchema>;

export const SimulatedMatchSchema = z
  .object({
    conversationId: ConversationIdSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    id: MatchIdSchema,
    kind: SimulatedMatchKindSchema,
    profileIds: z.tuple([ProfileIdSchema, ProfileIdSchema]),
    setId: SetIdSchema.nullable(),
    unmatchedAt: IsoDateTimeSchema.nullable(),
  })
  .refine((match) => match.profileIds[0] !== match.profileIds[1], {
    message: 'A match requires two distinct profiles.',
    path: ['profileIds'],
  });
export type SimulatedMatch = z.infer<typeof SimulatedMatchSchema>;

export const SimulatedConversationMemberStateSchema = z.object({
  archivedAt: IsoDateTimeSchema.nullable(),
  isMuted: z.boolean(),
  isPinned: z.boolean(),
  lastReadMessageId: MessageIdSchema.nullable(),
});

export const SimulatedConversationSchema = z.object({
  createdAt: IsoDateTimeSchema,
  id: ConversationIdSchema,
  kind: z.enum(['direct', 'group', 'system']),
  memberIds: z.array(ProfileIdSchema).min(1).refine(unique, {
    message: 'Conversation members must be unique.',
  }),
  memberState: z.record(
    ProfileIdSchema,
    SimulatedConversationMemberStateSchema,
  ),
  messageIds: z.array(MessageIdSchema).refine(unique, {
    message: 'Conversation message IDs must be unique.',
  }),
  relationship: z.enum(['friend', 'soulmate', 'system', 'team']),
  setId: SetIdSchema.nullable(),
  title: z.string().min(1).nullable(),
  typingProfileIds: z.array(ProfileIdSchema).refine(unique, {
    message: 'Typing profile IDs must be unique.',
  }),
});
export type SimulatedConversation = z.infer<typeof SimulatedConversationSchema>;

const SimulatedMessageBaseSchema = z.object({
  conversationId: ConversationIdSchema,
  createdAt: IsoDateTimeSchema,
  deliveryStatus: z.enum([
    'delivered',
    'failed',
    'queued',
    'read',
    'sending',
    'sent',
  ]),
  id: MessageIdSchema,
  senderId: ProfileIdSchema.nullable(),
});

export const SimulatedTextMessageSchema = SimulatedMessageBaseSchema.extend({
  kind: z.literal('text'),
  text: z.string(),
});

export const SimulatedMediaMessageSchema = SimulatedMessageBaseSchema.extend({
  altText: z.string().min(1),
  assetKey: AssetKeySchema,
  caption: z.string(),
  fileName: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  kind: z.literal('media'),
  mediaType: z.enum(['image', 'video']),
});

export const SimulatedBuildShareMessageSchema =
  SimulatedMessageBaseSchema.extend({
    heroId: HeroIdSchema,
    kind: z.literal('build_share'),
    previewAssetKey: AssetKeySchema,
    roleIconAssetKey: AssetKeySchema,
    summary: z.string().min(1),
    tags: z.array(z.string().min(1)),
    text: z.string().min(1),
  });

export const SimulatedTeamInviteMessageSchema =
  SimulatedMessageBaseSchema.extend({
    kind: z.literal('team_invite'),
    setId: SetIdSchema,
    text: z.string().min(1),
  });

export const SimulatedMessageSchema = z.discriminatedUnion('kind', [
  SimulatedTextMessageSchema,
  SimulatedMediaMessageSchema,
  SimulatedBuildShareMessageSchema,
  SimulatedTeamInviteMessageSchema,
]);
export type SimulatedMessage = z.infer<typeof SimulatedMessageSchema>;

export const SimulationDeepLinkTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('conversation'),
    conversationId: ConversationIdSchema,
  }),
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('profile'), profileId: ProfileIdSchema }),
  z.object({ kind: z.literal('set'), setId: SetIdSchema }),
]);
export type SimulationDeepLinkTarget = z.infer<
  typeof SimulationDeepLinkTargetSchema
>;

const SimulatedNotificationBaseSchema = z.object({
  id: NotificationIdSchema,
  occurredAt: IsoDateTimeSchema,
  readAt: IsoDateTimeSchema.nullable(),
  recipientId: ProfileIdSchema,
  seenAt: IsoDateTimeSchema.nullable(),
  target: SimulationDeepLinkTargetSchema,
});

export const SimulatedNotificationSchema = z.discriminatedUnion('kind', [
  SimulatedNotificationBaseSchema.extend({
    kind: z.literal('set-invite'),
    payload: z.object({ actorId: ProfileIdSchema, setId: SetIdSchema }),
  }),
  SimulatedNotificationBaseSchema.extend({
    kind: z.literal('direct-message'),
    payload: z.object({
      actorId: ProfileIdSchema,
      conversationId: ConversationIdSchema,
      messageId: MessageIdSchema,
    }),
  }),
  SimulatedNotificationBaseSchema.extend({
    kind: z.literal('praise-received'),
    payload: z.object({
      actorIds: z.array(ProfileIdSchema).min(1).refine(unique),
      count: z.number().int().positive(),
    }),
  }),
  SimulatedNotificationBaseSchema.extend({
    kind: z.literal('team-event'),
    payload: z.object({ setId: SetIdSchema, startsAt: IsoDateTimeSchema }),
  }),
  SimulatedNotificationBaseSchema.extend({
    kind: z.literal('profile-liked'),
    payload: z.object({ actorId: ProfileIdSchema }),
  }),
  SimulatedNotificationBaseSchema.extend({
    kind: z.literal('weekly-reward'),
    payload: z.object({
      amount: z.number().int().positive(),
      currency: z.literal('diamond'),
    }),
  }),
  SimulatedNotificationBaseSchema.extend({
    kind: z.literal('reputation-changed'),
    payload: z.object({ score: z.number().int().min(0).max(100) }),
  }),
]);
export type SimulatedNotification = z.infer<typeof SimulatedNotificationSchema>;

export const SimulationWorldSnapshotSchema = z.object({
  assets: z.record(AssetKeySchema, SimulatedAssetManifestEntrySchema),
  conversations: z.record(ConversationIdSchema, SimulatedConversationSchema),
  generatedAt: IsoDateTimeSchema,
  matches: z.record(MatchIdSchema, SimulatedMatchSchema),
  messages: z.record(MessageIdSchema, SimulatedMessageSchema),
  notifications: z.record(NotificationIdSchema, SimulatedNotificationSchema),
  profiles: z.record(ProfileIdSchema, SimulatedProfileSchema),
  scenarioId: ScenarioIdSchema,
  sets: z.record(SetIdSchema, SimulatedSetSchema),
  version: z.literal(SIMULATION_WORLD_VERSION),
  viewerId: ProfileIdSchema,
});

export type SimulationWorld = z.infer<typeof SimulationWorldSnapshotSchema> & {
  assets: Record<AssetKey, SimulatedAssetManifestEntry>;
  conversations: Record<ConversationId, SimulatedConversation>;
  matches: Record<MatchId, SimulatedMatch>;
  messages: Record<MessageId, SimulatedMessage>;
  notifications: Record<NotificationId, SimulatedNotification>;
  profiles: Record<ProfileId, SimulatedProfile>;
  sets: Record<SetId, SimulatedSet>;
};

/** @deprecated Prefer SimulationWorld to avoid confusion with runtime snapshots. */
export type SimulationWorldSnapshot = SimulationWorld;
