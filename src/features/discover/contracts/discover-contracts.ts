import { z } from 'zod';

export const discoverContractVersion = 1 as const;

export const DiscoverFacetIdSchema = z.enum([
  'rank',
  'soulmate',
  'team-rank',
  'mic',
  'non-toxic',
]);
export type DiscoverFacetId = z.infer<typeof DiscoverFacetIdSchema>;

export const DiscoverFilterIdSchema = z.union([
  z.literal('all'),
  DiscoverFacetIdSchema,
]);
export type DiscoverFilterId = z.infer<typeof DiscoverFilterIdSchema>;

const DiscoverFixtureMediaSchema = z.object({
  altText: z.string().min(1).optional(),
  assetKey: z.string().min(1),
  height: z.number().int().positive().optional(),
  kind: z.literal('fixture'),
  width: z.number().int().positive().optional(),
});

const DiscoverRemoteMediaSchema = z.object({
  altText: z.string().min(1).optional(),
  blurhash: z.string().min(1).optional(),
  height: z.number().int().positive().optional(),
  id: z.string().min(1),
  kind: z.literal('remote'),
  url: z.string().url(),
  width: z.number().int().positive().optional(),
});

export const DiscoverMediaSchema = z.discriminatedUnion('kind', [
  DiscoverFixtureMediaSchema,
  DiscoverRemoteMediaSchema,
]);
export type DiscoverMedia = z.infer<typeof DiscoverMediaSchema>;

export const DiscoverAvatarPreviewSchema = z.object({
  id: z.string().min(1),
  media: DiscoverMediaSchema,
});
export type DiscoverAvatarPreview = z.infer<typeof DiscoverAvatarPreviewSchema>;

export const DiscoverFilterOptionSchema = z.object({
  appliesTo: z.array(z.enum(['players', 'sets', 'vibes'])).min(1),
  id: DiscoverFacetIdSchema,
  label: z.string().min(1),
});
export type DiscoverFilterOption = z.infer<typeof DiscoverFilterOptionSchema>;

export const DiscoverMetricSchema = z.object({
  kind: z.enum(['hot_hero', 'online_players', 'open_sets']),
  label: z.string().min(1),
  value: z.union([z.number().int().nonnegative(), z.string().min(1)]),
});
export type DiscoverMetric = z.infer<typeof DiscoverMetricSchema>;

export const DiscoverVibeSchema = z.object({
  activityType: z.enum([
    'casual',
    'duo',
    'ranked',
    'social',
    'team_recruitment',
  ]),
  artwork: DiscoverMediaSchema,
  engagement: z.object({
    count: z.number().int().nonnegative(),
    kind: z.enum(['interested_players', 'open_sets', 'teams_recruiting']),
  }),
  facetIds: z.array(DiscoverFacetIdSchema),
  id: z.string().min(1),
  participants: z.object({
    preview: z.array(DiscoverAvatarPreviewSchema),
    totalCount: z.number().int().nonnegative(),
  }),
  slug: z.string().min(1),
  title: z.string().min(1),
});
export type DiscoverVibe = z.infer<typeof DiscoverVibeSchema>;

export const DiscoverTagSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['hero', 'other', 'role', 'schedule', 'trait']),
  label: z.string().min(1),
});
export type DiscoverTag = z.infer<typeof DiscoverTagSchema>;

export const DiscoverRoleReferenceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const DiscoverSetSchema = z.object({
  artwork: DiscoverMediaSchema,
  communication: z.object({
    voicePolicy: z.enum(['off', 'preferred', 'required']),
  }),
  facetIds: z.array(DiscoverFacetIdSchema),
  id: z.string().min(1),
  matchScore: z.number().int().min(0).max(100),
  members: z.object({
    preview: z.array(DiscoverAvatarPreviewSchema),
    totalCount: z.number().int().nonnegative(),
  }),
  mode: z.enum(['rank', 'team_rank']),
  occupancy: z
    .object({
      capacity: z.number().int().positive(),
      current: z.number().int().nonnegative(),
    })
    .refine((value) => value.current <= value.capacity, {
      message: 'occupancy.current must not exceed occupancy.capacity',
    }),
  openedAt: z.string().datetime({ offset: true }),
  recruitment: z.object({
    missingRoles: z.array(DiscoverRoleReferenceSchema),
    requiresApproval: z.boolean(),
    requiresRoleSelection: z.boolean(),
    status: z.enum(['closed', 'full', 'open']),
  }),
  tags: z.array(DiscoverTagSchema),
  title: z.string().min(1),
  version: z.number().int().positive(),
  viewerState: z.object({
    canRequestJoin: z.boolean(),
    canViewDetails: z.boolean(),
    joinRequestStatus: z.enum([
      'accepted',
      'cancelled',
      'declined',
      'none',
      'pending',
    ]),
    relationship: z.enum(['member', 'none', 'owner']),
  }),
});
export type DiscoverSet = z.infer<typeof DiscoverSetSchema>;

export const DiscoverPlayerRecommendationSchema = z
  .object({
    avatar: DiscoverMediaSchema,
    capabilities: z.object({
      canLike: z.boolean().optional(),
      canPass: z.boolean().optional(),
      canMessage: z.boolean(),
      canViewProfile: z.boolean(),
      invite: z.object({
        state: z.enum([
          'accepted',
          'available',
          'cancelled',
          'declined',
          'pending',
          'unavailable',
        ]),
        targetSetId: z.string().min(1).optional(),
      }),
    }),
    conversationId: z.string().min(1).nullable().optional(),
    displayName: z.string().min(1),
    facetIds: z.array(DiscoverFacetIdSchema),
    matchReasons: z.array(
      z.object({ code: z.string().min(1), label: z.string().min(1) }),
    ),
    matchScore: z.number().int().min(0).max(100),
    intentVersion: z.number().int().positive().optional(),
    onlineStatus: z.enum(['hidden', 'offline', 'online', 'recently_online']),
    primaryRole: DiscoverRoleReferenceSchema.optional(),
    playerId: z.string().uuid().optional(),
    profileId: z.string().min(1),
    profileVersion: z.number().int().nonnegative().optional(),
    relationshipState: z.enum(['none', 'liked', 'passed']).optional(),
    rank: DiscoverRoleReferenceSchema.optional(),
  })
  .superRefine((value, context) => {
    if (
      ['accepted', 'available', 'declined', 'pending'].includes(
        value.capabilities.invite.state,
      ) &&
      !value.capabilities.invite.targetSetId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'targetSetId is required when invite is available or active',
        path: ['capabilities', 'invite', 'targetSetId'],
      });
    }
  });
export type DiscoverPlayerRecommendation = z.infer<
  typeof DiscoverPlayerRecommendationSchema
>;

export const DiscoverPageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  nextCursor: z.string().min(1).nullable(),
});

export function createDiscoverPageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    pageInfo: DiscoverPageInfoSchema,
    totalCount: z.number().int().nonnegative().optional(),
  });
}

export type DiscoverPage<T> = {
  items: T[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
  totalCount?: number;
};

const DiscoverResponseMetaSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  requestId: z.string().min(1),
});

export function createDiscoverResponseSchema<T extends z.ZodType>(
  dataSchema: T,
) {
  return z.object({
    contractVersion: z.literal(discoverContractVersion),
    data: dataSchema,
    meta: DiscoverResponseMetaSchema,
  });
}

export type DiscoverResponse<T> = {
  contractVersion: typeof discoverContractVersion;
  data: T;
  meta: { generatedAt: string; requestId: string };
};

const DiscoverPreviewSectionSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    defaultSort: z.string().min(1),
    items: z.array(itemSchema),
    totalCount: z.number().int().nonnegative(),
  });

export const DiscoverOverviewDataSchema = z.object({
  filterOptions: z.array(DiscoverFilterOptionSchema),
  metrics: z.array(DiscoverMetricSchema),
  sections: z.object({
    players: DiscoverPreviewSectionSchema(DiscoverPlayerRecommendationSchema),
    sets: DiscoverPreviewSectionSchema(DiscoverSetSchema),
    vibes: DiscoverPreviewSectionSchema(DiscoverVibeSchema),
  }),
});
export type DiscoverOverviewData = z.infer<typeof DiscoverOverviewDataSchema>;

export const DiscoverOverviewResponseSchema = createDiscoverResponseSchema(
  DiscoverOverviewDataSchema,
);
export const DiscoverVibesResponseSchema = createDiscoverResponseSchema(
  createDiscoverPageSchema(DiscoverVibeSchema),
);
export const DiscoverSetsResponseSchema = createDiscoverResponseSchema(
  createDiscoverPageSchema(DiscoverSetSchema),
);
export const DiscoverPlayersResponseSchema = createDiscoverResponseSchema(
  createDiscoverPageSchema(DiscoverPlayerRecommendationSchema),
);

export const DiscoverOverviewParamsSchema = z.object({
  facetIds: z.array(DiscoverFacetIdSchema).default([]),
  previewLimit: z.number().int().min(1).max(20).default(3),
  query: z.string().max(120).default(''),
});
export type DiscoverOverviewParams = z.input<
  typeof DiscoverOverviewParamsSchema
>;
export type CanonicalDiscoverOverviewParams = z.output<
  typeof DiscoverOverviewParamsSchema
>;

const DiscoverListParamsBaseSchema = z.object({
  cursor: z.string().min(1).optional(),
  facetIds: z.array(DiscoverFacetIdSchema).default([]),
  limit: z.number().int().min(1).max(50).default(20),
  query: z.string().max(120).default(''),
});

export const DiscoverVibeListParamsSchema = DiscoverListParamsBaseSchema.extend(
  {
    sort: z.enum(['best_match', 'newest', 'popular']).default('popular'),
  },
);
export type DiscoverVibeListParams = z.input<
  typeof DiscoverVibeListParamsSchema
>;
export type CanonicalDiscoverVibeListParams = z.output<
  typeof DiscoverVibeListParamsSchema
>;

export const DiscoverSetListParamsSchema = DiscoverListParamsBaseSchema.extend({
  sort: z.enum(['almost_full', 'best_match', 'newest']).default('best_match'),
});
export type DiscoverSetListParams = z.input<typeof DiscoverSetListParamsSchema>;
export type CanonicalDiscoverSetListParams = z.output<
  typeof DiscoverSetListParamsSchema
>;

export const DiscoverPlayerListParamsSchema =
  DiscoverListParamsBaseSchema.extend({
    sort: z.enum(['best_match', 'newest', 'online']).default('best_match'),
  });
export type DiscoverPlayerListParams = z.input<
  typeof DiscoverPlayerListParamsSchema
>;
export type CanonicalDiscoverPlayerListParams = z.output<
  typeof DiscoverPlayerListParamsSchema
>;

export const RequestSetJoinCommandSchema = z.object({
  clientMutationId: z.string().min(1),
  expectedSetVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().min(1),
  requestedRoleId: z.string().min(1).optional(),
  setId: z.string().min(1),
  source: z.literal('discover'),
});
export type RequestSetJoinCommand = z.infer<typeof RequestSetJoinCommandSchema>;

export const SetJoinRequestReceiptSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  repeated: z.boolean(),
  requestId: z.string().min(1),
  setId: z.string().min(1),
  setVersion: z.number().int().positive(),
  status: z.enum(['accepted', 'cancelled', 'declined', 'pending']),
});
export type SetJoinRequestReceipt = z.infer<typeof SetJoinRequestReceiptSchema>;

export const InvitePlayerToSetCommandSchema = z.object({
  clientMutationId: z.string().min(1),
  expectedSetVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().min(1),
  profileId: z.string().min(1),
  setId: z.string().min(1),
  source: z.literal('discover'),
});
export type InvitePlayerToSetCommand = z.infer<
  typeof InvitePlayerToSetCommandSchema
>;

export const PlayerInviteReceiptSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  inviteId: z.string().min(1),
  profileId: z.string().min(1),
  repeated: z.boolean(),
  setId: z.string().min(1),
  status: z.enum(['accepted', 'cancelled', 'declined', 'pending']),
});
export type PlayerInviteReceipt = z.infer<typeof PlayerInviteReceiptSchema>;

export type DiscoverErrorCode =
  | 'contract_violation'
  | 'forbidden'
  | 'invite_exists'
  | 'invite_target_required'
  | 'join_request_exists'
  | 'network_error'
  | 'not_found'
  | 'rate_limited'
  | 'set_closed'
  | 'set_full'
  | 'stale_cursor'
  | 'target_unavailable'
  | 'unauthenticated'
  | 'unknown'
  | 'validation_failed'
  | 'version_conflict';

export class DiscoverServiceError extends Error {
  constructor(
    readonly code: DiscoverErrorCode,
    message: string,
    readonly retryable = false,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'DiscoverServiceError';
  }
}
