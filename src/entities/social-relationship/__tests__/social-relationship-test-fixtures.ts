import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
  PlayerIdSchema,
  type PlayerLifecycleStateV1,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';

export const viewerAccountId = '01000000-0000-4000-8000-000000000001';
export const viewerPlayerId = PlayerIdSchema.parse(
  '20000000-0000-4000-8000-000000000001',
);
export const targetPlayerId = PlayerIdSchema.parse(
  '20000000-0000-4000-8000-000000000002',
);

export function socialTestSession(
  input: Readonly<{
    accountId?: string;
    lifecyclePlayerId?: string;
    lifecycleState?: PlayerLifecycleStateV1;
    principalPlayerId?: string;
  }> = {},
): AuthSession {
  const principalPlayerId = PlayerIdSchema.parse(
    input.principalPlayerId ?? viewerPlayerId,
  );
  const lifecyclePlayerId = PlayerIdSchema.parse(
    input.lifecyclePlayerId ?? principalPlayerId,
  );
  const lifecycleState = input.lifecycleState ?? 'active';
  const active = lifecycleState === 'active';
  const accountId = input.accountId ?? viewerAccountId;

  return {
    accessToken: 'social-test-access-token',
    expiresAt: 4_102_444_800,
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      discoverable: active,
      messagingAllowed: active,
      playerId: lifecyclePlayerId,
      profileId: '30000000-0000-4000-8000-000000000001',
      state: lifecycleState,
      updatedAt: '2026-07-14T00:00:00.000Z',
      version: active ? 2 : 1,
    }),
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId,
      expiresAt: '2100-01-01T00:00:00.000Z',
      issuedAt: '2099-12-31T23:00:00.000Z',
      playerId: principalPlayerId,
      sessionId: '09000000-0000-4000-8000-000000000001',
    }),
    refreshToken: 'social-test-refresh-token',
    tokenType: 'bearer',
    user: { id: accountId },
  };
}
