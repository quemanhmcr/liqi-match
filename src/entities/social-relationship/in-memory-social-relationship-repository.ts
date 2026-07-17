import {
  BlockedPlayerListPageV2Schema,
  FriendshipListPageV2Schema,
  SocialRelationshipListPageV2Schema,
  SocialRelationshipSnapshotV2Schema,
  TrustVisibilityDecisionV2Schema,
  type SocialRelationshipSnapshotV2,
  type TrustVisibilityDecisionV2,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';

import type { SocialRelationshipRepository } from './social-relationship-repository';

type Seed = Readonly<{
  relationships?: readonly SocialRelationshipSnapshotV2[];
  trustVisibility?: readonly TrustVisibilityDecisionV2[];
}>;

export class InMemorySocialRelationshipRepository implements SocialRelationshipRepository {
  private readonly relationships = new Map<
    string,
    SocialRelationshipSnapshotV2
  >();
  private readonly trustVisibility = new Map<
    string,
    TrustVisibilityDecisionV2
  >();

  constructor(seed: Seed = {}) {
    for (const relationship of seed.relationships ?? []) {
      const parsed = SocialRelationshipSnapshotV2Schema.parse(relationship);
      this.relationships.set(
        directionalKey(parsed.viewerPlayerId, parsed.targetPlayerId),
        parsed,
      );
    }
    for (const decision of seed.trustVisibility ?? []) {
      const parsed = TrustVisibilityDecisionV2Schema.parse(decision);
      this.trustVisibility.set(
        directionalKey(parsed.viewerPlayerId, parsed.targetPlayerId),
        parsed,
      );
    }
  }

  async getRelationship(session: AuthSession, targetPlayerId: string) {
    const viewerPlayerId = requireActiveCanonicalPlayer(session);
    assertDistinctPlayers(viewerPlayerId, targetPlayerId);
    return (
      this.relationships.get(directionalKey(viewerPlayerId, targetPlayerId)) ??
      createStrangerSnapshot(viewerPlayerId, targetPlayerId)
    );
  }

  async getTrustVisibility(session: AuthSession, targetPlayerId: string) {
    const viewerPlayerId = requireActiveCanonicalPlayer(session);
    assertDistinctPlayers(viewerPlayerId, targetPlayerId);
    const key = directionalKey(viewerPlayerId, targetPlayerId);
    const seeded = this.trustVisibility.get(key);
    if (seeded) return seeded;

    const relationship = await this.getRelationship(session, targetPlayerId);
    const blocked = relationship.capabilities.blocked;
    return TrustVisibilityDecisionV2Schema.parse({
      blocked,
      canViewTrust: !blocked && relationship.friendship.label === 'friend',
      contractVersion: 2,
      privacyVersion: relationship.targetPrivacy.version,
      relationshipVersion: relationship.version,
      targetPlayerId,
      trustVisibility: 'friends',
      viewerPlayerId,
    });
  }

  async listBlockedPlayers(
    session: AuthSession,
    input: Readonly<{ afterPlayerId?: string | null; limit?: number }> = {},
  ) {
    const viewerPlayerId = requireActiveCanonicalPlayer(session);
    const limit = normalizeLimit(input.limit);
    const ordered = [...this.relationships.values()]
      .filter(
        (relationship) =>
          relationship.viewerPlayerId === viewerPlayerId &&
          relationship.block.viewerBlocksTarget &&
          (!input.afterPlayerId ||
            relationship.targetPlayerId > input.afterPlayerId),
      )
      .sort((left, right) =>
        left.targetPlayerId.localeCompare(right.targetPlayerId),
      );
    const page = ordered.slice(0, limit);
    return BlockedPlayerListPageV2Schema.parse({
      contractVersion: 2,
      items: page.map((relationship) => ({
        blockedAt: relationship.updatedAt,
        player: {
          avatarAssetId: null,
          displayName: null,
          playerId: relationship.targetPlayerId,
          profileId: null,
        },
        reasonCode: null,
        relationship,
      })),
      nextCursor:
        ordered.length > limit ? (page.at(-1)?.targetPlayerId ?? null) : null,
      totalCount: ordered.length,
    });
  }

  async listRelationships(
    session: AuthSession,
    input: Readonly<{ afterPlayerId?: string | null; limit?: number }> = {},
  ) {
    const viewerPlayerId = requireActiveCanonicalPlayer(session);
    const limit = normalizeLimit(input.limit);
    const visibleLabels = new Set([
      'friend',
      'pending_incoming',
      'pending_outgoing',
    ]);
    const ordered = [...this.relationships.values()]
      .filter(
        (relationship) =>
          relationship.viewerPlayerId === viewerPlayerId &&
          visibleLabels.has(relationship.friendship.label) &&
          !relationship.capabilities.blocked &&
          (!input.afterPlayerId ||
            relationship.targetPlayerId > input.afterPlayerId),
      )
      .sort((left, right) =>
        left.targetPlayerId.localeCompare(right.targetPlayerId),
      );
    const items = ordered.slice(0, limit);
    return SocialRelationshipListPageV2Schema.parse({
      contractVersion: 2,
      items,
      nextCursor:
        ordered.length > limit ? (items.at(-1)?.targetPlayerId ?? null) : null,
    });
  }

  async listFriendships(
    session: AuthSession,
    input: Readonly<{ afterPlayerId?: string | null; limit?: number }> = {},
  ) {
    const viewerPlayerId = requireActiveCanonicalPlayer(session);
    const limit = normalizeLimit(input.limit);
    const ordered = [...this.relationships.values()]
      .filter(
        (relationship) =>
          relationship.viewerPlayerId === viewerPlayerId &&
          relationship.friendship.label === 'friend' &&
          !relationship.capabilities.blocked &&
          (!input.afterPlayerId ||
            relationship.targetPlayerId > input.afterPlayerId),
      )
      .sort((left, right) =>
        left.targetPlayerId.localeCompare(right.targetPlayerId),
      );
    const items = ordered.slice(0, limit);
    return FriendshipListPageV2Schema.parse({
      contractVersion: 2,
      items,
      nextCursor:
        ordered.length > limit ? (items.at(-1)?.targetPlayerId ?? null) : null,
    });
  }
}

function createStrangerSnapshot(
  viewerPlayerId: string,
  targetPlayerId: string,
): SocialRelationshipSnapshotV2 {
  const now = '1970-01-01T00:00:00.000Z';
  return SocialRelationshipSnapshotV2Schema.parse({
    block: {
      targetBlocksViewer: false,
      viewerBlocksTarget: false,
    },
    capabilities: {
      blocked: false,
      canAcceptFriendship: false,
      canBlock: true,
      canCancelFriendship: false,
      canDeclineFriendship: false,
      canDiscover: true,
      canInviteToSession: false,
      canMessage: false,
      canMute: true,
      canRemoveFriendship: false,
      canReport: true,
      canRequestFriendship: true,
      canUnblock: false,
      canUnmute: false,
      canViewConversation: false,
      canViewPresence: false,
      canViewProfile: true,
      friendshipLabel: 'none',
      muted: false,
    },
    contractVersion: 2,
    friendship: {
      acceptedAt: null,
      label: 'none',
      requestId: null,
      requestState: null,
      requestVersion: null,
      state: 'none',
    },
    mute: { viewerMutedTarget: false },
    relationshipId: deterministicRelationshipId(viewerPlayerId, targetPlayerId),
    targetPlayerId,
    targetPrivacy: {
      contractVersion: 2,
      friendshipRequests: 'everyone',
      playerId: targetPlayerId,
      presenceVisibility: 'friends',
      profileVisibility: 'everyone',
      sessionInvites: 'friends',
      updatedAt: now,
      version: 1,
    },
    updatedAt: now,
    version: 0,
    viewerPlayerId,
  });
}

function requireActiveCanonicalPlayer(session: AuthSession) {
  const playerId = session.principal?.playerId;
  if (!playerId || !session.lifecycle) {
    throw socialError(
      'relationship_identity_mismatch',
      'A canonical PlayerId and lifecycle are required.',
    );
  }
  if (session.lifecycle.playerId !== playerId) {
    throw socialError(
      'relationship_identity_mismatch',
      'Principal and lifecycle PlayerId must match.',
    );
  }
  if (session.lifecycle.state !== 'active') {
    throw socialError(
      'relationship_player_not_active',
      'The player lifecycle must be active.',
    );
  }
  return playerId;
}

function assertDistinctPlayers(viewerPlayerId: string, targetPlayerId: string) {
  if (viewerPlayerId === targetPlayerId) {
    throw socialError(
      'relationship_self_forbidden',
      'A player cannot query a relationship with self.',
    );
  }
}

function deterministicRelationshipId(left: string, right: string) {
  const ordered = left < right ? `${left}:${right}` : `${right}:${left}`;
  const hex = [0, 1, 2, 3]
    .map((salt) => fnv1a32(`${salt}:${ordered}`).toString(16).padStart(8, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function fnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function directionalKey(viewerPlayerId: string, targetPlayerId: string) {
  return `${viewerPlayerId}:${targetPlayerId}`;
}

function normalizeLimit(value: number | undefined) {
  return Number.isInteger(value) ? Math.min(Math.max(value ?? 50, 1), 100) : 50;
}

function socialError(code: string, message: string) {
  return Object.assign(new Error(message), { code, retryable: false });
}
