import {
  ProfileIdSchema,
  projectSimulationProfile,
  type SimulationWorld,
} from '@/entities/simulation';
import type { SimulationRuntime } from '@/shared/simulation';

import type { ProfileViewModel } from './profile-service';
import type {
  GetProfileInput,
  ProfileReadRepository,
} from '../runtime/ProfileReadRepositoryProvider';

export class SimulationProfileReadRepository implements ProfileReadRepository {
  constructor(private readonly runtime: SimulationRuntime<SimulationWorld>) {}

  async getProfile(input: GetProfileInput): Promise<ProfileViewModel> {
    const world = this.runtime.readWorld();
    const profileId = input.identityId
      ? ProfileIdSchema.parse(input.identityId)
      : world.viewerId;

    return this.runtime.execute(
      { operation: 'profile.read', scope: profileId },
      () =>
        mapProfileViewModel(
          this.runtime.readWorld(),
          profileId,
          profileId === world.viewerId
            ? (input.session.principal?.playerId ?? undefined)
            : undefined,
        ),
    );
  }
}

export function createSimulationProfileReadRepository(
  runtime: SimulationRuntime<SimulationWorld>,
) {
  return new SimulationProfileReadRepository(runtime);
}

export function mapProfileViewModel(
  world: SimulationWorld,
  profileId = world.viewerId,
  playerId?: string,
): ProfileViewModel {
  const profile = projectSimulationProfile(world, profileId);
  const conversationId = Object.values(world.matches).find(
    (match) =>
      match.unmatchedAt === null &&
      match.profileIds.includes(world.viewerId) &&
      match.profileIds.includes(profileId),
  )?.conversationId;
  return {
    availability: profile.availability,
    avatarAssetKey: profile.avatar?.assetKey,
    bio: profile.bio,
    coverAssetKey: profile.cover?.assetKey,
    ...(conversationId ? { conversationId } : {}),
    displayName: profile.displayName,
    favoriteHeroes: profile.favoriteHeroes.map((hero) => ({
      heroId: hero.heroId,
      name: hero.name,
      slug: hero.heroId,
    })),
    gender: profile.gender,
    id: profile.id,
    playerId: playerId ?? deterministicPlayerId(profile.id),
    playStyleTags: [...profile.playStyleTags],
    rankName: profile.rank.label,
    region: profile.region,
    roleNames: profile.roles.map((role) => role.label),
    showWinRate: true,
    stats: { ...profile.stats },
    statusLabel: profile.status.label,
    statusValue: profile.status.value,
    verified: profile.verified,
    wallAssetKeys: profile.wall.map((media) => media.assetKey),
  };
}

function deterministicPlayerId(identity: string) {
  const hex = [0, 1, 2, 3]
    .map((salt) => fnv1a32(`${salt}:${identity}`).toString(16).padStart(8, '0'))
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
