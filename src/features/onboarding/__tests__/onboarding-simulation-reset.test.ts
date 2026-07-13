import { describe, expect, it } from '@jest/globals';

import { createProductionSimulationRuntime } from '@/entities/simulation';
import {
  createOnboardingSimulationResetParticipant,
  type OnboardingDraftPort,
} from '../runtime/onboarding-simulation-reset';

describe('Onboarding simulation reset participant', () => {
  it('snapshots, clears and restores the account-scoped draft', async () => {
    let stored: unknown = {
      accountId: 'account:test',
      currentStep: 'profile-basics',
      version: 3,
    };
    const port: OnboardingDraftPort = {
      async clear(accountId) {
        expect(accountId).toBe('account:test');
        stored = null;
      },
      async load(accountId) {
        expect(accountId).toBe('account:test');
        return stored as never;
      },
      async save(accountId, draft) {
        expect(accountId).toBe('account:test');
        stored = draft;
      },
    };
    const runtime = createProductionSimulationRuntime({
      namespace: 'onboarding-reset',
    });
    runtime.registerResetParticipant(
      createOnboardingSimulationResetParticipant('account:test', port),
    );
    const snapshot = await runtime.snapshot();

    await runtime.reset();
    expect(stored).toBeNull();

    await runtime.restore(snapshot);
    expect(stored).toEqual({
      accountId: 'account:test',
      currentStep: 'profile-basics',
      version: 3,
    });
  });

  it('rejects an empty account id', () => {
    expect(() =>
      createOnboardingSimulationResetParticipant('   ', {
        async clear() {},
        async load() {
          return null;
        },
        async save() {},
      }),
    ).toThrow(/account id/);
  });
});
