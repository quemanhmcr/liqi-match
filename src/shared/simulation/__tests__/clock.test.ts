import { describe, expect, it } from '@jest/globals';

import { DeterministicSimulationClock } from '../clock';
import { SimulationContractError } from '../errors';

describe('DeterministicSimulationClock', () => {
  it('freezes, advances and resets without exposing a mutable Date reference', () => {
    const clock = new DeterministicSimulationClock('2026-07-13T00:00:00.000Z');
    const first = clock.now();
    first.setUTCFullYear(2030);

    expect(clock.now().toISOString()).toBe('2026-07-13T00:00:00.000Z');

    clock.advance(90_000);
    expect(clock.now().toISOString()).toBe('2026-07-13T00:01:30.000Z');

    clock.freeze('2026-08-01T12:30:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-08-01T12:30:00.000Z');

    clock.reset();
    expect(clock.now().toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  it('restores a clock snapshot and rejects invalid time movement', () => {
    const source = new DeterministicSimulationClock('2026-07-13T00:00:00.000Z');
    source.advance(2_000);
    const target = new DeterministicSimulationClock('2025-01-01T00:00:00.000Z');

    target.restore(source.snapshot());

    expect(target.now().toISOString()).toBe('2026-07-13T00:00:02.000Z');
    expect(() => target.advance(-1)).toThrow(SimulationContractError);
    expect(() => target.freeze('not-a-date')).toThrow(SimulationContractError);
  });
});
