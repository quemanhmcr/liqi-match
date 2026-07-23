import type { PlayerId } from '@/shared/contracts/core-v1';
import type { SocialRelationshipSnapshotV2 } from '@/shared/contracts/core-v2';

export type MessageComposeAvailability =
  | Readonly<{ state: 'loading' }>
  | Readonly<{ state: 'error' }>
  | Readonly<{ state: 'empty' }>
  | Readonly<{ playerIds: readonly PlayerId[]; state: 'ready' }>;

/** Mirrors the friendship authority required by the existing-conversation picker. */
export function resolveMessageComposeAvailability({
  error,
  loading,
  relationships,
}: Readonly<{
  error: boolean;
  loading: boolean;
  relationships: readonly SocialRelationshipSnapshotV2[];
}>): MessageComposeAvailability {
  if (loading) return { state: 'loading' };
  if (error) return { state: 'error' };

  const playerIds = relationships
    .filter(
      (relationship) =>
        relationship.friendship.state === 'accepted' &&
        relationship.capabilities.canMessage,
    )
    .map((relationship) => relationship.targetPlayerId);

  return playerIds.length ? { playerIds, state: 'ready' } : { state: 'empty' };
}

export function canOpenMessageComposeConversation(
  availability: MessageComposeAvailability,
  playerId: PlayerId,
) {
  return (
    availability.state === 'ready' && availability.playerIds.includes(playerId)
  );
}
