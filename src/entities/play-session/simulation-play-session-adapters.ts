import {
  MatchIdSchema,
  PlayerIdSchema,
  SetIdSchema,
  type MatchId,
  type PlayerId,
  type SetId,
} from '@/shared/contracts/core-v1';
import type { ProductionSimulationRuntime } from '@/entities/simulation';

import { PlaySessionDomainError } from './play-session-error';
import type {
  PlaySessionSourceProvider,
  SessionParticipantLifecycleProvider,
  SessionRelationshipEligibilityProvider,
} from './play-session-repository';

/**
 * Explicit compatibility boundary. Simulation fixtures predate Core V1 and use
 * readable string IDs; Core V2 domain code only receives stable UUID identities.
 */
export function simulationProfileIdToPlayerId(profileId: string): PlayerId {
  return PlayerIdSchema.parse(deterministicSimulationUuid('player', profileId));
}

export function simulationMatchIdToMatchId(matchId: string): MatchId {
  return MatchIdSchema.parse(deterministicSimulationUuid('match', matchId));
}

export function simulationSetIdToSetId(setId: string): SetId {
  return SetIdSchema.parse(deterministicSimulationUuid('set', setId));
}

export function createSimulationPlaySessionSourceProvider(
  runtime: ProductionSimulationRuntime,
): PlaySessionSourceProvider {
  return {
    async getMatchParticipantIds(matchId: MatchId) {
      const match = Object.values(runtime.readWorld().matches).find(
        (candidate) =>
          simulationMatchIdToMatchId(String(candidate.id)) === matchId,
      );
      if (!match || match.unmatchedAt !== null) {
        throw new PlaySessionDomainError(
          'not_found',
          'The authoritative simulation Match is unavailable.',
        );
      }
      return match.profileIds.map((id) =>
        simulationProfileIdToPlayerId(String(id)),
      );
    },
    async getSetSnapshot(setId: SetId) {
      const set = Object.values(runtime.readWorld().sets).find(
        (candidate) => simulationSetIdToSetId(String(candidate.id)) === setId,
      );
      if (!set || set.status === 'closed') {
        throw new PlaySessionDomainError(
          'not_found',
          'The authoritative simulation Set is unavailable.',
        );
      }
      if (set.capacity > 5) {
        throw new PlaySessionDomainError(
          'validation_failed',
          'Core V2 Session capacity cannot exceed five.',
        );
      }
      return {
        capacity: set.capacity,
        memberPlayerIds: set.memberIds.map((id) =>
          simulationProfileIdToPlayerId(String(id)),
        ),
        ownerPlayerId: simulationProfileIdToPlayerId(String(set.ownerId)),
        version: set.version,
      };
    },
  };
}

export function createSimulationParticipantLifecycleProvider(
  runtime: ProductionSimulationRuntime,
): SessionParticipantLifecycleProvider {
  return {
    async assertActive(playerIds) {
      const profiles = Object.values(runtime.readWorld().profiles);
      for (const playerId of playerIds) {
        const profile = profiles.find(
          (candidate) =>
            simulationProfileIdToPlayerId(String(candidate.id)) === playerId,
        );
        if (!profile) {
          throw new PlaySessionDomainError(
            'lifecycle_not_active',
            'Simulation player identity is unavailable.',
            { playerId },
          );
        }
      }
    },
  };
}

export function createSimulationRelationshipEligibilityProvider(
  runtime: ProductionSimulationRuntime,
): SessionRelationshipEligibilityProvider {
  return {
    async getInviteEligibility(actorPlayerId, targetPlayerId) {
      const world = runtime.readWorld();
      const knownRelationship = Object.values(world.matches).some((match) => {
        const participantPlayerIds = match.profileIds.map((id) =>
          simulationProfileIdToPlayerId(String(id)),
        );
        return (
          match.unmatchedAt === null &&
          participantPlayerIds.includes(actorPlayerId) &&
          participantPlayerIds.includes(targetPlayerId)
        );
      });
      const sharedSet = Object.values(world.sets).some((set) => {
        const memberPlayerIds = set.memberIds.map((id) =>
          simulationProfileIdToPlayerId(String(id)),
        );
        return (
          set.status !== 'closed' &&
          memberPlayerIds.includes(actorPlayerId) &&
          memberPlayerIds.includes(targetPlayerId)
        );
      });
      const blocked = false;
      return {
        allowed: !blocked && (knownRelationship || sharedSet),
        blocked,
        reasonCodes:
          knownRelationship || sharedSet
            ? []
            : ['session_invite_policy_denied'],
      };
    },
  };
}

function deterministicSimulationUuid(namespace: string, value: string) {
  const input = `${namespace}:${value}`;
  const words = [
    hash32(input, 0x811c9dc5),
    hash32(input, 0x9e3779b9),
    hash32(input, 0x85ebca6b),
    hash32(input, 0xc2b2ae35),
  ];
  const hex = words
    .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
    .join('')
    .split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16] ?? '0', 16) % 4]!;
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function hash32(input: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}
