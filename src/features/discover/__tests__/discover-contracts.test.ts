import { describe, expect, it } from '@jest/globals';

import {
  DiscoverOverviewResponseSchema,
  DiscoverPlayerRecommendationSchema,
  DiscoverSetSchema,
  DiscoverVibeSchema,
  discoverContractVersion,
} from '../contracts/discover-contracts';
import {
  discoverFilterOptionsFixture,
  discoverFixtureGeneratedAt,
  discoverMetricsFixture,
  discoverPlayersFixture,
  discoverSetsFixture,
  discoverVibesFixture,
} from '../data/discover.fixture';

describe('Discover v1 contracts', () => {
  it('validates every structured fixture without presentation-only fields', () => {
    for (const vibe of discoverVibesFixture) {
      expect(() => DiscoverVibeSchema.parse(vibe)).not.toThrow();
      expect(vibe).not.toHaveProperty('interestedLabel');
      expect(vibe).not.toHaveProperty('surplusLabel');
    }
    for (const set of discoverSetsFixture) {
      expect(() => DiscoverSetSchema.parse(set)).not.toThrow();
      expect(set).not.toHaveProperty('slots');
      expect(set).not.toHaveProperty('actionTone');
      expect(set).not.toHaveProperty('actionLabel');
    }
    for (const player of discoverPlayersFixture) {
      expect(() =>
        DiscoverPlayerRecommendationSchema.parse(player),
      ).not.toThrow();
      expect(player).not.toHaveProperty('match');
      expect(player).not.toHaveProperty('subtitle');
      expect(player).not.toHaveProperty('actionLabel');
    }
  });

  it('rejects invalid occupancy', () => {
    const invalid = {
      ...discoverSetsFixture[0],
      occupancy: { capacity: 5, current: 6 },
    };
    expect(DiscoverSetSchema.safeParse(invalid).success).toBe(false);
  });

  it('requires a target Set whenever an invite is actionable', () => {
    const invalid = {
      ...discoverPlayersFixture[1],
      capabilities: {
        ...discoverPlayersFixture[1]!.capabilities,
        invite: { state: 'available' as const },
      },
    };
    expect(DiscoverPlayerRecommendationSchema.safeParse(invalid).success).toBe(
      false,
    );
  });

  it('validates the versioned overview envelope', () => {
    const response = {
      contractVersion: discoverContractVersion,
      data: {
        filterOptions: discoverFilterOptionsFixture,
        metrics: discoverMetricsFixture,
        sections: {
          players: {
            defaultSort: 'best_match',
            items: discoverPlayersFixture.slice(0, 2),
            totalCount: 2,
          },
          sets: {
            defaultSort: 'best_match',
            items: discoverSetsFixture.slice(0, 2),
            totalCount: 2,
          },
          vibes: {
            defaultSort: 'popular',
            items: discoverVibesFixture.slice(0, 3),
            totalCount: 3,
          },
        },
      },
      meta: { generatedAt: discoverFixtureGeneratedAt, requestId: 'test' },
    };
    expect(DiscoverOverviewResponseSchema.parse(response)).toEqual(response);
  });
});
