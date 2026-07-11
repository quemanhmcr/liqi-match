import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DiscoverOverviewResponseSchema,
  DiscoverPlayersResponseSchema,
  DiscoverSetsResponseSchema,
  DiscoverVibesResponseSchema,
  InvitePlayerToSetCommandSchema,
  PlayerInviteReceiptSchema,
  RequestSetJoinCommandSchema,
  SetJoinRequestReceiptSchema,
} from '../contracts/discover-contracts';

const examples = resolve(process.cwd(), 'docs/contracts/examples');
const readExample = (name: string) =>
  JSON.parse(readFileSync(resolve(examples, name), 'utf8')) as unknown;

describe('documented Discover v1 examples', () => {
  it('matches every production runtime schema', () => {
    expect(() =>
      DiscoverOverviewResponseSchema.parse(
        readExample('discover-overview.response.json'),
      ),
    ).not.toThrow();
    expect(() =>
      DiscoverVibesResponseSchema.parse(
        readExample('discover-vibes.response.json'),
      ),
    ).not.toThrow();
    expect(() =>
      DiscoverSetsResponseSchema.parse(
        readExample('discover-sets.response.json'),
      ),
    ).not.toThrow();
    expect(() =>
      DiscoverPlayersResponseSchema.parse(
        readExample('discover-player-recommendations.response.json'),
      ),
    ).not.toThrow();
    expect(() =>
      RequestSetJoinCommandSchema.parse(
        readExample('request-set-join.request.json'),
      ),
    ).not.toThrow();
    expect(() =>
      SetJoinRequestReceiptSchema.parse(
        readExample('request-set-join.response.json'),
      ),
    ).not.toThrow();
    expect(() =>
      InvitePlayerToSetCommandSchema.parse(
        readExample('invite-player.request.json'),
      ),
    ).not.toThrow();
    expect(() =>
      PlayerInviteReceiptSchema.parse(
        readExample('invite-player.response.json'),
      ),
    ).not.toThrow();
  });
});
