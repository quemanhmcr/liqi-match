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
    const profileId = input.userId
      ? ProfileIdSchema.parse(input.userId)
      : world.viewerId;

    return this.runtime.execute(
      { operation: 'profile.read', scope: profileId },
      () => mapProfileViewModel(this.runtime.readWorld(), profileId),
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
): ProfileViewModel {
  const profile = projectSimulationProfile(world, profileId);
  const conversationId = Object.values(world.matches).find(
    (match) =>
      match.unmatchedAt === null &&
      match.profileIds.includes(world.viewerId) &&
      match.profileIds.includes(profileId),
  )?.conversationId;
  return {
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
