import { describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
  PlayerIdSchema,
} from '@/shared/contracts/core-v1';
import {
  AcceptFriendshipCommandV2Schema,
  BlockPlayerCommandV2Schema,
  PlayerPrivacyCommandReceiptV2Schema,
  RequestFriendshipCommandV2Schema,
  SocialRelationshipCommandReceiptV2Schema,
  SocialRelationshipSnapshotV2Schema,
  UnblockPlayerCommandV2Schema,
  UpdatePlayerPrivacyCommandV2Schema,
  type PlayerPrivacySettingsV2,
} from '@/shared/contracts/core-v2';

import { SocialCommandCoordinator } from '../social-command-coordinator';
import { SocialCommandJournal } from '../social-command-journal';

const accountA = '01000000-0000-4000-8000-000000001801';
const accountB = '01000000-0000-4000-8000-000000001802';
const playerA = '20000000-0000-4000-8000-000000001801';
const playerB = '20000000-0000-4000-8000-000000001802';
const profileA = '30000000-0000-4000-8000-000000001801';
const profileB = '30000000-0000-4000-8000-000000001802';
const requestId = '42000000-0000-4000-8000-000000001801';
const relationshipId = '41000000-0000-4000-8000-000000001801';
const now = '2026-07-14T18:00:00.000Z';

function session(
  accountId: string,
  playerId: string,
  profileId: string,
  sessionId: string,
): AuthSession {
  return {
    accessToken: `token:${accountId}`,
    expiresAt: 4_102_444_800,
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      discoverable: true,
      messagingAllowed: true,
      playerId,
      profileId,
      state: 'active',
      updatedAt: now,
      version: 2,
    }),
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId,
      expiresAt: '2100-01-01T00:00:00.000Z',
      issuedAt: '2099-12-31T23:00:00.000Z',
      playerId,
      sessionId,
    }),
    refreshToken: `refresh:${accountId}`,
    tokenType: 'bearer',
    user: { id: accountId },
  };
}

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => void values.delete(key)),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

function journal(seed: number) {
  let sequence = seed;
  return new SocialCommandJournal({
    clientPlatform: seed % 2 === 0 ? 'android' : 'ios',
    clientVersion: '2.0.0-e2e',
    createUuid: () => {
      sequence += 1;
      return `43000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
    },
    now: () => new Date(now),
    storage: storage(),
  });
}

class TwoPlayerAuthority {
  private relationshipVersion = 0;
  private friendshipState: 'none' | 'pending' | 'friend' | 'removed' = 'none';
  private requesterPlayerId: string | null = null;
  private recipientPlayerId: string | null = null;
  private blockByPlayerId: string | null = null;
  private readonly privacy = new Map<string, PlayerPrivacySettingsV2>([
    [playerA, this.defaultPrivacy(playerA)],
    [playerB, this.defaultPrivacy(playerB)],
  ]);

  async getRelationship(auth: AuthSession, targetPlayerId: string) {
    return this.snapshot(this.actor(auth), targetPlayerId);
  }

  async requestFriendship(auth: AuthSession, rawCommand: unknown) {
    const actorPlayerId = this.actor(auth);
    const command = RequestFriendshipCommandV2Schema.parse(rawCommand);
    this.assertTarget(actorPlayerId, command.targetPlayerId);
    this.assertVersion(command.expectedRelationshipVersion);
    if (this.blockByPlayerId) throw socialError('relationship_blocked');
    if (
      this.privacy.get(command.targetPlayerId)?.friendshipRequests === 'nobody'
    ) {
      throw socialError('friendship_request_forbidden');
    }
    if (this.friendshipState === 'friend') {
      throw socialError('friendship_already_active');
    }
    this.friendshipState = 'pending';
    this.requesterPlayerId = actorPlayerId;
    this.recipientPlayerId = command.targetPlayerId;
    this.relationshipVersion += 1;
    return this.relationshipReceipt(
      command.correlationId,
      actorPlayerId,
      command.targetPlayerId,
      '43000000-0000-4000-8000-000000001811',
    );
  }

  async acceptFriendship(auth: AuthSession, rawCommand: unknown) {
    const actorPlayerId = this.actor(auth);
    const command = AcceptFriendshipCommandV2Schema.parse(rawCommand);
    this.assertVersion(command.expectedRelationshipVersion);
    if (
      this.friendshipState !== 'pending' ||
      actorPlayerId !== this.recipientPlayerId ||
      command.friendshipRequestId !== requestId ||
      command.expectedRequestVersion !== 1
    ) {
      throw socialError('friendship_request_not_found');
    }
    this.friendshipState = 'friend';
    this.relationshipVersion += 1;
    return this.relationshipReceipt(
      command.correlationId,
      actorPlayerId,
      this.other(actorPlayerId),
      '43000000-0000-4000-8000-000000001812',
    );
  }

  async blockPlayer(auth: AuthSession, rawCommand: unknown) {
    const actorPlayerId = this.actor(auth);
    const command = BlockPlayerCommandV2Schema.parse(rawCommand);
    this.assertTarget(actorPlayerId, command.targetPlayerId);
    this.assertVersion(command.expectedRelationshipVersion);
    if (this.blockByPlayerId) throw socialError('block_already_active');
    this.blockByPlayerId = actorPlayerId;
    if (this.friendshipState === 'friend') this.friendshipState = 'removed';
    if (this.friendshipState === 'pending') this.friendshipState = 'none';
    this.relationshipVersion += 1;
    return this.relationshipReceipt(
      command.correlationId,
      actorPlayerId,
      command.targetPlayerId,
      '43000000-0000-4000-8000-000000001813',
    );
  }

  async unblockPlayer(auth: AuthSession, rawCommand: unknown) {
    const actorPlayerId = this.actor(auth);
    const command = UnblockPlayerCommandV2Schema.parse(rawCommand);
    this.assertTarget(actorPlayerId, command.targetPlayerId);
    this.assertVersion(command.expectedRelationshipVersion);
    if (this.blockByPlayerId !== actorPlayerId) {
      throw socialError('block_not_found');
    }
    this.blockByPlayerId = null;
    this.relationshipVersion += 1;
    return this.relationshipReceipt(
      command.correlationId,
      actorPlayerId,
      command.targetPlayerId,
      '43000000-0000-4000-8000-000000001814',
    );
  }

  async updatePrivacy(auth: AuthSession, rawCommand: unknown) {
    const actorPlayerId = this.actor(auth);
    const command = UpdatePlayerPrivacyCommandV2Schema.parse(rawCommand);
    const current = this.privacy.get(actorPlayerId)!;
    if (command.expectedPrivacyVersion !== current.version) {
      throw socialError('privacy_version_conflict');
    }
    const next = {
      contractVersion: 2 as const,
      friendshipRequests: command.friendshipRequests,
      playerId: actorPlayerId,
      presenceVisibility: command.presenceVisibility,
      profileVisibility: command.profileVisibility,
      sessionInvites: command.sessionInvites,
      trustVisibility: command.trustVisibility,
      updatedAt: now,
      version: current.version + 1,
    };
    this.privacy.set(actorPlayerId, next);
    return PlayerPrivacyCommandReceiptV2Schema.parse({
      correlationId: command.correlationId,
      eventIds: ['43000000-0000-4000-8000-000000001815'],
      privacy: next,
      repeated: false,
    });
  }

  async getPrivacy(auth: AuthSession) {
    return this.privacy.get(this.actor(auth))!;
  }

  async getTrustVisibility(auth: AuthSession, targetPlayerId: string) {
    const snapshot = this.snapshot(this.actor(auth), targetPlayerId);
    return {
      blocked: snapshot.capabilities.blocked,
      canViewTrust:
        !snapshot.capabilities.blocked &&
        snapshot.friendship.label === 'friend',
      contractVersion: 2 as const,
      privacyVersion: snapshot.targetPrivacy.version,
      relationshipVersion: snapshot.version,
      targetPlayerId,
      trustVisibility: snapshot.targetPrivacy.trustVisibility,
      viewerPlayerId: snapshot.viewerPlayerId,
    };
  }

  private snapshot(viewerPlayerId: string, targetPlayerId: string) {
    this.assertTarget(viewerPlayerId, targetPlayerId);
    const blocked = this.blockByPlayerId !== null;
    const viewerBlocksTarget = this.blockByPlayerId === viewerPlayerId;
    const targetBlocksViewer = this.blockByPlayerId === targetPlayerId;
    const pending = this.friendshipState === 'pending';
    const friend = this.friendshipState === 'friend';
    const label = friend
      ? 'friend'
      : pending
        ? this.requesterPlayerId === viewerPlayerId
          ? 'pending_outgoing'
          : 'pending_incoming'
        : 'none';
    const targetPrivacy = this.privacy.get(targetPlayerId)!;
    return SocialRelationshipSnapshotV2Schema.parse({
      block: { targetBlocksViewer, viewerBlocksTarget },
      capabilities: {
        blocked,
        canAcceptFriendship: !blocked && label === 'pending_incoming',
        canBlock: !blocked,
        canCancelFriendship: !blocked && label === 'pending_outgoing',
        canDeclineFriendship: !blocked && label === 'pending_incoming',
        canDiscover: !blocked,
        canInviteToSession: !blocked && friend,
        canMessage: !blocked && friend,
        canMute: !blocked,
        canRemoveFriendship: !blocked && friend,
        canReport: true,
        canRequestFriendship:
          !blocked &&
          !pending &&
          !friend &&
          targetPrivacy.friendshipRequests !== 'nobody',
        canUnblock: viewerBlocksTarget,
        canUnmute: false,
        canViewConversation: !blocked && friend,
        canViewPresence: !blocked && friend,
        canViewProfile: !blocked,
        friendshipLabel: label,
        muted: false,
      },
      contractVersion: 2,
      friendship: {
        acceptedAt: friend ? now : null,
        label,
        requestId: pending || friend ? requestId : null,
        requestState: pending ? 'pending' : friend ? 'accepted' : null,
        requestVersion: pending || friend ? 1 : null,
        state: friend
          ? 'accepted'
          : pending
            ? 'pending'
            : this.friendshipState === 'removed'
              ? 'removed'
              : 'none',
      },
      mute: { viewerMutedTarget: false },
      relationshipId,
      targetPlayerId,
      targetPrivacy,
      updatedAt: now,
      version: this.relationshipVersion,
      viewerPlayerId,
    });
  }

  private relationshipReceipt(
    correlationId: string,
    viewerPlayerId: string,
    targetPlayerId: string,
    eventId: string,
  ) {
    return SocialRelationshipCommandReceiptV2Schema.parse({
      correlationId,
      eventIds: [eventId],
      relationship: this.snapshot(viewerPlayerId, targetPlayerId),
      repeated: false,
    });
  }

  private actor(auth: AuthSession) {
    const playerId = auth.principal?.playerId;
    if (!playerId || auth.lifecycle?.playerId !== playerId) {
      throw socialError('relationship_identity_mismatch');
    }
    if (auth.lifecycle.state !== 'active') {
      throw socialError('relationship_player_not_active');
    }
    return playerId;
  }

  private assertTarget(actorPlayerId: string, targetPlayerId: string) {
    if (actorPlayerId === targetPlayerId) {
      throw socialError('relationship_self_forbidden');
    }
    if (![playerA, playerB].includes(targetPlayerId)) {
      throw socialError('relationship_target_not_found');
    }
  }

  private assertVersion(expected: number) {
    if (expected !== this.relationshipVersion) {
      throw socialError('relationship_version_conflict');
    }
  }

  private other(playerId: string) {
    return playerId === playerA ? playerB : playerA;
  }

  private defaultPrivacy(playerId: string): PlayerPrivacySettingsV2 {
    return {
      contractVersion: 2,
      friendshipRequests: 'everyone',
      playerId: PlayerIdSchema.parse(playerId),
      presenceVisibility: 'friends',
      profileVisibility: 'everyone',
      sessionInvites: 'friends',
      trustVisibility: 'friends',
      updatedAt: now,
      version: 1,
    };
  }

  // Unused command ports deliberately fail to catch accidental journey drift.
  async cancelFriendship() {
    throw new Error('Unexpected cancelFriendship');
  }
  async declineFriendship() {
    throw new Error('Unexpected declineFriendship');
  }
  async removeFriendship() {
    throw new Error('Unexpected removeFriendship');
  }
  async mutePlayer() {
    throw new Error('Unexpected mutePlayer');
  }
  async unmutePlayer() {
    throw new Error('Unexpected unmutePlayer');
  }
  async reportPlayer() {
    throw new Error('Unexpected reportPlayer');
  }
  async reportMessage() {
    throw new Error('Unexpected reportMessage');
  }
}

function socialError(code: string) {
  return Object.assign(new Error(code), { code, retryable: false });
}

describe('two-player social journey', () => {
  it('keeps A and B consistent through request, accept, block, unblock and privacy denial', async () => {
    const authority = new TwoPlayerAuthority();
    const sessionA = session(
      accountA,
      playerA,
      profileA,
      '09000000-0000-4000-8000-000000001801',
    );
    const sessionB = session(
      accountB,
      playerB,
      profileB,
      '09000000-0000-4000-8000-000000001802',
    );
    const coordinatorA = new SocialCommandCoordinator(
      {
        friendship: authority as never,
        privacy: authority as never,
        safety: authority as never,
      },
      journal(1801),
    );
    const coordinatorB = new SocialCommandCoordinator(
      {
        friendship: authority as never,
        privacy: authority as never,
        safety: authority as never,
      },
      journal(2801),
    );

    await expect(
      authority.getRelationship(sessionA, playerB),
    ).resolves.toMatchObject({
      version: 0,
      friendship: { label: 'none' },
      capabilities: { canMessage: false, canRequestFriendship: true },
    });

    const requested = await coordinatorA.requestFriendship({
      expectedRelationshipVersion: 0,
      session: sessionA,
      targetPlayerId: playerB,
    });
    expect(requested.relationship.friendship.label).toBe('pending_outgoing');
    await expect(
      authority.getRelationship(sessionB, playerA),
    ).resolves.toMatchObject({
      version: 1,
      friendship: { label: 'pending_incoming', requestId },
      capabilities: { canAcceptFriendship: true, canMessage: false },
    });

    const accepted = await coordinatorB.acceptFriendship({
      expectedRelationshipVersion: 1,
      expectedRequestVersion: 1,
      friendshipRequestId: requestId,
      session: sessionB,
    });
    expect(accepted.relationship.friendship.label).toBe('friend');
    await expect(
      authority.getRelationship(sessionA, playerB),
    ).resolves.toMatchObject({
      version: 2,
      friendship: { label: 'friend' },
      capabilities: {
        canInviteToSession: true,
        canMessage: true,
        canViewConversation: true,
      },
    });
    await expect(
      authority.getRelationship(sessionB, playerA),
    ).resolves.toMatchObject({
      version: 2,
      friendship: { label: 'friend' },
      capabilities: { canMessage: true },
    });

    const blocked = await coordinatorA.blockPlayer({
      expectedRelationshipVersion: 2,
      reasonCode: 'user_safety',
      session: sessionA,
      targetPlayerId: playerB,
    });
    expect(blocked.relationship).toMatchObject({
      version: 3,
      block: { viewerBlocksTarget: true },
      friendship: { state: 'removed' },
      capabilities: {
        blocked: true,
        canMessage: false,
        canViewProfile: false,
      },
    });
    await expect(
      authority.getRelationship(sessionB, playerA),
    ).resolves.toMatchObject({
      version: 3,
      block: { targetBlocksViewer: true },
      capabilities: {
        blocked: true,
        canMessage: false,
        canViewProfile: false,
      },
    });

    const unblocked = await coordinatorA.unblockPlayer({
      expectedRelationshipVersion: 3,
      session: sessionA,
      targetPlayerId: playerB,
    });
    expect(unblocked.relationship).toMatchObject({
      version: 4,
      friendship: { state: 'removed', label: 'none' },
      capabilities: {
        blocked: false,
        canMessage: false,
        canRequestFriendship: true,
      },
    });
    await expect(
      authority.getRelationship(sessionB, playerA),
    ).resolves.toMatchObject({
      version: 4,
      friendship: { state: 'removed', label: 'none' },
      capabilities: { canMessage: false },
    });

    await coordinatorB.updatePrivacy({
      expectedPrivacyVersion: 1,
      privacy: {
        friendshipRequests: 'nobody',
        presenceVisibility: 'friends',
        profileVisibility: 'everyone',
        sessionInvites: 'friends',
        trustVisibility: 'friends',
      },
      session: sessionB,
    });
    await expect(
      coordinatorA.requestFriendship({
        expectedRelationshipVersion: 4,
        session: sessionA,
        targetPlayerId: playerB,
      }),
    ).rejects.toMatchObject({ code: 'friendship_request_forbidden' });
    await expect(
      authority.getRelationship(sessionA, playerB),
    ).resolves.toMatchObject({
      version: 4,
      targetPrivacy: { friendshipRequests: 'nobody', version: 2 },
      capabilities: { canRequestFriendship: false },
    });
  });
});
