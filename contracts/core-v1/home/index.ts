import { z } from 'zod';

import { MatchIntentStateV1Schema } from '../discovery/match-intent';
import {
  ConversationIdSchema,
  MatchIdSchema,
  MatchIntentIdSchema,
  PlayerIdSchema,
  ProfileIdSchema,
} from '../identity/semantic-ids';
import { PlayerLifecycleSnapshotV1Schema } from '../lifecycle/player-lifecycle';
import {
  HomeMatchKindV1Schema,
  HomeMatchStatusV1Schema,
  type HomeMatchKindV1,
  type HomeMatchStatusV1,
} from '../match/home-match-facts';

export const HomePlayerSummaryV1Schema = z
  .object({
    avatarUrl: z.string().url().nullable(),
    displayName: z.string().min(1).max(80),
    playerId: PlayerIdSchema,
    profileId: ProfileIdSchema,
  })
  .strict();

export const HomeCurrentProfileV1Schema = z
  .object({
    avatarMediaId: z.string().uuid().nullable(),
    displayName: z.string().min(1).max(80),
    handle: z.string().min(1).max(64).nullable(),
    onlineTimePreset: z.string().min(1).max(120).nullable(),
    playerId: PlayerIdSchema,
    profileId: ProfileIdSchema,
    rankName: z.string().min(1).max(80).nullable(),
    roleNames: z.array(z.string().min(1).max(80)).max(10),
  })
  .strict();

export const HomeMatchIntentSummaryV1Schema = z
  .object({
    activatedAt: z.string().datetime({ offset: true }).nullable(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    lifecycle: MatchIntentStateV1Schema,
    matchIntentId: MatchIntentIdSchema,
    mode: z.string().min(1).max(64),
  })
  .strict();

export const HomeMatchSummaryV1Schema = z
  .object({
    conversationId: ConversationIdSchema.nullable(),
    createdAt: z.string().datetime({ offset: true }),
    kind: HomeMatchKindV1Schema,
    matchId: MatchIdSchema,
    matchedPlayer: HomePlayerSummaryV1Schema,
    status: HomeMatchStatusV1Schema,
  })
  .strict();

export const HomeConversationSummaryV1Schema = z
  .object({
    conversationId: ConversationIdSchema,
    lastMessageAt: z.string().datetime({ offset: true }).nullable(),
    lastMessagePreview: z.string().max(240).nullable(),
    matchId: MatchIdSchema,
    participant: HomePlayerSummaryV1Schema,
    unreadCount: z.number().int().nonnegative(),
  })
  .strict();

export const HomeDashboardV1Schema = z
  .object({
    activeMatchIntent: HomeMatchIntentSummaryV1Schema.nullable(),
    capabilities: z
      .object({
        canDiscover: z.boolean(),
        canMessage: z.boolean(),
      })
      .strict(),
    conversations: z.array(HomeConversationSummaryV1Schema).max(20),
    generatedAt: z.string().datetime({ offset: true }),
    notificationSummary: z
      .object({ unseenCount: z.number().int().nonnegative() })
      .strict(),
    playerLifecycle: PlayerLifecycleSnapshotV1Schema,
    recentMatches: z.array(HomeMatchSummaryV1Schema).max(20),
  })
  .strict()
  .superRefine((dashboard, context) => {
    const lifecycle = dashboard.playerLifecycle;
    if (
      dashboard.capabilities.canDiscover &&
      (lifecycle.state !== 'active' || !lifecycle.discoverable)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'canDiscover requires an active, discoverable lifecycle.',
        path: ['capabilities', 'canDiscover'],
      });
    }
    if (
      dashboard.capabilities.canMessage &&
      (lifecycle.state !== 'active' || !lifecycle.messagingAllowed)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'canMessage requires an active, messaging-allowed lifecycle.',
        path: ['capabilities', 'canMessage'],
      });
    }
  });

export const homePlayerSummaryV1Schema = HomePlayerSummaryV1Schema;
export const homeCurrentProfileV1Schema = HomeCurrentProfileV1Schema;
export const homeMatchIntentSummaryV1Schema = HomeMatchIntentSummaryV1Schema;

export const homeDashboardMatchKindV1Schema = HomeMatchKindV1Schema;
export const homeDashboardMatchStatusV1Schema = HomeMatchStatusV1Schema;
export type HomeDashboardMatchKindV1 = HomeMatchKindV1;
export type HomeDashboardMatchStatusV1 = HomeMatchStatusV1;
export const homeMatchSummaryV1Schema = HomeMatchSummaryV1Schema;
export const homeConversationSummaryV1Schema = HomeConversationSummaryV1Schema;
export const homeDashboardV1Schema = HomeDashboardV1Schema;

export type HomePlayerSummaryV1 = z.infer<typeof HomePlayerSummaryV1Schema>;
export type HomeCurrentProfileV1 = z.infer<typeof HomeCurrentProfileV1Schema>;
export type HomeMatchIntentSummaryV1 = z.infer<
  typeof HomeMatchIntentSummaryV1Schema
>;
export type HomeMatchSummaryV1 = z.infer<typeof HomeMatchSummaryV1Schema>;
export type HomeConversationSummaryV1 = z.infer<
  typeof HomeConversationSummaryV1Schema
>;
export type HomeDashboardV1 = z.infer<typeof HomeDashboardV1Schema>;
