import { describe, expect, it } from '@jest/globals';

import { createProductionSimulationRuntime } from '@/entities/simulation';
import {
  createProfileEditSimulationResetParticipant,
  type ProfileEditRecoveryPort,
} from '../runtime/profile-edit-simulation-reset';

describe('Profile Edit simulation reset participant', () => {
  it('snapshots, clears and restores recovery state for one profile', async () => {
    let stored: unknown = {
      pendingAssociations: [],
      profileId: 'profile:test',
      version: 1,
    };
    const port: ProfileEditRecoveryPort = {
      async clear(profileId) {
        expect(profileId).toBe('profile:test');
        stored = null;
      },
      async load(profileId) {
        expect(profileId).toBe('profile:test');
        return stored as never;
      },
      async save(profileId, draft) {
        expect(profileId).toBe('profile:test');
        stored = draft;
      },
    };
    const runtime = createProductionSimulationRuntime({
      namespace: 'profile-edit-reset',
    });
    runtime.registerResetParticipant(
      createProfileEditSimulationResetParticipant('profile:test', port),
    );
    const snapshot = await runtime.snapshot();

    await runtime.reset();
    expect(stored).toBeNull();

    await runtime.restore(snapshot);
    expect(stored).toEqual({
      pendingAssociations: [],
      profileId: 'profile:test',
      version: 1,
    });
  });

  it('rejects an empty profile id', () => {
    expect(() =>
      createProfileEditSimulationResetParticipant('   ', {
        async clear() {},
        async load() {
          return null;
        },
        async save() {},
      }),
    ).toThrow(/profile id/);
  });
});
