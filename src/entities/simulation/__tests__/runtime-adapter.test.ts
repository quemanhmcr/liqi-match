import { describe, expect, it } from '@jest/globals';

import { createSimulationRuntime } from '@/shared/simulation';

import {
  DEGRADED_OFFLINE_RECOVERY_SCENARIO,
  GOLDEN_CONVERSATION_IDS,
  GOLDEN_PROFILE_IDS,
  MEDIA_PARTIALLY_ASSOCIATED_SCENARIO,
  SIMULATION_OPERATION_IDS,
  SIMULATION_RUNTIME_NAMESPACE,
  SIMULATION_RUNTIME_SCENARIOS,
  appendSimulationMessage,
  applySimulationDomainEvent,
  conversationId,
  markSimulationNotificationRead,
  projectSimulationFaultToRuntime,
  messageId,
  notificationId,
  scenarioTimelineBetween,
  transitionSimulationMessageDelivery,
  validateSimulationWorldForRuntime,
  type SimulatedMessage,
  type SimulationWorld,
} from '@/entities/simulation';

function runtime(initialScenarioId = 'scenario:viewer-ready-happy-path') {
  return createSimulationRuntime<SimulationWorld>({
    initialScenarioId,
    namespace: SIMULATION_RUNTIME_NAMESPACE,
    scenarios: SIMULATION_RUNTIME_SCENARIOS,
    validateWorld: validateSimulationWorldForRuntime,
  });
}

describe('Senior 1 world / Senior 2 runtime adapter', () => {
  it('exports six JSON-safe stable runtime scenarios', async () => {
    const current = runtime();

    expect(SIMULATION_RUNTIME_SCENARIOS).toHaveLength(6);
    expect(current.readWorld().viewerId).toBe(GOLDEN_PROFILE_IDS.quanViewer);

    await current.selectScenario('scenario:empty-cold-start');
    expect(Object.keys(current.readWorld().conversations)).toHaveLength(0);
  });

  it('rejects Date, undefined and class instances before world validation', () => {
    const current = runtime();
    const invalid = {
      ...current.readWorld(),
      injectedDate: new Date('2026-07-13T02:00:00.000Z'),
    } as unknown as SimulationWorld;

    expect(() =>
      validateSimulationWorldForRuntime(invalid, {
        now: '2026-07-13T02:00:00.000Z',
        operation: 'runtime.test-json-shape',
        scenarioId: 'scenario:viewer-ready-happy-path',
      }),
    ).toThrow(/plain objects and ISO strings/);
  });

  it('maps domain fault targets to deterministic runtime directives', () => {
    const faults = DEGRADED_OFFLINE_RECOVERY_SCENARIO.runtime.faults;
    const offline = faults.find((fault) => fault.kind === 'offline');
    const serverError = faults.find((fault) => fault.kind === 'error');
    if (!offline || !serverError)
      throw new Error('Missing degraded scenario faults.');

    expect(projectSimulationFaultToRuntime(offline)).toEqual([]);
    expect(projectSimulationFaultToRuntime(serverError)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'retryable_server_error',
          operation: 'discover.overview',
        }),
      ]),
    );
  });

  it('commits a canonical message through a domain lens and runtime validation', async () => {
    const current = runtime();
    current.advanceClock(60_000);
    const now = current.clock.now().toISOString();
    const message: SimulatedMessage = {
      conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
      createdAt: now,
      deliveryStatus: 'queued',
      id: messageId('message:runtime:viewer-reply'),
      kind: 'text',
      senderId: GOLDEN_PROFILE_IDS.quanViewer,
      text: 'Tin nhắn từ runtime adapter.',
    };

    await current.mutate(
      {
        operation: SIMULATION_OPERATION_IDS.messages.append,
        scope: GOLDEN_CONVERSATION_IDS.minhAnh,
      },
      (world, context) =>
        appendSimulationMessage(world, {
          message,
          now: context.clock.now().toISOString(),
        }),
    );

    const world = current.readWorld();
    expect(world.messages[message.id]).toEqual(message);
    expect(
      world.conversations[GOLDEN_CONVERSATION_IDS.minhAnh]?.messageIds.at(-1),
    ).toBe(message.id);
    expect(world.generatedAt).toBe(now);
  });

  it('rejects and rolls back an orphan mutation even when an adapter bypasses lenses', async () => {
    const current = runtime();
    const before = current.readWorld();
    const source = before.messages[messageId('message:minh-anh:1')];
    if (!source) throw new Error('Missing golden source message.');
    const orphanId = messageId('message:runtime:orphan');

    await expect(
      current.mutate({ operation: 'messages.unsafe-test' }, (world) => {
        world.messages[orphanId] = {
          ...source,
          conversationId: conversationId('conversation:missing'),
          id: orphanId,
        };
      }),
    ).rejects.toThrow(/referential integrity/);

    expect(current.readWorld()).toEqual(before);
  });

  it('applies declared media timeline events without changing asset identity', async () => {
    const current = runtime(MEDIA_PARTIALLY_ASSOCIATED_SCENARIO.id);
    const initialClock = current.clock.now().toISOString();
    current.advanceClock(2 * 60_000);
    const through = current.clock.now().toISOString();
    const events = scenarioTimelineBetween({
      afterExclusive: initialClock,
      scenarioId: MEDIA_PARTIALLY_ASSOCIATED_SCENARIO.id,
      throughInclusive: through,
    });

    for (const event of events) {
      await current.mutate(
        { operation: SIMULATION_OPERATION_IDS.scenario.applyEvent },
        (world) => applySimulationDomainEvent(world, event),
      );
    }

    const world = current.readWorld();
    const viewer = world.profiles[GOLDEN_PROFILE_IDS.quanViewer];
    expect(viewer?.media.coverAssetKey).toBe(
      'asset:profile:quan-viewer:cover-pending',
    );
    expect(
      world.assets[
        'asset:profile:quan-viewer:cover-pending' as keyof typeof world.assets
      ]?.state,
    ).toBe('available');
  });

  it('keeps message delivery and notification ownership transitions explicit', async () => {
    const current = runtime();
    const failedId = messageId('message:runtime:failed');
    current.advanceClock(60_000);

    await current.mutate(
      { operation: SIMULATION_OPERATION_IDS.messages.append },
      (world, context) =>
        appendSimulationMessage(world, {
          message: {
            conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
            createdAt: context.clock.now().toISOString(),
            deliveryStatus: 'failed',
            id: failedId,
            kind: 'text',
            senderId: GOLDEN_PROFILE_IDS.quanViewer,
            text: 'Retry me',
          },
          now: context.clock.now().toISOString(),
        }),
    );
    await current.mutate(
      { operation: SIMULATION_OPERATION_IDS.messages.transitionDelivery },
      (world, context) =>
        transitionSimulationMessageDelivery(world, {
          messageId: failedId,
          nextStatus: 'queued',
          now: context.clock.now().toISOString(),
        }),
    );
    await current.mutate(
      { operation: SIMULATION_OPERATION_IDS.notifications.markRead },
      (world, context) =>
        markSimulationNotificationRead(world, {
          notificationId: notificationId('notification:khoa-message'),
          now: context.clock.now().toISOString(),
          profileId: GOLDEN_PROFILE_IDS.quanViewer,
        }),
    );

    const world = current.readWorld();
    expect(world.messages[failedId]?.deliveryStatus).toBe('queued');
    expect(
      world.notifications[notificationId('notification:khoa-message')]?.readAt,
    ).toBe(current.clock.now().toISOString());
  });
});
