import { z } from 'zod';

export const messagesContractVersion = 1 as const;

export const MessageAssetRefSchema = z.discriminatedUnion('kind', [
  z.object({
    altText: z.string().min(1).optional(),
    assetKey: z.string().min(1),
    height: z.number().int().positive().optional(),
    kind: z.literal('fixture'),
    width: z.number().int().positive().optional(),
  }),
  z.object({
    altText: z.string().min(1).optional(),
    blurhash: z.string().min(1).optional(),
    height: z.number().int().positive().optional(),
    id: z.string().min(1),
    kind: z.literal('remote'),
    url: z.string().url(),
    width: z.number().int().positive().optional(),
  }),
]);
export type MessageAssetRef = z.infer<typeof MessageAssetRefSchema>;

export const MessageDeliveryStatusSchema = z.enum([
  'queued',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
]);
export type MessageDeliveryStatus = z.infer<typeof MessageDeliveryStatusSchema>;

export const MessageConversationKindSchema = z.enum([
  'direct',
  'group',
  'system',
]);
export type MessageConversationKind = z.infer<
  typeof MessageConversationKindSchema
>;

export const MessageRelationshipSchema = z.enum([
  'match',
  'friend',
  'soulmate',
  'team',
  'system',
]);
export type MessageRelationship = z.infer<typeof MessageRelationshipSchema>;

export const MessagePresenceSchema = z.object({
  label: z.string().min(1),
  state: z.enum(['hidden', 'offline', 'online', 'recently_online']),
});
export type MessagePresence = z.infer<typeof MessagePresenceSchema>;

export const MessageParticipantSchema = z.object({
  avatar: MessageAssetRefSchema.optional(),
  displayName: z.string().min(1),
  id: z.string().min(1),
  role: z.enum(['member', 'owner', 'system']),
});
export type MessageParticipant = z.infer<typeof MessageParticipantSchema>;

export const MessageComposerActionSchema = z.object({
  id: z.enum(['build_share', 'camera', 'image', 'team_invite', 'voice']),
  state: z.enum(['available', 'coming_soon', 'hidden']),
});
export type MessageComposerAction = z.infer<typeof MessageComposerActionSchema>;

export const MessageConversationCapabilitiesSchema = z.object({
  canCall: z.boolean(),
  canMessage: z.boolean(),
  canMute: z.boolean(),
  canViewDetails: z.boolean(),
  composerActions: z.array(MessageComposerActionSchema),
});
export type MessageConversationCapabilities = z.infer<
  typeof MessageConversationCapabilitiesSchema
>;

export const MessageLatestActivitySchema = z.object({
  clientMessageId: z.string().min(1).optional(),
  createdAt: z.string().datetime({ offset: true }),
  deliveryStatus: MessageDeliveryStatusSchema.optional(),
  direction: z.enum(['incoming', 'outgoing']),
  id: z.string().min(1),
  kind: z.enum(['build_share', 'image', 'team_invite', 'text', 'video']),
  preview: z.string(),
  senderDisplayName: z.string().min(1).optional(),
  sequence: z.number().int().positive().optional(),
});
export type MessageLatestActivity = z.infer<typeof MessageLatestActivitySchema>;

export const MessageConversationViewerStateSchema = z.object({
  firstUnreadMessageId: z.string().min(1).optional(),
  isArchived: z.boolean(),
  isMuted: z.boolean(),
  isPinned: z.boolean(),
  unreadCount: z.number().int().nonnegative(),
});
export type MessageConversationViewerState = z.infer<
  typeof MessageConversationViewerStateSchema
>;

export const MessageConversationSourceSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['direct_match', 'friendship', 'play_session', 'system']),
});
export type MessageConversationSource = z.infer<
  typeof MessageConversationSourceSchema
>;

export const MessageConversationSummarySchema = z.object({
  avatar: MessageAssetRefSchema.optional(),
  capabilities: MessageConversationCapabilitiesSchema,
  fallbackIcon: z.string().min(1).optional(),
  id: z.string().min(1),
  kind: MessageConversationKindSchema,
  latestActivity: MessageLatestActivitySchema.nullable(),
  participants: z.object({
    preview: z.array(MessageParticipantSchema),
    totalCount: z.number().int().nonnegative(),
  }),
  presence: MessagePresenceSchema,
  relationship: MessageRelationshipSchema,
  source: MessageConversationSourceSchema.optional(),
  title: z.string().min(1),
  viewerState: MessageConversationViewerStateSchema,
});
export type MessageConversationSummary = z.infer<
  typeof MessageConversationSummarySchema
>;

export const MessageConversationDetailSchema =
  MessageConversationSummarySchema.extend({
    composer: z.object({
      disabledReason: z.string().min(1).optional(),
      placeholder: z.string().min(1),
    }),
    liveState: z.object({
      typingParticipantIds: z.array(z.string().min(1)),
    }),
    members: z.array(MessageParticipantSchema),
    subtitle: z.string().min(1),
  });
export type MessageConversationDetail = z.infer<
  typeof MessageConversationDetailSchema
>;

const MessageTimelineBaseSchema = z.object({
  clientMessageId: z.string().min(1).optional(),
  createdAt: z.string().datetime({ offset: true }),
  deliveryStatus: MessageDeliveryStatusSchema.optional(),
  direction: z.enum(['incoming', 'outgoing']),
  id: z.string().min(1),
  senderId: z.string().min(1).optional(),
  sequence: z.number().int().positive().optional(),
});

export const MessageTimelineTextSchema = MessageTimelineBaseSchema.extend({
  kind: z.literal('text'),
  text: z.string(),
});

export const MessageTimelineMediaSchema = MessageTimelineBaseSchema.extend({
  altText: z.string().min(1).optional(),
  caption: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  fileName: z.string().min(1).optional(),
  fileSize: z.number().int().nonnegative().optional(),
  height: z.number().int().positive().optional(),
  kind: z.literal('media'),
  mediaType: z.enum(['image', 'video']),
  source: MessageAssetRefSchema,
  width: z.number().int().positive().optional(),
});

export const MessageTimelineBuildShareSchema = MessageTimelineBaseSchema.extend(
  {
    heroName: z.string().min(1),
    kind: z.literal('build_share'),
    preview: MessageAssetRefSchema,
    roleIcon: MessageAssetRefSchema,
    summary: z.string().min(1),
    tags: z.array(z.string().min(1)),
    text: z.string().min(1),
  },
);

export const MessageTimelineTeamInviteSchema = MessageTimelineBaseSchema.extend(
  {
    artwork: MessageAssetRefSchema.optional(),
    kind: z.literal('team_invite'),
    members: z.array(z.string().min(1)),
    missingRole: z.string().min(1),
    mode: z.string().min(1),
    teamName: z.string().min(1),
    teamSize: z.string().min(1),
    text: z.string().min(1),
  },
);

export const MessageTimelineItemSchema = z.discriminatedUnion('kind', [
  MessageTimelineTextSchema,
  MessageTimelineMediaSchema,
  MessageTimelineBuildShareSchema,
  MessageTimelineTeamInviteSchema,
]);
export type MessageTimelineItem = z.infer<typeof MessageTimelineItemSchema>;

export const MessageInboxFilterSchema = z.enum([
  'all',
  'friends',
  'soulmates',
  'teams',
  'unread',
]);
export type MessageInboxFilter = z.infer<typeof MessageInboxFilterSchema>;

export const MessageInboxParamsSchema = z.object({
  cursor: z.string().min(1).optional(),
  filter: MessageInboxFilterSchema.default('all'),
  limit: z.number().int().min(1).max(50).default(30),
  query: z.string().max(120).default(''),
});
export type MessageInboxParams = z.input<typeof MessageInboxParamsSchema>;
export type CanonicalMessageInboxParams = z.output<
  typeof MessageInboxParamsSchema
>;

export const MessageTimelineParamsSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
export type MessageTimelineParams = z.input<typeof MessageTimelineParamsSchema>;
export type CanonicalMessageTimelineParams = z.output<
  typeof MessageTimelineParamsSchema
>;

export const MessagePageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  nextCursor: z.string().min(1).nullable(),
});
export type MessagePageInfo = z.infer<typeof MessagePageInfoSchema>;

export const MessageInboxPageSchema = z.object({
  items: z.array(MessageConversationSummarySchema),
  pageInfo: MessagePageInfoSchema,
  totalCount: z.number().int().nonnegative(),
  unreadConversationCount: z.number().int().nonnegative(),
});
export type MessageInboxPage = z.infer<typeof MessageInboxPageSchema>;

export const MessageTimelinePageSchema = z.object({
  items: z.array(MessageTimelineItemSchema),
  pageInfo: MessagePageInfoSchema,
});
export type MessageTimelinePage = z.infer<typeof MessageTimelinePageSchema>;

const MessagesResponseMetaSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  requestId: z.string().min(1),
});

export function createMessagesResponseSchema<T extends z.ZodType>(
  dataSchema: T,
) {
  return z.object({
    contractVersion: z.literal(messagesContractVersion),
    data: dataSchema,
    meta: MessagesResponseMetaSchema,
  });
}

export type MessagesResponse<T> = {
  contractVersion: typeof messagesContractVersion;
  data: T;
  meta: { generatedAt: string; requestId: string };
};

export const MessageInboxResponseSchema = createMessagesResponseSchema(
  MessageInboxPageSchema,
);
export const MessageConversationResponseSchema = createMessagesResponseSchema(
  MessageConversationDetailSchema,
);
export const MessageTimelineResponseSchema = createMessagesResponseSchema(
  MessageTimelinePageSchema,
);

export type MessagesErrorCode =
  | 'contract_violation'
  | 'forbidden'
  | 'network_error'
  | 'not_found'
  | 'rate_limited'
  | 'stale_cursor'
  | 'unauthenticated'
  | 'unknown'
  | 'validation_failed';

export class MessagesServiceError extends Error {
  constructor(
    readonly code: MessagesErrorCode,
    message: string,
    readonly retryable = false,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'MessagesServiceError';
  }
}
