import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  SocialRelationshipSnapshotV2Schema,
  TrustVisibilityDecisionV2Schema,
} from '@/shared/contracts/core-v2';
import {
  socialTestSession,
  targetPlayerId,
  viewerPlayerId,
} from './social-relationship-test-fixtures';

import { InMemorySocialRelationshipRepository } from '../in-memory-social-relationship-repository';
import type { RelationshipCapabilityReader } from '../social-relationship-repository';

const testAuthSession = socialTestSession();
const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v2/fixtures/provider',
);
const read = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8')) as unknown;

describe('InMemorySocialRelationshipRepository', () => {
  it('is structurally compatible with consumer RelationshipCapabilityReader', async () => {
    const repository: RelationshipCapabilityReader =
      new InMemorySocialRelationshipRepository({
        relationships: [
          SocialRelationshipSnapshotV2Schema.parse(
            read('relationship-friend.json'),
          ),
        ],
      });

    await expect(
      repository.getRelationship(testAuthSession, targetPlayerId),
    ).resolves.toMatchObject({
      capabilities: { friendshipLabel: 'friend' },
    });
  });

  it('fails closed without canonical principal/lifecycle', async () => {
    const repository = new InMemorySocialRelationshipRepository();
    const legacySession = {
      ...testAuthSession,
      lifecycle: undefined,
      principal: undefined,
      user: { id: viewerPlayerId },
    };

    await expect(
      repository.getRelationship(legacySession, targetPlayerId),
    ).rejects.toMatchObject({ code: 'relationship_identity_mismatch' });
  });

  it('does not infer friendship or trust visibility for strangers', async () => {
    const repository = new InMemorySocialRelationshipRepository();

    await expect(
      repository.getRelationship(testAuthSession, targetPlayerId),
    ).resolves.toMatchObject({
      friendship: { label: 'none' },
      capabilities: { canMessage: false },
    });
    await expect(
      repository.getTrustVisibility(testAuthSession, targetPlayerId),
    ).resolves.toMatchObject({
      canViewTrust: false,
      trustVisibility: 'friends',
    });
  });

  it('lists only viewer-owned blocks with authoritative versions', async () => {
    const blocked = SocialRelationshipSnapshotV2Schema.parse(
      read('relationship-blocked.json'),
    );
    const repository = new InMemorySocialRelationshipRepository({
      relationships: [blocked],
    });

    await expect(
      repository.listBlockedPlayers(testAuthSession),
    ).resolves.toMatchObject({
      items: [
        {
          player: { playerId: blocked.targetPlayerId },
          relationship: { version: blocked.version },
        },
      ],
      totalCount: 1,
    });
  });

  it('lists accepted and pending relationships for Social Hub without blocked rows', async () => {
    const friend = SocialRelationshipSnapshotV2Schema.parse(
      read('relationship-friend.json'),
    );
    const pendingTarget = '20000000-0000-4000-8000-000000000003';
    const pending = SocialRelationshipSnapshotV2Schema.parse({
      ...friend,
      capabilities: {
        ...friend.capabilities,
        canAcceptFriendship: false,
        canCancelFriendship: true,
        canDeclineFriendship: false,
        canInviteToSession: false,
        canMessage: false,
        canRemoveFriendship: false,
        canViewConversation: false,
        canViewPresence: false,
        friendshipLabel: 'pending_outgoing',
      },
      friendship: {
        acceptedAt: null,
        label: 'pending_outgoing',
        requestId: '42000000-0000-4000-8000-000000000003',
        requestState: 'pending',
        requestVersion: 1,
        state: 'pending',
      },
      relationshipId: '41000000-0000-4000-8000-000000000003',
      targetPlayerId: pendingTarget,
      targetPrivacy: { ...friend.targetPrivacy, playerId: pendingTarget },
      version: 1,
    });
    const blockedFixture = SocialRelationshipSnapshotV2Schema.parse(
      read('relationship-blocked.json'),
    );
    const blockedTarget = '20000000-0000-4000-8000-000000000004';
    const blocked = SocialRelationshipSnapshotV2Schema.parse({
      ...blockedFixture,
      relationshipId: '41000000-0000-4000-8000-000000000004',
      targetPlayerId: blockedTarget,
      targetPrivacy: {
        ...blockedFixture.targetPrivacy,
        playerId: blockedTarget,
      },
    });
    const repository = new InMemorySocialRelationshipRepository({
      relationships: [friend, pending, blocked],
    });

    await expect(
      repository.listRelationships(testAuthSession),
    ).resolves.toMatchObject({
      items: [
        { friendship: { label: 'friend' } },
        { friendship: { label: 'pending_outgoing' } },
      ],
      nextCursor: null,
    });
  });

  it('filters blocked relationships from friendship listing', async () => {
    const repository = new InMemorySocialRelationshipRepository({
      relationships: [
        SocialRelationshipSnapshotV2Schema.parse(
          read('relationship-friend.json'),
        ),
        SocialRelationshipSnapshotV2Schema.parse(
          read('relationship-blocked.json'),
        ),
      ],
      trustVisibility: [
        TrustVisibilityDecisionV2Schema.parse(
          read('trust-visibility-blocked.json'),
        ),
      ],
    });

    await expect(
      repository.listFriendships(testAuthSession),
    ).resolves.toMatchObject({ items: [] });
  });

  it('rejects inactive or mismatched player contexts', async () => {
    const repository = new InMemorySocialRelationshipRepository();
    await expect(
      repository.getRelationship(
        socialTestSession({ lifecycleState: 'suspended' }),
        targetPlayerId,
      ),
    ).rejects.toMatchObject({ code: 'relationship_player_not_active' });
    await expect(
      repository.getRelationship(
        {
          ...testAuthSession,
          lifecycle: {
            ...testAuthSession.lifecycle!,
            playerId: targetPlayerId,
          },
        },
        targetPlayerId,
      ),
    ).rejects.toMatchObject({ code: 'relationship_identity_mismatch' });
  });
});
