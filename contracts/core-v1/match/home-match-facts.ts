import { z } from 'zod';

import {
  ConversationIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
} from '../identity/semantic-ids';
import { PlayerSummaryV1Schema } from '../profile/player-summary';

export const HomeMatchKindV1Schema = z.enum([
  'normal',
  'rank',
  'team_rank',
  'set_love',
  'soulmate',
]);

export const HomeMatchStatusV1Schema = z.enum([
  'conversation_pending',
  'conversation_ready',
  'closed',
]);

export const HomeMatchFactV1Schema = z
  .object({
    canMessage: z.boolean(),
    conversationId: ConversationIdSchema.nullable(),
    correlationId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    kind: HomeMatchKindV1Schema,
    matchId: MatchIdSchema,
    opponent: PlayerSummaryV1Schema,
    participantIds: z.tuple([PlayerIdSchema, PlayerIdSchema]),
    source: z.enum(['mutual_like', 'set_join', 'invite_accept']),
    status: HomeMatchStatusV1Schema,
  })
  .superRefine((fact, context) => {
    const ordered = [...fact.participantIds].sort();
    if (
      ordered[0] !== fact.participantIds[0] ||
      ordered[1] !== fact.participantIds[1]
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'participantIds must use canonical PlayerId order.',
        path: ['participantIds'],
      });
    }
    if (
      fact.canMessage !==
      (fact.status === 'conversation_ready' && fact.conversationId !== null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'canMessage is authoritative only when conversation_ready has a ConversationId.',
        path: ['canMessage'],
      });
    }
  });

export const HomeMatchFactsV1Schema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  items: z.array(HomeMatchFactV1Schema),
});

export type HomeMatchFactV1 = z.infer<typeof HomeMatchFactV1Schema>;
export type HomeMatchFactsV1 = z.infer<typeof HomeMatchFactsV1Schema>;
export type HomeMatchKindV1 = z.infer<typeof HomeMatchKindV1Schema>;
export type HomeMatchStatusV1 = z.infer<typeof HomeMatchStatusV1Schema>;
