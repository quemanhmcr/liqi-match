import { describe, expect, it } from '@jest/globals';

import { SimulationRequestError } from '../errors';
import { SimulationFaultController } from '../fault-controller';

describe('SimulationFaultController', () => {
  it('applies fixed and one-shot latency through the injected scheduler', async () => {
    const delays: number[] = [];
    const controller = new SimulationFaultController({
      delay: async (durationMs) => {
        delays.push(durationMs);
      },
      fixedLatencyMs: 25,
    });
    controller.failNext({
      durationMs: 75,
      kind: 'latency',
      operation: 'messages.list',
    });

    const first = await controller.prepare({ operation: 'messages.list' });
    const second = await controller.prepare({ operation: 'messages.list' });

    expect(delays).toEqual([25, 75, 25]);
    expect(first.consumedFault?.kind).toBe('latency');
    expect(second.consumedFault).toBeNull();
  });

  it('keeps unmatched faults queued and consumes matching faults once', async () => {
    const controller = new SimulationFaultController();
    controller.failNext({
      kind: 'stale_cursor',
      operation: 'messages.timeline',
      scope: 'conversation-a',
    });

    await expect(
      controller.prepare({
        operation: 'messages.timeline',
        scope: 'conversation-b',
      }),
    ).resolves.toMatchObject({ consumedFault: null });

    await expect(
      controller.prepare({
        operation: 'messages.timeline',
        scope: 'conversation-a',
      }),
    ).rejects.toMatchObject({ code: 'stale_cursor', retryable: true });

    await expect(
      controller.prepare({
        operation: 'messages.timeline',
        scope: 'conversation-a',
      }),
    ).resolves.toMatchObject({ consumedFault: null });
  });

  it('surfaces partial directives but owns common request errors', async () => {
    const controller = new SimulationFaultController();
    controller.failNext({ kind: 'partial_response', limit: 2 });
    const partial = await controller.prepare({
      operation: 'notifications.list',
    });

    expect(partial.directive).toMatchObject({
      kind: 'partial_response',
      limit: 2,
    });

    controller.failNext({
      kind: 'validation_error',
      message: 'invalid command',
    });
    await expect(
      controller.prepare({ operation: 'profile.update' }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'validation_error',
        message: 'invalid command',
        retryable: false,
      }),
    );
  });

  it('notifies network transitions and blocks requests while offline', async () => {
    const controller = new SimulationFaultController();
    const states: string[] = [];
    const subscription = controller.subscribeNetworkState((state) => {
      states.push(state);
    });

    controller.setNetwork('offline');
    await expect(
      controller.prepare({ operation: 'messages.send' }),
    ).rejects.toBeInstanceOf(SimulationRequestError);
    controller.setNetwork('online');
    subscription.remove();
    controller.setNetwork('offline');

    expect(states).toEqual(['offline', 'online']);
  });
});

describe('SimulationFaultController persistent plans', () => {
  it('matches operation prefixes for a fixed number of uses', async () => {
    const controller = new SimulationFaultController();
    controller.scheduleFault(
      {
        kind: 'retryable_server_error',
        operationPrefix: 'messages.',
      },
      { id: 'fault:messages', uses: 2 },
    );

    await expect(
      controller.prepare({ operation: 'notifications.list' }),
    ).resolves.toMatchObject({ consumedFault: null });
    await expect(
      controller.prepare({ operation: 'messages.list' }),
    ).rejects.toMatchObject({ code: 'retryable_server_error' });
    expect(controller.snapshot().pendingFaults[0]?.remainingUses).toBe(1);
    await expect(
      controller.prepare({ operation: 'messages.send-text' }),
    ).rejects.toMatchObject({ code: 'retryable_server_error' });
    expect(controller.snapshot().pendingFaults).toEqual([]);
  });

  it('keeps persistent faults active until explicitly cleared', async () => {
    const controller = new SimulationFaultController();
    controller.scheduleFault(
      {
        code: 'asset_unavailable',
        kind: 'partial_failure',
        operationPrefix: 'media.',
        scope: 'asset:one',
      },
      { id: 'fault:asset', uses: null },
    );

    await expect(
      controller.prepare({ operation: 'media.load', scope: 'asset:one' }),
    ).resolves.toMatchObject({
      directive: { code: 'asset_unavailable', remainingUses: null },
    });
    await expect(
      controller.prepare({ operation: 'media.resolve', scope: 'asset:one' }),
    ).resolves.toMatchObject({
      directive: { code: 'asset_unavailable', remainingUses: null },
    });
    expect(controller.clearFault('fault:asset')).toBe(true);
    expect(controller.clearFault('fault:asset')).toBe(false);
    await expect(
      controller.prepare({ operation: 'media.load', scope: 'asset:one' }),
    ).resolves.toMatchObject({ consumedFault: null });
  });

  it('forks controller state without sharing mutations or listeners', () => {
    const controller = new SimulationFaultController({ network: 'online' });
    const states: string[] = [];
    controller.subscribeNetworkState((state) => states.push(state));
    controller.scheduleFault(
      { kind: 'stale_cursor' },
      { id: 'fault:cursor', uses: null },
    );

    const fork = controller.fork();
    fork.setNetwork('offline');
    fork.clearFault('fault:cursor');

    expect(controller.getNetworkState()).toBe('online');
    expect(controller.snapshot().pendingFaults).toHaveLength(1);
    expect(states).toEqual([]);
  });
});
