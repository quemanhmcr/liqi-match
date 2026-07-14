import { describe, expect, it } from '@jest/globals';

import {
  decideDeepLinkAccess,
  routeForDeepLinkV1,
} from '@/app-shell/deep-link';
import {
  DeepLinkV1Schema,
  type PlayerLifecycleStateV1,
} from '@/shared/contracts/core-v1';

describe('deep-link auth and lifecycle decisions', () => {
  it('preserves a logged-out destination for post-login routing', () => {
    expect(
      decideDeepLinkAccess({
        authenticated: false,
        deepLink: DeepLinkV1Schema.parse({
          conversationId: '60000000-0000-4000-8000-000000000001',
          target: 'conversation',
        }),
        playerLifecycle: null,
        targetExists: null,
      }),
    ).toEqual({ kind: 'login-then-destination' });
  });

  it('falls back safely when the authoritative target expired', () => {
    expect(
      decideDeepLinkAccess({
        authenticated: true,
        deepLink: DeepLinkV1Schema.parse({
          matchId: '50000000-0000-4000-8000-000000000001',
          target: 'match',
        }),
        playerLifecycle: 'active',
        targetExists: false,
      }),
    ).toEqual({ kind: 'home-safe-fallback', reason: 'expired-target' });
  });

  it.each<PlayerLifecycleStateV1>(['suspended', 'deleting', 'deleted'])(
    'does not route a %s player into a domain destination',
    (playerLifecycle) => {
      expect(
        decideDeepLinkAccess({
          authenticated: true,
          deepLink: DeepLinkV1Schema.parse({
            conversationId: '60000000-0000-4000-8000-000000000001',
            target: 'conversation',
          }),
          playerLifecycle,
          targetExists: true,
        }),
      ).toEqual({
        kind: 'home-safe-fallback',
        reason: 'player-unavailable',
      });
    },
  );

  it.each<PlayerLifecycleStateV1>(['registered', 'onboarding'])(
    'keeps the destination pending while lifecycle is %s',
    (playerLifecycle) => {
      expect(
        decideDeepLinkAccess({
          authenticated: true,
          deepLink: DeepLinkV1Schema.parse({
            matchId: '50000000-0000-4000-8000-000000000001',
            target: 'match',
          }),
          playerLifecycle,
          targetExists: true,
        }),
      ).toEqual({ kind: 'defer-lifecycle' });
    },
  );

  it('maps semantic destinations without generic boundary ids', () => {
    expect(
      routeForDeepLinkV1(
        DeepLinkV1Schema.parse({
          conversationId: '60000000-0000-4000-8000-000000000001',
          target: 'conversation',
        }),
      ),
    ).toEqual({
      params: { conversationId: '60000000-0000-4000-8000-000000000001' },
      pathname: '/messages/[conversationId]',
    });
  });
});
