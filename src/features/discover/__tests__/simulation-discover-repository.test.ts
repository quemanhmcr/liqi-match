import { describe, expect, it } from '@jest/globals';

import {
  GOLDEN_PROFILE_IDS,
  SIMULATION_RUNTIME_NAMESPACE,
  SIMULATION_RUNTIME_SCENARIOS,
  projectSimulationDiscover,
  validateSimulationWorldForRuntime,
  type SimulationWorld,
} from '@/entities/simulation';
import { createSimulationRuntime } from '@/shared/simulation';

import { SimulationDiscoverRepository } from '../services/simulation-discover-repository';
import type { DiscoverRequestContext } from '../services/discover-repository';

const context: DiscoverRequestContext = {
  locale: 'vi',
  session: null,
  timezone: 'Asia/Bangkok',
  viewerId: 'session-user-id',
};

function setup() {
  const runtime = createSimulationRuntime<SimulationWorld>({
    initialScenarioId: 'scenario:viewer-ready-happy-path',
    namespace: `${SIMULATION_RUNTIME_NAMESPACE}.discover-test`,
    scenarios: SIMULATION_RUNTIME_SCENARIOS,
    validateWorld: validateSimulationWorldForRuntime,
  });
  return { repository: new SimulationDiscoverRepository(runtime), runtime };
}

describe('SimulationDiscoverRepository', () => {
  it('projects canonical IDs and asset keys through the Discover contract', async () => {
    const { repository } = setup();
    const response = await repository.listPlayers(context, {
      facetIds: [],
      limit: 50,
      query: '',
      sort: 'best_match',
    });

    const maiSupport = response.data.items.find(
      (item) => item.profileId === GOLDEN_PROFILE_IDS.maiSupport,
    );
    expect(maiSupport).toMatchObject({
      avatar: { assetKey: 'asset:shared:avatar-fallback', kind: 'fixture' },
      capabilities: { canMessage: false, canViewProfile: true },
      profileId: GOLDEN_PROFILE_IDS.maiSupport,
    });
  });

  it('writes join and invite state into the same canonical world', async () => {
    const { repository, runtime } = setup();
    const projection = projectSimulationDiscover(runtime.readWorld());
    const joinable = projection.sets.find(
      (set) => set.viewerState.canRequestJoin,
    );
    const inviteable = projection.players.find(
      (player) => player.capabilities.invite.state === 'available',
    );
    if (!joinable || !inviteable?.capabilities.invite.targetSetId) {
      throw new Error('Golden world requires joinable and inviteable targets.');
    }

    const join = await repository.requestSetJoin(context, {
      clientMutationId: 'client:join:1',
      expectedSetVersion: joinable.version,
      idempotencyKey: 'client:join:1',
      setId: joinable.id,
      source: 'discover',
    });
    expect(join.status).toBe('pending');
    expect(
      runtime.readWorld().sets[joinable.id]?.joinRequests[
        GOLDEN_PROFILE_IDS.quanViewer
      ],
    ).toBe('pending');

    const targetSetId = inviteable.capabilities.invite.targetSetId;
    const targetSet = runtime.readWorld().sets[targetSetId];
    if (!targetSet) throw new Error('Missing invite target set.');
    const invite = await repository.invitePlayerToSet(context, {
      clientMutationId: 'client:invite:1',
      expectedSetVersion: targetSet.version,
      idempotencyKey: 'client:invite:1',
      profileId: inviteable.profileId,
      setId: targetSetId,
      source: 'discover',
    });
    expect(invite.status).toBe('pending');
    expect(
      runtime.readWorld().sets[targetSetId]?.invites[inviteable.profileId],
    ).toBe('pending');
  });
});
