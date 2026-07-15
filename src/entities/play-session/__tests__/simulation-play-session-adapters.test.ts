import { describe, expect, it } from '@jest/globals';

import {
  createProductionSimulationRuntime,
  GOLDEN_PROFILE_IDS,
  GOLDEN_SET_IDS,
} from '@/entities/simulation';

import {
  createSimulationParticipantLifecycleProvider,
  createSimulationPlaySessionSourceProvider,
  simulationMatchIdToMatchId,
  simulationProfileIdToPlayerId,
  simulationSetIdToSetId,
} from '../simulation-play-session-adapters';

describe('simulation Core V2 identity bridge', () => {
  it('maps readable fixture IDs to stable UUID semantic IDs', () => {
    const first = simulationProfileIdToPlayerId('profile:quan-viewer');
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(simulationProfileIdToPlayerId('profile:quan-viewer')).toBe(first);
    expect(simulationMatchIdToMatchId('match:minh-anh')).not.toBe(first);
    expect(simulationSetIdToSetId('set:dem-violet')).not.toBe(first);
  });

  it('resolves authoritative Match and Set facts through the bridge', async () => {
    const runtime = createProductionSimulationRuntime({
      namespace: 'session-identity-bridge',
    });
    const source = createSimulationPlaySessionSourceProvider(runtime);
    const lifecycle = createSimulationParticipantLifecycleProvider(runtime);
    const match = Object.values(runtime.readWorld().matches)[0]!;

    const participants = await source.getMatchParticipantIds(
      simulationMatchIdToMatchId(String(match.id)),
    );
    expect(participants).toHaveLength(2);
    await expect(lifecycle.assertActive(participants)).resolves.toBeUndefined();

    const set = await source.getSetSnapshot(
      simulationSetIdToSetId(String(GOLDEN_SET_IDS.demViolet)),
    );
    expect(set.ownerPlayerId).toBe(
      simulationProfileIdToPlayerId(String(GOLDEN_PROFILE_IDS.quanViewer)),
    );
    expect(set.memberPlayerIds).toHaveLength(2);
  });
});
