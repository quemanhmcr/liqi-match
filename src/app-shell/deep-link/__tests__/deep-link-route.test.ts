import { describe, expect, it } from '@jest/globals';

import { appRoutes } from '@/app-shell/navigation/routes';
import { DeepLinkV1Schema } from '@/shared/contracts/core-v1';

import { routeForDeepLinkV1 } from '../deep-link-route';

describe('routeForDeepLinkV1 activity destinations', () => {
  it('preserves the exact session for post-session feedback', () => {
    const deepLink = DeepLinkV1Schema.parse({
      sessionId: '42000000-0000-4000-8000-000000000001',
      target: 'session_feedback',
    });
    if (deepLink.target !== 'session_feedback') {
      throw new Error('Expected a session feedback deep link.');
    }
    expect(routeForDeepLinkV1(deepLink)).toEqual(
      appRoutes.trust.feedback(deepLink.sessionId),
    );
  });

  it('returns the canonical Home route for repeat-play activity', () => {
    expect(routeForDeepLinkV1(DeepLinkV1Schema.parse({ target: 'home' }))).toBe(
      appRoutes.main.home,
    );
  });
});
