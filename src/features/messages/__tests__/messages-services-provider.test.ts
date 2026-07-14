import { describe, expect, it } from '@jest/globals';

import { conversationTransportSession } from '@/features/messages/runtime/MessagesServicesProvider';
import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
} from '../../../../contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';

const baseSession: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 2_000_000_000,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: { id: '01000000-0000-4000-8000-000000000401' },
};

function authoritativeSession(
  state: 'active' | 'deleted' | 'deleting' | 'suspended',
  messagingAllowed: boolean,
): AuthSession {
  return {
    ...baseSession,
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId: baseSession.user.id,
      playerId: '20000000-0000-4000-8000-000000000401',
      sessionId: '09000000-0000-4000-8000-000000000401',
      issuedAt: '2026-07-14T00:00:00.000Z',
      expiresAt: '2033-05-18T03:33:20.000Z',
    }),
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      playerId: '20000000-0000-4000-8000-000000000401',
      profileId: '30000000-0000-4000-8000-000000000401',
      state,
      version: 4,
      discoverable: state === 'active',
      messagingAllowed,
      updatedAt: '2026-07-14T00:00:00.000Z',
    }),
  };
}

describe('conversation transport session policy', () => {
  it('binds only an active authoritative player with messaging capability', () => {
    const active = authoritativeSession('active', true);
    expect(conversationTransportSession(active)).toBe(active);
  });

  it.each([
    authoritativeSession('suspended', false),
    authoritativeSession('deleting', false),
    authoritativeSession('deleted', false),
    authoritativeSession('active', false),
    { ...authoritativeSession('active', true), lifecycle: null },
  ])(
    'closes the transport for unauthorized production lifecycle state',
    (session) => {
      expect(conversationTransportSession(session)).toBeNull();
    },
  );

  it('keeps legacy/simulation sessions compatible without inventing lifecycle state', () => {
    expect(conversationTransportSession(baseSession)).toBe(baseSession);
  });
});
