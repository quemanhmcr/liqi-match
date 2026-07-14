import { describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import { SupabaseSocialRelationshipRepository } from '../supabase-social-relationship-repository';

import {
  socialTestSession,
  targetPlayerId,
  viewerPlayerId,
} from './social-relationship-test-fixtures';

const testAuthSession = socialTestSession();
const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v2/fixtures/provider',
);
const read = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8')) as unknown;

describe('SupabaseSocialRelationshipRepository', () => {
  it('implements the exact RelationshipCapabilityReader RPC seam', async () => {
    const rpc = jest.fn(async () => read('relationship-friend.json'));
    const repository = new SupabaseSocialRelationshipRepository(rpc);

    await expect(
      repository.getRelationship(testAuthSession, targetPlayerId),
    ).resolves.toMatchObject({
      targetPlayerId,
      viewerPlayerId,
      capabilities: { friendshipLabel: 'friend' },
    });
    expect(rpc).toHaveBeenCalledWith('get_relationship_v2', testAuthSession, {
      p_target_player_id: targetPlayerId,
    });
  });

  it('reads explicit trust visibility instead of inferring from profile data', async () => {
    const rpc = jest.fn(async () => read('trust-visibility-friend.json'));
    const repository = new SupabaseSocialRelationshipRepository(rpc);

    await expect(
      repository.getTrustVisibility(testAuthSession, targetPlayerId),
    ).resolves.toMatchObject({
      canViewTrust: true,
      trustVisibility: 'friends',
    });
    expect(rpc).toHaveBeenCalledWith(
      'get_trust_visibility_v2',
      testAuthSession,
      { p_target_player_id: targetPlayerId },
    );
  });

  it('normalizes friendship pagination and rejects contract drift', async () => {
    const friend = read('relationship-friend.json');
    const rpc = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({
        contractVersion: 2,
        items: [friend],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ contractVersion: 3, items: [] });
    const repository = new SupabaseSocialRelationshipRepository(rpc);

    await expect(
      repository.listFriendships(testAuthSession, { limit: 500 }),
    ).resolves.toMatchObject({ items: [friend], nextCursor: null });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'list_friendships_v2',
      testAuthSession,
      { p_after_player_id: null, p_limit: 100 },
    );
    await expect(repository.listFriendships(testAuthSession)).rejects.toThrow();
  });
});
