import { describe, expect, it } from '@jest/globals';

import { SimulationContractError } from '../errors';
import { createSimulationRuntime } from '../runtime';

type TestWorld = {
  counter: number;
  messages: string[];
};

function runtime(namespace = 'runtime-test') {
  return createSimulationRuntime<TestWorld>({
    initialScenarioId: 'golden',
    namespace,
    scenarios: [
      {
        clock: { at: '2026-07-13T00:00:00.000Z' },
        id: 'golden',
        version: 1,
        world: { counter: 0, messages: [] },
      },
      {
        clock: { at: '2026-08-01T00:00:00.000Z' },
        id: 'busy',
        network: 'offline',
        version: 2,
        world: { counter: 10, messages: ['baseline'] },
      },
    ],
    validateWorld: (world) => {
      if (world.counter < 0) throw new Error('counter invariant');
    },
  });
}

describe('SimulationRuntime', () => {
  it('selects and resets immutable scenario baselines', async () => {
    const current = runtime();

    await current.mutate({ operation: 'counter.increment' }, (world) => {
      world.counter += 1;
    });
    expect(current.readWorld().counter).toBe(1);

    await current.reset();
    expect(current.readWorld()).toEqual({ counter: 0, messages: [] });

    await current.selectScenario('busy');
    expect(current.readWorld()).toEqual({
      counter: 10,
      messages: ['baseline'],
    });
    expect(current.clock.now().toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(current.faults.getNetworkState()).toBe('offline');

    const exposed = current.readWorld();
    exposed.messages.push('external mutation');
    expect(current.readWorld().messages).toEqual(['baseline']);
  });

  it('serializes mutations and commits only after invariant validation', async () => {
    const current = runtime();
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const order: string[] = [];

    const first = current.mutate(
      { operation: 'counter.first' },
      async (world) => {
        order.push('first-start');
        markFirstStarted();
        await firstGate;
        world.counter += 1;
        order.push('first-end');
      },
    );
    const second = current.mutate({ operation: 'counter.second' }, (world) => {
      order.push('second');
      world.counter += 1;
    });

    await firstStarted;
    expect(current.readWorld().counter).toBe(0);
    expect(order).toEqual(['first-start']);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
    expect(current.readWorld().counter).toBe(2);

    await expect(
      current.mutate({ operation: 'counter.invalid' }, (world) => {
        world.counter = -1;
      }),
    ).rejects.toThrow('counter invariant');
    expect(current.readWorld().counter).toBe(2);
  });

  it('snapshots and restores world, clock, controller and participants', async () => {
    const current = runtime();
    let queuedMessages = ['queued-1'];
    current.registerResetParticipant({
      key: 'messages.offline-queue',
      reset: () => {
        queuedMessages = [];
      },
      restore: (state) => {
        queuedMessages = [...state];
      },
      snapshot: () => [...queuedMessages],
    });

    await current.mutate({ operation: 'message.append' }, (world) => {
      world.messages.push('hello');
    });
    current.advanceClock(5_000);
    current.setNetwork('offline');
    current.failNext({ kind: 'stale_cursor', operation: 'messages.list' });
    const snapshot = await current.snapshot();

    queuedMessages.push('queued-2');
    await current.selectScenario('busy');
    await current.restore(snapshot);

    expect(current.readWorld().messages).toEqual(['hello']);
    expect(current.clock.now().toISOString()).toBe('2026-07-13T00:00:05.000Z');
    expect(current.faults.getNetworkState()).toBe('offline');
    expect(current.faults.snapshot().pendingFaults).toHaveLength(1);
    expect(queuedMessages).toEqual(['queued-1']);
    expect(current.readDebugState().events.at(-1)?.type).toBe(
      'snapshot_restored',
    );
  });

  it('rejects snapshots from another test namespace or scenario version', async () => {
    const source = runtime('test-a');
    const target = runtime('test-b');
    const snapshot = await source.snapshot();

    await expect(target.restore(snapshot)).rejects.toThrow(
      SimulationContractError,
    );

    const incompatible = { ...snapshot, scenarioVersion: 99 };
    await expect(source.restore(incompatible)).rejects.toThrow(
      /scenario version/,
    );
  });

  it('keeps clock, faults and world isolated between runtime instances', async () => {
    const first = runtime('first');
    const second = runtime('second');

    first.advanceClock(1_000);
    first.failNext({ kind: 'validation_error' });
    await first
      .mutate({ operation: 'counter.increment' }, (world) => {
        world.counter += 1;
      })
      .catch(() => undefined);

    expect(first.clock.now().toISOString()).toBe('2026-07-13T00:00:01.000Z');
    expect(second.clock.now().toISOString()).toBe('2026-07-13T00:00:00.000Z');
    expect(second.faults.snapshot().pendingFaults).toEqual([]);
    expect(second.readWorld().counter).toBe(0);
  });

  it('passes partial failure directives to the owning adapter', async () => {
    const current = runtime();
    current.failNext({
      code: 'media_association_failed',
      kind: 'partial_failure',
      operation: 'media.associate',
      retryable: true,
    });

    const result = await current.execute(
      { operation: 'media.associate' },
      ({ fault }) => fault,
    );

    expect(result).toMatchObject({
      code: 'media_association_failed',
      kind: 'partial_failure',
      retryable: true,
    });
  });
});
