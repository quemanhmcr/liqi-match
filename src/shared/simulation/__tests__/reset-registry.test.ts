import { describe, expect, it } from '@jest/globals';

import type { SimulationResetContext } from '../contracts';
import { SimulationContractError } from '../errors';
import { SimulationResetRegistry } from '../reset-registry';

const context: SimulationResetContext = {
  namespace: 'reset-test',
  reason: 'reset',
  scenarioId: 'golden',
};

describe('SimulationResetRegistry', () => {
  it('runs phases and stable order without importing feature stores', async () => {
    const registry = new SimulationResetRegistry();
    const calls: string[] = [];

    registry.register({
      key: 'query-client',
      order: -100,
      reset: () => calls.push('query-client'),
    });
    registry.register({
      key: 'zustand',
      reset: () => calls.push('zustand'),
    });
    registry.register({
      key: 'asset-cache',
      phase: 'after-world',
      reset: () => calls.push('asset-cache'),
    });

    await registry.resetPhase('before-world', context);
    await registry.resetPhase('after-world', context);

    expect(calls).toEqual(['query-client', 'zustand', 'asset-cache']);
  });

  it('snapshots and restores participant state by key', async () => {
    const registry = new SimulationResetRegistry();
    let queue = ['message-1'];
    registry.register({
      key: 'messages.queue',
      reset: () => {
        queue = [];
      },
      restore: (state) => {
        queue = [...state];
      },
      snapshot: () => [...queue],
    });

    const snapshot = await registry.snapshot();
    queue.push('message-2');
    await registry.resetPhase('before-world', context);
    await registry.restorePhase('before-world', snapshot, {
      ...context,
      reason: 'restore',
    });

    expect(queue).toEqual(['message-1']);
  });

  it('rejects duplicate keys and incomplete snapshot contracts', () => {
    const registry = new SimulationResetRegistry();
    registry.register({ key: 'store', reset: () => undefined });

    expect(() =>
      registry.register({ key: 'store', reset: () => undefined }),
    ).toThrow(SimulationContractError);
    expect(() =>
      registry.register({
        key: 'broken',
        reset: () => undefined,
        snapshot: () => ({ value: 1 }),
      }),
    ).toThrow(SimulationContractError);
  });
});
