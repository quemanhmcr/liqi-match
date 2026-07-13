import { describe, expect, it } from '@jest/globals';

import {
  createProductionSimulationRuntime,
  DEGRADED_OFFLINE_RECOVERY_SCENARIO,
  GOLDEN_PROFILE_IDS,
  MEDIA_PARTIALLY_ASSOCIATED_SCENARIO,
  NEWLY_ONBOARDED_PROFILE_PROPAGATION_SCENARIO,
  SIMULATION_OPERATION_IDS,
  SimulationMutationIntegrityError,
  VIEWER_READY_HAPPY_PATH_SCENARIO,
} from '@/entities/simulation';

describe('canonical production simulation runtime', () => {
  it('applies offline recovery and a one-shot feature fault from declarations', async () => {
    const runtime = createProductionSimulationRuntime({
      initialScenarioId: DEGRADED_OFFLINE_RECOVERY_SCENARIO.id,
      namespace: 'canonical-offline-recovery',
    });

    expect(runtime.faults.getNetworkState()).toBe('offline');
    await expect(
      runtime.execute({ operation: 'messages.list-conversations' }, () => 'ok'),
    ).rejects.toMatchObject({ code: 'offline' });

    runtime.advanceClock(5 * 60_000);
    expect(runtime.faults.getNetworkState()).toBe('online');
    await expect(
      runtime.execute(
        { operation: SIMULATION_OPERATION_IDS.discover.overview },
        () => 'ok',
      ),
    ).rejects.toMatchObject({
      code: 'retryable_server_error',
      retryable: true,
    });
    await expect(
      runtime.execute(
        { operation: SIMULATION_OPERATION_IDS.discover.overview },
        () => 'ok',
      ),
    ).resolves.toBe('ok');

    runtime.advanceClock(60_000);
    expect(runtime.faults.snapshot().pendingFaults).toEqual([]);
  });

  it('propagates the same canonical profile through the scheduled world event', () => {
    const runtime = createProductionSimulationRuntime({
      initialScenarioId: NEWLY_ONBOARDED_PROFILE_PROPAGATION_SCENARIO.id,
      namespace: 'canonical-profile-propagation',
    });

    expect(
      runtime.readWorld().profiles[GOLDEN_PROFILE_IDS.quanViewer]
        ?.canonicalProfile.profileBasics.displayName,
    ).not.toBe('Quân Mới');

    runtime.advanceClock(60_000);

    const world = runtime.readWorld();
    expect(
      world.profiles[GOLDEN_PROFILE_IDS.quanViewer]?.canonicalProfile
        .profileBasics.displayName,
    ).toBe('Quân Mới');
    expect(world.generatedAt).toBe(runtime.clock.now().toISOString());
    expect(runtime.readDebugState().timelineCursor).toBe(1);
  });

  it('associates uploaded media without changing canonical asset identity', () => {
    const runtime = createProductionSimulationRuntime({
      initialScenarioId: MEDIA_PARTIALLY_ASSOCIATED_SCENARIO.id,
      namespace: 'canonical-media-association',
    });
    const initial = runtime.readWorld();
    const pending =
      initial.profiles[GOLDEN_PROFILE_IDS.quanViewer]?.media
        .pendingAssociations[0];
    expect(pending).toBeDefined();
    const assetKey = pending!.assetKey;

    runtime.advanceClock(2 * 60_000);

    const world = runtime.readWorld();
    expect(
      world.profiles[GOLDEN_PROFILE_IDS.quanViewer]?.media.coverAssetKey,
    ).toBe(assetKey);
    expect(
      world.profiles[GOLDEN_PROFILE_IDS.quanViewer]?.media.pendingAssociations,
    ).toEqual([]);
    expect(world.assets[assetKey]).toMatchObject({
      key: assetKey,
      kind: 'cover',
      state: 'available',
    });
  });

  it('rolls back mutations that change canonical immutable identity', async () => {
    const runtime = createProductionSimulationRuntime({
      initialScenarioId: VIEWER_READY_HAPPY_PATH_SCENARIO.id,
      namespace: 'canonical-immutable-rollback',
    });
    const before = runtime.readWorld();

    await expect(
      runtime.mutate({ operation: 'profile.update' }, (world) => {
        world.profiles[GOLDEN_PROFILE_IDS.quanViewer]!.identityKey =
          'profile:forged-identity';
      }),
    ).rejects.toBeInstanceOf(SimulationMutationIntegrityError);

    expect(runtime.readWorld()).toEqual(before);
  });

  it('restores scenario world, timeline, clock and fault state together', async () => {
    const runtime = createProductionSimulationRuntime({
      initialScenarioId: NEWLY_ONBOARDED_PROFILE_PROPAGATION_SCENARIO.id,
      namespace: 'canonical-snapshot',
    });
    const baseline = await runtime.snapshot();

    runtime.advanceClock(60_000);
    expect(runtime.readDebugState().timelineCursor).toBe(1);

    await runtime.restore(baseline);
    expect(runtime.readDebugState().timelineCursor).toBe(0);
    expect(runtime.clock.now().toISOString()).toBe(
      NEWLY_ONBOARDED_PROFILE_PROPAGATION_SCENARIO.initialClock,
    );
    expect(
      runtime.readWorld().profiles[GOLDEN_PROFILE_IDS.quanViewer]
        ?.canonicalProfile.profileBasics.displayName,
    ).not.toBe('Quân Mới');
  });
});
