import { z } from 'zod';
import {
  AccountIdSchema,
  PlayerIdSchema,
  SessionIdSchema,
} from './semantic-ids';

export const AuthenticatedPrincipalV1Schema = z
  .object({
    accountId: AccountIdSchema,
    playerId: PlayerIdSchema.nullable(),
    sessionId: SessionIdSchema,
    issuedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .superRefine((principal, context) => {
    if (Date.parse(principal.expiresAt) <= Date.parse(principal.issuedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'expiresAt must be after issuedAt',
        path: ['expiresAt'],
      });
    }
  });

export type AuthenticatedPrincipalV1 = z.infer<
  typeof AuthenticatedPrincipalV1Schema
>;

export function isPrincipalExpired(
  principal: AuthenticatedPrincipalV1,
  now: Date,
) {
  return Date.parse(principal.expiresAt) <= now.getTime();
}
