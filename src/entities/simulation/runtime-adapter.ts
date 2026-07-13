import {
  assertSimulationJsonValue,
  type SimulationFault as RuntimeSimulationFault,
  type SimulationScenarioDefinition as RuntimeScenarioDefinition,
  type SimulationWorldValidationContext,
} from '@/shared/simulation';

import type { ScenarioId } from './identity';
import { SIMULATION_OPERATION_IDS } from './mutations';
import { SIMULATION_SCENARIOS, simulationScenarioById } from './scenarios';
import type {
  SimulationDomainEvent,
  SimulationFault as DomainSimulationFault,
  SimulationFaultTarget,
  SimulationMutationKind,
} from './scenario-schema';
import {
  SimulationWorldSnapshotSchema,
  type SimulationWorld,
} from './world-schema';
import {
  SimulationIntegrityError,
  type SimulationIntegrityIssue,
  validateSimulationWorld,
} from './validator';

export const SIMULATION_RUNTIME_NAMESPACE = 'liqi.production-simulation.v1';

export class SimulationRuntimeWorldValidationError extends Error {
  constructor(
    message: string,
    readonly operation: string,
    readonly scenarioId: string,
  ) {
    super(message);
    this.name = 'SimulationRuntimeWorldValidationError';
  }
}

const mutationKindsByOperation: Readonly<
  Record<string, readonly SimulationMutationKind[]>
> = {
  [SIMULATION_OPERATION_IDS.messages.append]: [
    'receive-message',
    'send-message',
  ],
  [SIMULATION_OPERATION_IDS.messages.markRead]: ['mark-conversation-read'],
  [SIMULATION_OPERATION_IDS.messages.transitionDelivery]: [
    'retry-message',
    'transition-message-delivery',
  ],
  [SIMULATION_OPERATION_IDS.discover.invitePlayer]: ['invite-player'],
  [SIMULATION_OPERATION_IDS.discover.requestSetJoin]: ['request-set-join'],
  [SIMULATION_OPERATION_IDS.notifications.append]: ['receive-notification'],
  [SIMULATION_OPERATION_IDS.notifications.markRead]: ['mark-notification-read'],
  [SIMULATION_OPERATION_IDS.notifications.markSeenThrough]: [
    'mark-notifications-seen',
  ],
  [SIMULATION_OPERATION_IDS.scenario.applyEvent]: ['apply-scenario-event'],
  [SIMULATION_OPERATION_IDS.sets.join]: ['join-set'],
  [SIMULATION_OPERATION_IDS.sets.leave]: ['leave-set'],
};

export type SimulationFaultOperationBinding = Readonly<{
  operation: string;
  scope?: string;
}>;

export type SimulationFaultOperationCatalog = Readonly<
  Record<SimulationFaultTarget, readonly SimulationFaultOperationBinding[]>
>;

export const SIMULATION_FAULT_OPERATION_CATALOG: SimulationFaultOperationCatalog =
  {
    all: [],
    discover: [
      { operation: SIMULATION_OPERATION_IDS.discover.overview },
      { operation: SIMULATION_OPERATION_IDS.discover.invitePlayer },
      { operation: SIMULATION_OPERATION_IDS.discover.requestSetJoin },
      { operation: SIMULATION_OPERATION_IDS.discover.players },
      { operation: SIMULATION_OPERATION_IDS.discover.sets },
      { operation: SIMULATION_OPERATION_IDS.discover.vibes },
    ],
    home: [{ operation: SIMULATION_OPERATION_IDS.home.dashboard }],
    media: [
      { operation: SIMULATION_OPERATION_IDS.media.resolveAsset },
      { operation: SIMULATION_OPERATION_IDS.media.loadAsset },
      { operation: SIMULATION_OPERATION_IDS.media.resolve },
      { operation: SIMULATION_OPERATION_IDS.media.associate },
    ],
    messages: [
      { operation: SIMULATION_OPERATION_IDS.messages.getConversation },
      { operation: SIMULATION_OPERATION_IDS.messages.listConversations },
      { operation: SIMULATION_OPERATION_IDS.messages.listTimeline },
      { operation: SIMULATION_OPERATION_IDS.messages.sendText },
      { operation: SIMULATION_OPERATION_IDS.messages.sendMedia },
      { operation: SIMULATION_OPERATION_IDS.messages.append },
      { operation: SIMULATION_OPERATION_IDS.messages.markRead },
      { operation: SIMULATION_OPERATION_IDS.messages.transitionDelivery },
    ],
    notifications: [
      { operation: SIMULATION_OPERATION_IDS.notifications.list },
      { operation: SIMULATION_OPERATION_IDS.notifications.summary },
      { operation: SIMULATION_OPERATION_IDS.notifications.append },
      { operation: SIMULATION_OPERATION_IDS.notifications.markRead },
      { operation: SIMULATION_OPERATION_IDS.notifications.markSeenThrough },
    ],
    profile: [
      { operation: SIMULATION_OPERATION_IDS.profile.read },
      { operation: SIMULATION_OPERATION_IDS.profile.update },
    ],
  };

/**
 * Converts one activated domain fault into failNext directives. Offline faults
 * are controller state transitions and intentionally return no directive.
 */
export function projectSimulationFaultToRuntime(
  fault: DomainSimulationFault,
  catalog: SimulationFaultOperationCatalog = SIMULATION_FAULT_OPERATION_CATALOG,
): RuntimeSimulationFault[] {
  if (fault.kind === 'offline') return [];

  const configuredBindings = catalog[fault.target];
  const bindings =
    fault.target === 'all'
      ? ([{}] as readonly Partial<SimulationFaultOperationBinding>[])
      : configuredBindings;
  if (bindings.length === 0) {
    throw new SimulationRuntimeWorldValidationError(
      `Fault ${fault.id} target ${fault.target} has no operation binding.`,
      'scenario.project-fault',
      'unbound',
    );
  }

  const runtimeFault = (
    binding: Partial<SimulationFaultOperationBinding>,
  ): RuntimeSimulationFault => {
    const operation = binding.operation;
    const scope =
      fault.kind === 'media-unavailable' ? fault.assetKey : binding.scope;
    if (fault.kind === 'latency') {
      return {
        durationMs: fault.latencyMs,
        kind: 'latency',
        ...(operation ? { operation } : {}),
        ...(scope ? { scope } : {}),
      };
    }
    if (fault.kind === 'error') {
      const matcher = {
        ...(operation ? { operation } : {}),
        ...(scope ? { scope } : {}),
      };
      switch (fault.code) {
        case 'validation_error':
        case 'validation_failed':
          return {
            ...matcher,
            kind: 'validation_error',
            message: fault.code,
          };
        case 'timeout':
          return { ...matcher, kind: 'timeout', message: fault.code };
        case 'storage_failure':
          return {
            ...matcher,
            kind: 'storage_failure',
            message: fault.code,
          };
        case 'stale_cursor':
          return { ...matcher, kind: 'stale_cursor', message: fault.code };
        default:
          return {
            ...matcher,
            kind: 'retryable_server_error',
            message: fault.code,
          };
      }
    }
    return {
      code: 'remote_asset_unavailable',
      details: { assetKey: fault.assetKey },
      kind: 'partial_failure',
      retryable: true,
      ...(operation ? { operation } : {}),
      scope: fault.assetKey,
    };
  };

  if (fault.kind === 'error') {
    return Array.from({ length: fault.failures }, () =>
      bindings.map(runtimeFault),
    ).flat();
  }
  if (fault.kind === 'media-unavailable') {
    const mediaBindings = bindings.filter(
      (binding) =>
        !binding.operation ||
        [
          SIMULATION_OPERATION_IDS.media.resolveAsset,
          SIMULATION_OPERATION_IDS.media.loadAsset,
          SIMULATION_OPERATION_IDS.media.resolve,
        ].some((operation: string) => operation === binding.operation),
    );
    return (mediaBindings.length ? mediaBindings : bindings).map(runtimeFault);
  }
  return bindings.map(runtimeFault);
}

export type SimulationRuntimeScenarioPlan = Readonly<{
  allowedMutations: readonly SimulationMutationKind[];
  capabilities: readonly string[];
  faults: readonly DomainSimulationFault[];
  timeline: readonly SimulationDomainEvent[];
}>;

/**
 * Senior 2 runtime consumes this array directly. Domain timeline/fault meaning
 * remains in SIMULATION_RUNTIME_SCENARIO_PLANS and is not flattened into world.
 */
export const SIMULATION_RUNTIME_SCENARIOS: readonly RuntimeScenarioDefinition<SimulationWorld>[] =
  Object.values(SIMULATION_SCENARIOS).map((scenario) => ({
    clock: { at: scenario.initialClock },
    id: scenario.id,
    label: scenario.title,
    network: scenario.runtime.initialNetworkState,
    version: scenario.version,
    world: scenario.initialWorld,
  }));

export const SIMULATION_RUNTIME_SCENARIO_PLANS = Object.fromEntries(
  Object.values(SIMULATION_SCENARIOS).map((scenario) => [
    scenario.id,
    {
      allowedMutations: scenario.runtime.allowedMutations,
      capabilities: scenario.runtime.capabilities,
      faults: scenario.runtime.faults,
      timeline: scenario.timeline,
    },
  ]),
) as Record<ScenarioId, SimulationRuntimeScenarioPlan>;

export function simulationRuntimeScenarioPlan(id: ScenarioId) {
  return SIMULATION_RUNTIME_SCENARIO_PLANS[id];
}

/** Operation-aware ingress used by SimulationRuntime before every commit. */
export function validateSimulationWorldForRuntime(
  world: SimulationWorld,
  context: SimulationWorldValidationContext,
): void {
  assertSimulationJsonValue(world);
  const parsed = SimulationWorldSnapshotSchema.parse(world);
  const expectedScenario = simulationScenarioById(
    context.scenarioId as ScenarioId,
  );
  const issues: SimulationIntegrityIssue[] = validateSimulationWorld(parsed);

  if (!expectedScenario) {
    issues.unshift({
      code: 'entity_key_mismatch',
      message: `Runtime operation ${context.operation} used unknown scenario ${context.scenarioId}.`,
      path: 'scenarioId',
    });
  } else if (parsed.scenarioId !== expectedScenario.id) {
    issues.unshift({
      code: 'entity_key_mismatch',
      message: `World scenario ${parsed.scenarioId} does not match runtime scenario ${expectedScenario.id}.`,
      path: 'scenarioId',
    });
  }

  if (issues.length) throw new SimulationIntegrityError(issues);

  const requiredKinds = mutationKindsByOperation[context.operation];
  if (
    requiredKinds &&
    expectedScenario &&
    !requiredKinds.some((kind) =>
      expectedScenario.runtime.allowedMutations.includes(kind),
    )
  ) {
    throw new SimulationRuntimeWorldValidationError(
      `Operation ${context.operation} is not allowed by ${expectedScenario.id}.`,
      context.operation,
      expectedScenario.id,
    );
  }
}

export function scenarioTimelineBetween(input: {
  afterExclusive: string;
  scenarioId: ScenarioId;
  throughInclusive: string;
}) {
  const scenario = simulationScenarioById(input.scenarioId);
  if (!scenario) return [];
  const after = Date.parse(input.afterExclusive);
  const through = Date.parse(input.throughInclusive);
  return scenario.timeline.filter((event) => {
    const at = Date.parse(event.at);
    return at > after && at <= through;
  });
}
