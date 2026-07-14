import { z } from 'zod';

import {
  ConversationIdSchema,
  MatchIdSchema,
  MatchSetIdSchema,
  PlayerIdSchema,
  SessionIdSchema,
} from '../identity/semantic-ids';

export const DeepLinkV1Schema = z.discriminatedUnion('target', [
  z.object({ matchId: MatchIdSchema, target: z.literal('match') }).strict(),
  z
    .object({
      conversationId: ConversationIdSchema,
      target: z.literal('conversation'),
    })
    .strict(),
  z.object({ setId: MatchSetIdSchema, target: z.literal('set') }).strict(),
  z.object({ playerId: PlayerIdSchema, target: z.literal('profile') }).strict(),
  z
    .object({
      sessionId: SessionIdSchema,
      target: z.literal('session_feedback'),
    })
    .strict(),
  z.object({ target: z.literal('home') }).strict(),
]);

export const deepLinkV1Schema = DeepLinkV1Schema;
export type DeepLinkV1 = z.infer<typeof DeepLinkV1Schema>;
