export type ScenarioId = string;
export type SimulationNamespace = string;
export type SimulationNetworkState = 'offline' | 'online';
export type SimulationResetPhase = 'after-world' | 'before-world';

export type SimulationJsonValue =
  | boolean
  | null
  | number
  | string
  | SimulationJsonValue[]
  | { [key: string]: SimulationJsonValue };

type SimulationFaultBase = {
  /** Stable semantic operation name such as `messages.send-text`. */
  operation?: string;
  /** Optional adapter-defined scope such as a conversation or asset id. */
  scope?: string;
  message?: string;
};

export type SimulationFault =
  | (SimulationFaultBase & {
      durationMs: number;
      kind: 'latency';
    })
  | (SimulationFaultBase & {
      kind: 'retryable_server_error';
      status?: number;
    })
  | (SimulationFaultBase & {
      details?: SimulationJsonValue;
      kind: 'validation_error';
    })
  | (SimulationFaultBase & {
      durationMs?: number;
      kind: 'timeout';
    })
  | (SimulationFaultBase & {
      kind: 'storage_failure';
      retryable?: boolean;
    })
  | (SimulationFaultBase & {
      kind: 'stale_cursor';
    })
  | (SimulationFaultBase & {
      /** A response adapter may use either limit or ratio deterministically. */
      limit?: number;
      ratio?: number;
      kind: 'partial_response';
    })
  | (SimulationFaultBase & {
      /** Adapter-owned semantic code, e.g. `media_association_failed`. */
      code: string;
      details?: SimulationJsonValue;
      kind: 'partial_failure';
      retryable?: boolean;
    });

export type ScheduledSimulationFault = SimulationFault & {
  id: string;
};

export type SimulationClockSnapshot = {
  baselineAt: string;
  currentAt: string;
  version: 1;
};

export interface SimulationClock {
  now(): Date;
  freeze(at: string): void;
  advance(durationMs: number): void;
  reset(): void;
}

export type SimulationControllerSnapshot = {
  fixedLatencyMs: number;
  network: SimulationNetworkState;
  nextFaultSequence: number;
  pendingFaults: ScheduledSimulationFault[];
  version: 1;
};

export type SimulationScenarioDefinition<TWorld> = Readonly<{
  clock: Readonly<{ at: string }>;
  fixedLatencyMs?: number;
  id: ScenarioId;
  label?: string;
  network?: SimulationNetworkState;
  version?: number;
  world: TWorld;
}>;

export type SimulationEventType =
  | 'clock_advanced'
  | 'clock_frozen'
  | 'fault_consumed'
  | 'fault_scheduled'
  | 'fixed_latency_changed'
  | 'mutation_committed'
  | 'network_changed'
  | 'reset_completed'
  | 'scenario_selected'
  | 'snapshot_restored';

export type SimulationEvent = Readonly<{
  details?: SimulationJsonValue;
  occurredAt: string;
  operation?: string;
  scenarioId: ScenarioId;
  sequence: number;
  type: SimulationEventType;
}>;

export type SimulationWorldSnapshot<TWorld> = {
  clock: SimulationClockSnapshot;
  controller: SimulationControllerSnapshot;
  createdAt: string;
  eventSequence: number;
  namespace: SimulationNamespace;
  participants: Record<string, SimulationJsonValue>;
  scenarioId: ScenarioId;
  scenarioVersion: number;
  version: 1;
  world: TWorld;
};

export type SimulationResetReason = 'reset' | 'restore' | 'scenario-selection';

export type SimulationResetContext = Readonly<{
  namespace: SimulationNamespace;
  reason: SimulationResetReason;
  scenarioId: ScenarioId;
}>;

export type SimulationResetParticipant<TState = SimulationJsonValue> = {
  key: string;
  order?: number;
  phase?: SimulationResetPhase;
  reset(context: SimulationResetContext): Promise<void> | void;
  restore?: (
    state: TState,
    context: SimulationResetContext,
  ) => Promise<void> | void;
  snapshot?: () => Promise<TState> | TState;
};

export type SimulationOperationInput = Readonly<{
  operation: string;
  scope?: string;
  signal?: AbortSignal;
}>;

export type SimulationOperationContext = Readonly<{
  clock: SimulationClock;
  fault: Extract<
    SimulationFault,
    { kind: 'partial_failure' | 'partial_response' }
  > | null;
  namespace: SimulationNamespace;
  network: SimulationNetworkState;
  scenarioId: ScenarioId;
  startedAt: string;
}>;

export type SimulationWorldValidationContext = Readonly<{
  operation: string;
  scenarioId: ScenarioId;
}>;

export type SimulationRuntimeDebugState<TWorld> = Readonly<{
  clock: SimulationClockSnapshot;
  controller: SimulationControllerSnapshot;
  events: readonly SimulationEvent[];
  namespace: SimulationNamespace;
  scenarioId: ScenarioId;
  world: TWorld;
}>;

export interface ScenarioControlPort<TWorld> {
  selectScenario(id: ScenarioId): Promise<void>;
  reset(): Promise<void>;
  snapshot(): Promise<SimulationWorldSnapshot<TWorld>>;
  restore(snapshot: SimulationWorldSnapshot<TWorld>): Promise<void>;
  freezeClock(at: string): void;
  advanceClock(durationMs: number): void;
  setNetwork(state: SimulationNetworkState): void;
  failNext(fault: SimulationFault): void;
}
