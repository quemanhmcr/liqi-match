import type { SimulationRuntime } from '@/shared/simulation';
import {
  SIMULATION_OPERATION_IDS,
  projectSimulationHome,
  type SimulationWorld,
} from '@/entities/simulation';

import type { HomeDashboard } from '../home-dashboard-service';
import type { HomeRepository } from '../runtime/HomeRepositoryProvider';

export class SimulationHomeRepository implements HomeRepository {
  constructor(private readonly runtime: SimulationRuntime<SimulationWorld>) {}

  async getDashboard(): Promise<HomeDashboard> {
    return this.runtime.execute(
      { operation: SIMULATION_OPERATION_IDS.home.dashboard },
      () => mapHomeDashboard(this.runtime.readWorld()),
    );
  }
}

export function createSimulationHomeRepository(
  runtime: SimulationRuntime<SimulationWorld>,
) {
  return new SimulationHomeRepository(runtime);
}

export function mapHomeDashboard(world: SimulationWorld): HomeDashboard {
  const projected = projectSimulationHome(world);
  return {
    activeMatchCount: projected.activeMatchCount,
    currentProfile: {
      avatarAssetKey: projected.currentProfile.avatar?.assetKey,
      displayName: projected.currentProfile.displayName,
      handle: projected.currentProfile.handle,
      rankName: projected.currentProfile.rankName,
      readySummary: projected.currentProfile.readySummary,
      roleNames: [...projected.currentProfile.roleNames],
    },
    matchedSets: projected.connections.map((connection) => ({
      actionLabel: connection.kind === 'Team Rank' ? 'Vào lobby' : 'Vào set',
      avatarAssetKey: connection.avatar?.assetKey,
      conversationId: connection.conversationId ?? undefined,
      createdAt: connection.createdAt,
      heroNames: [...connection.heroNames],
      id: connection.id,
      kind: connection.kind,
      meta: connection.meta,
      name: connection.name,
      profileId: connection.profileId,
      rankName: connection.rankName,
      roleNames: [...connection.roleNames],
      status: connection.status,
      subtitle: connection.subtitle,
      unreadCount: connection.unreadCount || undefined,
    })),
    preview: false,
  };
}
