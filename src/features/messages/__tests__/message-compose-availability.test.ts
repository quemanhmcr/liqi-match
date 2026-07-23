import { describe, expect, it } from '@jest/globals';

import {
  SocialRelationshipSnapshotV2Schema,
  type SocialRelationshipSnapshotV2,
} from '@/shared/contracts/core-v2';

import {
  canOpenMessageComposeConversation,
  resolveMessageComposeAvailability,
} from '../model/message-compose-availability';

function relationship({
  canMessage = true,
  targetPlayerId = '20000000-0000-4000-8000-000000000002',
}: {
  canMessage?: boolean;
  targetPlayerId?: string;
} = {}): SocialRelationshipSnapshotV2 {
  return SocialRelationshipSnapshotV2Schema.parse({
    block: { targetBlocksViewer: false, viewerBlocksTarget: false },
    capabilities: {
      blocked: false,
      canAcceptFriendship: false,
      canBlock: true,
      canCancelFriendship: false,
      canDeclineFriendship: false,
      canDiscover: true,
      canInviteToSession: true,
      canMessage,
      canMute: true,
      canRemoveFriendship: true,
      canReport: true,
      canRequestFriendship: false,
      canUnblock: false,
      canUnmute: false,
      canViewConversation: canMessage,
      canViewPresence: true,
      canViewProfile: true,
      friendshipLabel: 'friend',
      muted: false,
    },
    contractVersion: 2,
    friendship: {
      acceptedAt: '2026-07-14T10:00:00.000Z',
      label: 'friend',
      requestId: '42000000-0000-4000-8000-000000000002',
      requestState: 'accepted',
      requestVersion: 2,
      state: 'accepted',
    },
    mute: { viewerMutedTarget: false },
    relationshipId: '41000000-0000-4000-8000-000000000002',
    targetPlayerId,
    targetPrivacy: {
      contractVersion: 2,
      friendshipRequests: 'everyone',
      playerId: targetPlayerId,
      presenceVisibility: 'friends',
      profileVisibility: 'friends',
      sessionInvites: 'friends',
      trustVisibility: 'friends',
      updatedAt: '2026-07-14T09:00:00.000Z',
      version: 1,
    },
    updatedAt: '2026-07-14T10:00:00.000Z',
    version: 2,
    viewerPlayerId: '20000000-0000-4000-8000-000000000001',
  });
}

describe('message compose availability', () => {
  it('prioritizes loading and error before candidate inspection', () => {
    expect(
      resolveMessageComposeAvailability({
        error: false,
        loading: true,
        relationships: [relationship()],
      }),
    ).toEqual({ state: 'loading' });
    expect(
      resolveMessageComposeAvailability({
        error: true,
        loading: false,
        relationships: [relationship()],
      }),
    ).toEqual({ state: 'error' });
  });

  it('exposes only accepted friendships with messaging authority', () => {
    expect(
      resolveMessageComposeAvailability({
        error: false,
        loading: false,
        relationships: [
          relationship({
            canMessage: false,
            targetPlayerId: '20000000-0000-4000-8000-000000000003',
          }),
          relationship(),
        ],
      }),
    ).toEqual({
      playerIds: ['20000000-0000-4000-8000-000000000002'],
      state: 'ready',
    });
  });

  it('rechecks the selected player against the latest ready authority', () => {
    const ready = resolveMessageComposeAvailability({
      error: false,
      loading: false,
      relationships: [relationship()],
    });
    const playerId = relationship().targetPlayerId;

    expect(canOpenMessageComposeConversation(ready, playerId)).toBe(true);
    expect(
      canOpenMessageComposeConversation({ state: 'empty' }, playerId),
    ).toBe(false);
  });

  it('returns an intentional empty state instead of opening a blank picker', () => {
    expect(
      resolveMessageComposeAvailability({
        error: false,
        loading: false,
        relationships: [],
      }),
    ).toEqual({ state: 'empty' });
  });
});
