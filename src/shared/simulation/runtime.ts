import {
  DeterministicSimulationClock,
  shiftSimulationTimestamp,
  simulationTimestampMs,
} from './clock';
import { cloneSimulationState } from './clone';
import type {
  ScenarioControlPort,
  ScenarioId,
  SimulationDomainEventContext,
  SimulationEvent,
  SimulationEventType,
  SimulationFault,
  SimulationJsonValue,
  SimulationNetworkState,
  SimulationOperationContext,
  SimulationOperationInput,
  SimulationResetParticipant,
  SimulationRuntimeDebugState,
  SimulationRuntimeSnapshot,
  SimulationScheduledAction,
  SimulationScenarioDefinition,
  SimulationWorldValidationContext,
} from './contracts';
import {
  SimulationFaultController,
  type PreparedSimulationOperation,
  type ScheduleSimulationFaultOptions,
  type SimulationDelay,
} from './fault-controller';
import { SimulationContractError, SimulationRequestError } from './errors';
import { SimulationResetRegistry } from './reset-registry';

const DEFAULT_EVENT_HISTORY_LIMIT = 100;

export type SimulationRuntimeOptions<TWorld> = {
  applyDomainEvent?: (
    world: TWorld,
    payload: SimulationJsonValue,
    context: SimulationDomainEventContext,
  ) => void;
  delay?: SimulationDelay;
  eventHistoryLimit?: number;
  initialScenarioId: ScenarioId;
  mutationKindForOperation?: (operation: string) => string | null;
  namespace: string;
  scenarios: readonly SimulationScenarioDefinition<TWorld>[];
  synchronizeWorldClock?: (world: TWorld, now: string) => void;
  validateMutation?: (
    previous: Readonly<TWorld>,
    next: Readonly<TWorld>,
    context: SimulationWorldValidationContext,
  ) => void;
  validateWorld?: (
    world: TWorld,
    context: SimulationWorldValidationContext,
  ) => void;
};

type SimulationMutation<TWorld, TResult> = (
  draft: TWorld,
  context: SimulationOperationContext,
) => Promise<TResult> | TResult;

type SimulationTask<TResult> = (
  context: SimulationOperationContext,
) => Promise<TResult> | TResult;

type PreparedScenarioState<TWorld> = {
  controller: SimulationFaultController;
  timelineCursor: number;
  world: TWorld;
};

/**
 * Deterministic, instance-local simulation lifecycle. Domain meaning and
 * invariant validation are injected by the world owner; this class owns only
 * ordering, mutation atomicity, faults, clock and external reset participants.
 */
export class SimulationRuntime<TWorld> implements ScenarioControlPort<TWorld> {
  readonly clock: DeterministicSimulationClock;
  readonly faults: SimulationFaultController;
  readonly resetRegistry = new SimulationResetRegistry();

  private readonly applyDomainEvent?: SimulationRuntimeOptions<TWorld>['applyDomainEvent'];
  private eventHistory: SimulationEvent[] = [];
  private eventSequence = 0;
  private readonly eventHistoryLimit: number;
  private lifecycleQueue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(event: SimulationEvent) => void>();
  private readonly mutationKindForOperation?: SimulationRuntimeOptions<TWorld>['mutationKindForOperation'];
  private readonly namespace: string;
  private pendingLifecycleOperations = 0;
  private scenarioId: ScenarioId;
  private readonly scenarios = new Map<
    ScenarioId,
    SimulationScenarioDefinition<TWorld>
  >();
  private readonly synchronizeWorldClock?: SimulationRuntimeOptions<TWorld>['synchronizeWorldClock'];
  private timelineCursor = 0;
  private readonly validateMutation?: SimulationRuntimeOptions<TWorld>['validateMutation'];
  private readonly validateWorld?: SimulationRuntimeOptions<TWorld>['validateWorld'];
  private world: TWorld;

  constructor(options: SimulationRuntimeOptions<TWorld>) {
    this.namespace = normalizeIdentifier(options.namespace, 'namespace');
    this.eventHistoryLimit = normalizeEventHistoryLimit(
      options.eventHistoryLimit ?? DEFAULT_EVENT_HISTORY_LIMIT,
    );
    this.applyDomainEvent = options.applyDomainEvent;
    this.mutationKindForOperation = options.mutationKindForOperation;
    this.synchronizeWorldClock = options.synchronizeWorldClock;
    this.validateMutation = options.validateMutation;
    this.validateWorld = options.validateWorld;

    for (const input of options.scenarios) {
      const scenario = normalizeScenario(input);
      if (this.scenarios.has(scenario.id)) {
        throw new SimulationContractError(
          `Duplicate simulation scenario: ${scenario.id}.`,
        );
      }
      this.scenarios.set(scenario.id, scenario);
    }

    const initial = this.requireScenario(options.initialScenarioId);
    this.scenarioId = initial.id;
    this.clock = new DeterministicSimulationClock(initial.clock.at);
    this.faults = new SimulationFaultController({ delay: options.delay });
    const prepared = this.prepareScenarioState(initial);
    this.world = prepared.world;
    this.timelineCursor = prepared.timelineCursor;
    this.faults.restore(prepared.controller.snapshot());
  }

  getNamespace() {
    return this.namespace;
  }

  getScenarioId() {
    return this.scenarioId;
  }

  readWorld() {
    return cloneSimulationState(this.world);
  }

  readDebugState(): SimulationRuntimeDebugState<TWorld> {
    return cloneSimulationState({
      clock: this.clock.snapshot(),
      controller: this.faults.snapshot(),
      events: this.eventHistory,
      namespace: this.namespace,
      scenarioId: this.scenarioId,
      timelineCursor: this.timelineCursor,
      world: this.world,
    });
  }

  subscribe(listener: (event: SimulationEvent) => void) {
    this.listeners.add(listener);
    return { remove: () => this.listeners.delete(listener) };
  }

  subscribeNetworkState(listener: (state: SimulationNetworkState) => void) {
    return this.faults.subscribeNetworkState(listener);
  }

  registerResetParticipant<TState extends SimulationJsonValue>(
    participant: SimulationResetParticipant<TState>,
  ) {
    return this.resetRegistry.register(participant);
  }

  selectScenario(id: ScenarioId) {
    return this.enqueueLifecycle(async () => {
      const scenario = this.requireScenario(id);
      const prepared = this.prepareScenarioState(scenario);
      await this.applyScenario(scenario, prepared, 'scenario-selection');
      this.emit('scenario_selected', {
        details: { scenarioId: scenario.id },
      });
    });
  }

  reset() {
    return this.enqueueLifecycle(async () => {
      const scenario = this.requireScenario(this.scenarioId);
      const prepared = this.prepareScenarioState(scenario);
      await this.applyScenario(scenario, prepared, 'reset');
      this.emit('reset_completed');
    });
  }

  snapshot() {
    return this.enqueueLifecycle(async () => {
      const participants = await this.resetRegistry.snapshot();
      return cloneSimulationState({
        clock: this.clock.snapshot(),
        controller: this.faults.snapshot(),
        createdAt: this.clock.now().toISOString(),
        eventSequence: this.eventSequence,
        namespace: this.namespace,
        participants,
        scenarioId: this.scenarioId,
        scenarioVersion: this.requireScenario(this.scenarioId).version ?? 1,
        timelineCursor: this.timelineCursor,
        version: 1 as const,
        world: this.world,
      });
    });
  }

  restore(snapshot: SimulationRuntimeSnapshot<TWorld>) {
    return this.enqueueLifecycle(async () => {
      const validated = this.validateSnapshot(snapshot);
      const context = {
        namespace: this.namespace,
        reason: 'restore' as const,
        scenarioId: validated.scenario.id,
      };

      await this.resetRegistry.resetPhase('before-world', context);
      this.scenarioId = validated.scenario.id;
      this.world = validated.world;
      this.clock.restore(validated.snapshot.clock);
      this.faults.restore(validated.snapshot.controller);
      this.timelineCursor = validated.snapshot.timelineCursor;
      this.eventHistory = [];
      this.eventSequence = validated.snapshot.eventSequence;
      await this.resetRegistry.restorePhase(
        'before-world',
        validated.snapshot.participants,
        context,
      );
      await this.resetRegistry.restorePhase(
        'after-world',
        validated.snapshot.participants,
        context,
      );
      this.emit('snapshot_restored', {
        details: { createdAt: validated.snapshot.createdAt },
      });
    });
  }

  freezeClock(at: string) {
    this.assertClockControlAvailable();
    this.assertScenarioMutationKindAllowed('advance-clock', 'freeze clock');
    this.moveClockTo(at, 'runtime.freeze-clock');
    this.emit('clock_frozen', {
      details: { at: this.clock.now().toISOString() },
    });
  }

  advanceClock(durationMs: number) {
    this.assertClockControlAvailable();
    this.assertScenarioMutationKindAllowed('advance-clock', 'advance clock');
    const currentAt = this.clock.now().toISOString();
    const targetAt = shiftSimulationTimestamp(
      currentAt,
      durationMs,
      'Clock durationMs',
    );
    this.moveClockTo(targetAt, 'runtime.advance-clock');
    this.emit('clock_advanced', {
      details: { durationMs, now: targetAt },
    });
  }

  setNetwork(state: SimulationNetworkState) {
    this.assertScenarioMutationKindAllowed(
      'set-network-state',
      'set network state',
    );
    if (!this.faults.setNetwork(state)) return;
    this.emit('network_changed', { details: { state } });
  }

  setFixedLatency(durationMs: number) {
    if (!this.faults.setFixedLatency(durationMs)) return;
    this.emit('fixed_latency_changed', { details: { durationMs } });
  }

  failNext(fault: SimulationFault) {
    const scheduled = this.faults.failNext(fault);
    this.emitFaultScheduled(scheduled);
  }

  scheduleFault(
    fault: SimulationFault,
    options: ScheduleSimulationFaultOptions = {},
  ) {
    const scheduled = this.faults.scheduleFault(fault, options);
    this.emitFaultScheduled(scheduled);
    return scheduled.id;
  }

  clearFault(id: string) {
    if (!this.faults.clearFault(id)) return false;
    this.emit('fault_cleared', { details: { faultId: id } });
    return true;
  }

  execute<TResult>(
    input: SimulationOperationInput,
    task: SimulationTask<TResult>,
  ) {
    return this.enqueueLifecycle(async () => {
      const { context } = await this.prepareOperation(input);
      return task(context);
    });
  }

  mutate<TResult>(
    input: SimulationOperationInput,
    mutation: SimulationMutation<TWorld, TResult>,
  ) {
    return this.enqueueLifecycle(async () => {
      this.assertMutationAllowed(input.operation);
      const { context } = await this.prepareOperation(input);
      const previous = cloneSimulationState(this.world);
      const draft = cloneSimulationState(this.world);
      const result = await mutation(draft, context);
      const now = this.clock.now().toISOString();
      this.synchronizeWorldClock?.(draft, now);
      this.assertTransition(
        previous,
        draft,
        input.operation,
        this.scenarioId,
        now,
      );
      this.world = draft;
      this.emit('mutation_committed', {
        operation: input.operation,
        details: input.scope ? { scope: input.scope } : undefined,
      });
      return result;
    });
  }

  async whenIdle() {
    await this.lifecycleQueue;
  }

  private async prepareOperation(input: SimulationOperationInput) {
    let prepared: PreparedSimulationOperation;
    try {
      prepared = await this.faults.prepare(input);
    } catch (error) {
      if (error instanceof SimulationRequestError && error.fault) {
        this.emitFaultConsumed(error.fault, input.operation);
      }
      throw error;
    }

    if (prepared.consumedFault) {
      this.emitFaultConsumed(prepared.consumedFault, input.operation);
    }
    const context: SimulationOperationContext = {
      clock: this.clock,
      fault: prepared.directive,
      namespace: this.namespace,
      network: this.faults.getNetworkState(),
      scenarioId: this.scenarioId,
      startedAt: this.clock.now().toISOString(),
    };
    return { context, prepared };
  }

  private prepareScenarioState(
    scenario: SimulationScenarioDefinition<TWorld>,
  ): PreparedScenarioState<TWorld> {
    const world = cloneSimulationState(scenario.world);
    const controller = new SimulationFaultController({
      fixedLatencyMs: scenario.fixedLatencyMs,
      network: scenario.network,
    });
    let timelineCursor = 0;
    const baselineAt = scenario.clock.at;
    this.synchronizeWorldClock?.(world, baselineAt);

    const actions = scenario.scheduledActions ?? [];
    while (
      timelineCursor < actions.length &&
      simulationTimestampMs(actions[timelineCursor]!.at) <=
        simulationTimestampMs(baselineAt)
    ) {
      this.applyScheduledAction(
        actions[timelineCursor]!,
        world,
        controller,
        scenario.id,
      );
      timelineCursor += 1;
    }

    this.assertWorld(
      world,
      'runtime.initialize-scenario',
      scenario.id,
      baselineAt,
    );
    return { controller, timelineCursor, world };
  }

  private async applyScenario(
    scenario: SimulationScenarioDefinition<TWorld>,
    prepared: PreparedScenarioState<TWorld>,
    reason: 'reset' | 'scenario-selection',
  ) {
    const context = {
      namespace: this.namespace,
      reason,
      scenarioId: scenario.id,
    } as const;
    await this.resetRegistry.resetPhase('before-world', context);
    this.scenarioId = scenario.id;
    this.world = prepared.world;
    this.clock.setBaseline(scenario.clock.at);
    this.faults.restore(prepared.controller.snapshot());
    this.timelineCursor = prepared.timelineCursor;
    this.eventHistory = [];
    this.eventSequence = 0;
    await this.resetRegistry.resetPhase('after-world', context);
  }

  private moveClockTo(targetAt: string, operation: string) {
    const targetMs = simulationTimestampMs(targetAt, 'target clock');
    const currentMs = simulationTimestampMs(
      this.clock.now().toISOString(),
      'current clock',
    );
    if (targetMs < currentMs && this.timelineCursor > 0) {
      throw new SimulationContractError(
        'The simulation clock cannot rewind after scheduled actions have been applied. Restore or reset a snapshot instead.',
      );
    }

    const scenario = this.requireScenario(this.scenarioId);
    const actions = scenario.scheduledActions ?? [];
    const previous = cloneSimulationState(this.world);
    const draft = cloneSimulationState(this.world);
    const controller = this.faults.fork();
    let nextCursor = this.timelineCursor;
    const applied: SimulationScheduledAction[] = [];

    while (
      nextCursor < actions.length &&
      simulationTimestampMs(actions[nextCursor]!.at) <= targetMs
    ) {
      const action = actions[nextCursor]!;
      this.synchronizeWorldClock?.(draft, action.at);
      this.applyScheduledAction(action, draft, controller, this.scenarioId);
      applied.push(action);
      nextCursor += 1;
    }

    this.synchronizeWorldClock?.(draft, targetAt);
    this.assertTransition(
      previous,
      draft,
      operation,
      this.scenarioId,
      targetAt,
    );

    this.world = draft;
    this.clock.freeze(targetAt);
    this.faults.restore(controller.snapshot());
    this.timelineCursor = nextCursor;
    for (const action of applied) {
      this.emit('scheduled_action_applied', {
        details: {
          actionId: action.id,
          at: action.at,
          kind: action.kind,
        },
      });
    }
  }

  private applyScheduledAction(
    action: SimulationScheduledAction,
    world: TWorld,
    controller: SimulationFaultController,
    scenarioId: ScenarioId,
  ) {
    switch (action.kind) {
      case 'network':
        controller.setNetwork(action.state);
        return;
      case 'fixed_latency':
        controller.setFixedLatency(action.durationMs);
        return;
      case 'schedule_fault':
        controller.scheduleFault(action.fault, {
          id: action.faultId,
          uses: action.uses,
        });
        return;
      case 'clear_fault':
        controller.clearFault(action.faultId);
        return;
      case 'domain':
        if (!this.applyDomainEvent) {
          throw new SimulationContractError(
            `Scenario ${scenarioId} requires a domain event reducer for action ${action.id}.`,
          );
        }
        this.applyDomainEvent(world, cloneSimulationState(action.payload), {
          actionId: action.id,
          at: action.at,
          network: controller.getNetworkState(),
          scenarioId,
        });
    }
  }

  private validateSnapshot(snapshot: SimulationRuntimeSnapshot<TWorld>) {
    if (snapshot.version !== 1) {
      throw new SimulationContractError(
        `Unsupported simulation snapshot version: ${String(snapshot.version)}.`,
      );
    }
    if (snapshot.namespace !== this.namespace) {
      throw new SimulationContractError(
        `Snapshot namespace ${snapshot.namespace} cannot be restored into ${this.namespace}.`,
      );
    }
    if (
      !Number.isInteger(snapshot.eventSequence) ||
      snapshot.eventSequence < 0
    ) {
      throw new SimulationContractError(
        'Snapshot eventSequence must be a non-negative integer.',
      );
    }

    const scenario = this.requireScenario(snapshot.scenarioId);
    const scenarioVersion = scenario.version ?? 1;
    if (snapshot.scenarioVersion !== scenarioVersion) {
      throw new SimulationContractError(
        `Snapshot scenario version ${snapshot.scenarioVersion} does not match ${scenario.id}@${scenarioVersion}.`,
      );
    }
    const actionCount = scenario.scheduledActions?.length ?? 0;
    if (
      !Number.isInteger(snapshot.timelineCursor) ||
      snapshot.timelineCursor < 0 ||
      snapshot.timelineCursor > actionCount
    ) {
      throw new SimulationContractError(
        `Snapshot timelineCursor must be between 0 and ${actionCount}.`,
      );
    }

    const cloned = cloneSimulationState(snapshot);
    const world = cloneSimulationState(cloned.world);
    const now = cloned.clock.currentAt;
    this.assertWorld(world, 'runtime.restore', scenario.id, now);

    const temporaryClock = new DeterministicSimulationClock(scenario.clock.at);
    temporaryClock.restore(cloned.clock);
    const temporaryController = new SimulationFaultController();
    temporaryController.restore(cloned.controller);

    return { scenario, snapshot: cloned, world };
  }

  private assertWorld(
    world: TWorld,
    operation: string,
    scenarioId: string,
    now: string,
  ) {
    cloneSimulationState(world);
    this.validateWorld?.(world, { now, operation, scenarioId });
  }

  private assertTransition(
    previous: Readonly<TWorld>,
    next: TWorld,
    operation: string,
    scenarioId: string,
    now: string,
  ) {
    const context = { now, operation, scenarioId };
    this.assertWorld(next, operation, scenarioId, now);
    this.validateMutation?.(previous, next, context);
  }

  private assertMutationAllowed(operation: string) {
    const scenario = this.requireScenario(this.scenarioId);
    if (!scenario.allowedMutations) return;
    const mutationKind = this.mutationKindForOperation
      ? this.mutationKindForOperation(operation)
      : operation;
    if (mutationKind && scenario.allowedMutations.includes(mutationKind))
      return;
    throw new SimulationContractError(
      `Mutation ${operation} is not allowed by scenario ${scenario.id}.`,
    );
  }

  private assertClockControlAvailable() {
    if (this.pendingLifecycleOperations > 0) {
      throw new SimulationContractError(
        'Clock control requires an idle simulation runtime.',
      );
    }
  }

  private assertScenarioMutationKindAllowed(
    mutationKind: string,
    description: string,
  ) {
    const scenario = this.requireScenario(this.scenarioId);
    if (!scenario.allowedMutations) return;
    if (scenario.allowedMutations.includes(mutationKind)) return;
    throw new SimulationContractError(
      `Scenario ${scenario.id} does not allow runtime to ${description}.`,
    );
  }

  private requireScenario(id: ScenarioId) {
    const normalized = normalizeIdentifier(id, 'scenario id');
    const scenario = this.scenarios.get(normalized);
    if (!scenario) {
      throw new SimulationContractError(
        `Unknown simulation scenario: ${normalized}.`,
      );
    }
    return scenario;
  }

  private enqueueLifecycle<TResult>(
    operation: () => Promise<TResult> | TResult,
  ): Promise<TResult> {
    this.pendingLifecycleOperations += 1;
    const result = this.lifecycleQueue.catch(() => undefined).then(operation);
    this.lifecycleQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      this.pendingLifecycleOperations -= 1;
    });
  }

  private emitFaultScheduled(fault: {
    id: string;
    kind: string;
    operation?: string;
    operationPrefix?: string;
    scope?: string;
  }) {
    this.emit('fault_scheduled', {
      details: {
        faultId: fault.id,
        kind: fault.kind,
        operation: fault.operation ?? null,
        operationPrefix: fault.operationPrefix ?? null,
        scope: fault.scope ?? null,
      },
    });
  }

  private emitFaultConsumed(
    fault: { id: string; kind: string },
    operation: string,
  ) {
    this.emit('fault_consumed', {
      operation,
      details: { faultId: fault.id, kind: fault.kind },
    });
  }

  private emit(
    type: SimulationEventType,
    input: { details?: SimulationJsonValue; operation?: string } = {},
  ) {
    this.eventSequence += 1;
    const eventInput: {
      details?: SimulationJsonValue;
      occurredAt: string;
      operation?: string;
      scenarioId: ScenarioId;
      sequence: number;
      type: SimulationEventType;
    } = {
      occurredAt: this.clock.now().toISOString(),
      scenarioId: this.scenarioId,
      sequence: this.eventSequence,
      type,
    };
    if (input.details !== undefined) eventInput.details = input.details;
    if (input.operation !== undefined) eventInput.operation = input.operation;
    const event = cloneSimulationState(eventInput) as SimulationEvent;
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.eventHistoryLimit) {
      this.eventHistory.splice(
        0,
        this.eventHistory.length - this.eventHistoryLimit,
      );
    }
    for (const listener of this.listeners) {
      listener(cloneSimulationState(event));
    }
  }
}

export function createSimulationRuntime<TWorld>(
  options: SimulationRuntimeOptions<TWorld>,
) {
  return new SimulationRuntime(options);
}

function normalizeScenario<TWorld>(
  input: SimulationScenarioDefinition<TWorld>,
): SimulationScenarioDefinition<TWorld> {
  const id = normalizeIdentifier(input.id, 'scenario id');
  const baselineMs = simulationTimestampMs(input.clock.at, 'scenario clock');
  const seenActionIds = new Set<string>();
  let previousAt = baselineMs;
  const actions = (input.scheduledActions ?? []).map((action, index) => {
    const cloned = cloneSimulationState(action);
    const actionId = normalizeIdentifier(cloned.id, 'scheduled action id');
    if (seenActionIds.has(actionId)) {
      throw new SimulationContractError(
        `Duplicate scheduled action id in ${id}: ${actionId}.`,
      );
    }
    seenActionIds.add(actionId);
    const actionAt = simulationTimestampMs(
      cloned.at,
      `scheduled action ${actionId}`,
    );
    if (actionAt < baselineMs) {
      throw new SimulationContractError(
        `Scheduled action ${actionId} occurs before scenario ${id}.`,
      );
    }
    if (index > 0 && actionAt < previousAt) {
      throw new SimulationContractError(
        `Scheduled actions for ${id} must be ordered by timestamp.`,
      );
    }
    previousAt = actionAt;
    return cloned;
  });

  const allowedMutations = input.allowedMutations
    ? input.allowedMutations.map((mutation) =>
        normalizeIdentifier(mutation, 'allowed mutation'),
      )
    : undefined;
  if (
    allowedMutations &&
    new Set(allowedMutations).size !== allowedMutations.length
  ) {
    throw new SimulationContractError(
      `Scenario ${id} contains duplicate allowed mutations.`,
    );
  }

  return {
    ...(allowedMutations ? { allowedMutations } : {}),
    clock: { at: input.clock.at },
    ...(input.fixedLatencyMs !== undefined
      ? { fixedLatencyMs: input.fixedLatencyMs }
      : {}),
    id,
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.network !== undefined ? { network: input.network } : {}),
    ...(actions.length ? { scheduledActions: actions } : {}),
    ...(input.version !== undefined ? { version: input.version } : {}),
    world: cloneSimulationState(input.world),
  };
}

function normalizeIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new SimulationContractError(
      `Simulation ${label} must be a non-empty string.`,
    );
  }
  return normalized;
}

function normalizeEventHistoryLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new SimulationContractError(
      'Simulation eventHistoryLimit must be a positive integer.',
    );
  }
  return limit;
}
