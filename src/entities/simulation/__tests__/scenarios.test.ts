import { describe, expect, it } from '@jest/globals';

import {
  DEGRADED_OFFLINE_RECOVERY_SCENARIO,
  EMPTY_COLD_START_SCENARIO,
  MEDIA_PARTIALLY_ASSOCIATED_SCENARIO,
  NEWLY_ONBOARDED_PROFILE_PROPAGATION_SCENARIO,
  SIMULATION_SCENARIOS,
  SOCIAL_UNREAD_CROSS_LINK_SCENARIO,
  VIEWER_READY_HAPPY_PATH_SCENARIO,
  validateSimulationScenario,
} from '@/entities/simulation';

describe('simulation scenarios', () => {
  it('defines all six required scenarios with a shared clock contract', () => {
    const scenarios = Object.values(SIMULATION_SCENARIOS);

    expect(scenarios).toHaveLength(6);
    expect(scenarios.map((scenario) => scenario.id).sort()).toEqual(
      [
        'scenario:degraded-offline-recovery',
        'scenario:empty-cold-start',
        'scenario:media-partially-associated',
        'scenario:newly-onboarded-profile-propagation',
        'scenario:social-unread-cross-link',
        'scenario:viewer-ready-happy-path',
      ].sort(),
    );
    for (const scenario of scenarios) {
      expect(validateSimulationScenario(scenario)).toEqual([]);
      expect(scenario.initialWorld.generatedAt).toBe(scenario.initialClock);
      expect(scenario.initialWorld.scenarioId).toBe(scenario.id);
      expect(scenario.runtime.capabilities).toEqual(
        expect.arrayContaining(['clock-control', 'reset', 'event-timeline']),
      );
    }
  });

  it('keeps scenario meanings explicit instead of relying on runtime heuristics', () => {
    expect(
      VIEWER_READY_HAPPY_PATH_SCENARIO.requiredRelations.length,
    ).toBeGreaterThan(0);
    expect(
      Object.keys(EMPTY_COLD_START_SCENARIO.initialWorld.conversations),
    ).toHaveLength(0);
    expect(
      NEWLY_ONBOARDED_PROFILE_PROPAGATION_SCENARIO.timeline.map(
        (event) => event.kind,
      ),
    ).toEqual(['profile-propagated']);
    expect(
      SOCIAL_UNREAD_CROSS_LINK_SCENARIO.requiredRelations.every(
        (relation) => relation.kind === 'notification-conversation-link',
      ),
    ).toBe(true);
    expect(DEGRADED_OFFLINE_RECOVERY_SCENARIO.runtime.initialNetworkState).toBe(
      'offline',
    );
    expect(MEDIA_PARTIALLY_ASSOCIATED_SCENARIO.requiredRelations).toEqual([
      expect.objectContaining({ kind: 'asset-state', state: 'unassociated' }),
    ]);
  });
});
