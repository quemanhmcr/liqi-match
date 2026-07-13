import { DeterministicSimulationClock } from './clock';
import { cloneSimulationState } from './clone';
import type {
  ScenarioControlPort,
  ScenarioId,
  SimulationEvent,
  SimulationEventType,
  SimulationFault,
  SimulationJsonValue,
  SimulationNetworkState,
  SimulationOperationContext,
  SimulationOperationInput,
  SimulationResetParticipant,
  SimulationRuntimeDebugState,
  SimulationScenarioDefinition,
  SimulationWorldSnapshot,
  SimulationWorldValidationContext,
} from './contracts';
import {
  SimulationFaultController,
  type PreparedSimulationOperation,
  type SimulationDelay,
} from './fault-controller';
import { SimulationContractError, SimulationRequestError } from './errors';
import { SimulationResetRegistry } from './reset-registry';

const DEFAULT_EVENT_HISTORY_LIMIT = 100;

export type SimulationRuntimeOptions<TWorld> = {
  delay?: SimulationDelay;
  eventHistoryLimit?: number;
  initialScenarioId: ScenarioId;
  namespace: string;
  scenarios: readonly SimulationScenarioDefinition<TWorld>[];
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

/**
 * Deterministic, instance-local simulation lifecycle. Domain meaning and
 * invariant validation are injected by the world owner; this class owns only
 * ordering, mutation atomicity, faults, clock and external reset participants.
 */
export class SimulationRuntime<TWorld> implements ScenarioControlPort<TWorld> {
  readonly clock: DeterministicSimulationClock;
  readonly faults: SimulationFaultController;
  readonly resetRegistry = new SimulationResetRegistry();

  private eventHistory: SimulationEvent[] = [];
  private eventSequence = 0;
  private readonly eventHistoryLimit: number;
  private lifecycleQueue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(event: SimulationEvent) => void>();
  private readonly namespace: string;
  private scenarioId: ScenarioId;
  private readonly scenarios = new Map<
    ScenarioId,
    SimulationScenarioDefinition<TWorld>
  >();
  private readonly validateWorld?: SimulationRuntimeOptions<TWorld>['validateWorld'];
  private world: TWorld;

  constructor(options: SimulationRuntimeOptions<TWorld>) {
    this.namespace = normalizeIdentifier(options.namespace, 'namespace');
    this.eventHistoryLimit = normalizeEventHistoryLimit(
      options.eventHistoryLimit ?? DEFAULT_EVENT_HISTORY_LIMIT,
    );
    this.validateWorld = options.validateWorld;

    for (const scenario of options.scenarios) {
      const id = normalizeIdentifier(scenario.id, 'scenario id');
      if (this.scenarios.has(id)) {
        throw new SimulationContractError(
          `Duplicate simulation scenario: ${id}.`,
        );
      }
      this.scenarios.set(id, { ...scenario, id });
    }

    const initial = this.requireScenario(options.initialScenarioId);
    this.scenarioId = initial.id;
    this.world = cloneSimulationState(initial.world);
    this.assertWorld(this.world, 'runtime.initialize', initial.id);
    this.clock = new DeterministicSimulationClock(initial.clock.at);
    this.faults = new SimulationFaultController({
      delay: options.delay,
      fixedLatencyMs: initial.fixedLatencyMs,
      network: initial.network,
    });
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
      const world = cloneSimulationState(scenario.world);
      this.assertWorld(world, 'runtime.select-scenario', scenario.id);
      await this.applyScenario(scenario, world, 'scenario-selection');
      this.emit('scenario_selected', {
        details: { scenarioId: scenario.id },
      });
    });
  }

  reset() {
    return this.enqueueLifecycle(async () => {
      const scenario = this.requireScenario(this.scenarioId);
      const world = cloneSimulationState(scenario.world);
      this.assertWorld(world, 'runtime.reset', scenario.id);
      await this.applyScenario(scenario, world, 'reset');
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
        version: 1 as const,
        world: this.world,
      });
    });
  }

  restore(snapshot: SimulationWorldSnapshot<TWorld>) {
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
    this.clock.freeze(at);
    this.emit('clock_frozen', {
      details: { at: this.clock.now().toISOString() },
    });
  }

  advanceClock(durationMs: number) {
    this.clock.advance(durationMs);
    this.emit('clock_advanced', {
      details: { durationMs, now: this.clock.now().toISOString() },
    });
  }

  setNetwork(state: SimulationNetworkState) {
    if (!this.faults.setNetwork(state)) return;
    this.emit('network_changed', { details: { state } });
  }

  setFixedLatency(durationMs: number) {
    if (!this.faults.setFixedLatency(durationMs)) return;
    this.emit('fixed_latency_changed', { details: { durationMs } });
  }

  failNext(fault: SimulationFault) {
    const scheduled = this.faults.failNext(fault);
    this.emit('fault_scheduled', {
      details: {
        faultId: scheduled.id,
        kind: scheduled.kind,
        operation: scheduled.operation ?? null,
        scope: scheduled.scope ?? null,
      },
    });
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
      const { context } = await this.prepareOperation(input);
      const draft = cloneSimulationState(this.world);
      const result = await mutation(draft, context);
      this.assertWorld(draft, input.operation, this.scenarioId);
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

  private async applyScenario(
    scenario: SimulationScenarioDefinition<TWorld>,
    world: TWorld,
    reason: 'reset' | 'scenario-selection',
  ) {
    const context = {
      namespace: this.namespace,
      reason,
      scenarioId: scenario.id,
    } as const;
    await this.resetRegistry.resetPhase('before-world', context);
    this.scenarioId = scenario.id;
    this.world = world;
    this.clock.setBaseline(scenario.clock.at);
    this.faults.reset({
      fixedLatencyMs: scenario.fixedLatencyMs,
      network: scenario.network,
    });
    this.eventHistory = [];
    this.eventSequence = 0;
    await this.resetRegistry.resetPhase('after-world', context);
  }

  private validateSnapshot(snapshot: SimulationWorldSnapshot<TWorld>) {
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

    const cloned = cloneSimulationState(snapshot);
    const world = cloneSimulationState(cloned.world);
    this.assertWorld(world, 'runtime.restore', scenario.id);

    const temporaryClock = new DeterministicSimulationClock(scenario.clock.at);
    temporaryClock.restore(cloned.clock);
    const temporaryController = new SimulationFaultController();
    temporaryController.restore(cloned.controller);

    return { scenario, snapshot: cloned, world };
  }

  private assertWorld(world: TWorld, operation: string, scenarioId: string) {
    cloneSimulationState(world);
    this.validateWorld?.(world, { operation, scenarioId });
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
    const result = this.lifecycleQueue.catch(() => undefined).then(operation);
    this.lifecycleQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
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
    for (const listener of this.listeners)
      listener(cloneSimulationState(event));
  }
}

export function createSimulationRuntime<TWorld>(
  options: SimulationRuntimeOptions<TWorld>,
) {
  return new SimulationRuntime(options);
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
