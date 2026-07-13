import {
  cloneSimulationState,
  createSimulationRuntime,
  type SimulationJsonValue,
  type SimulationRuntime,
  type SimulationScheduledAction,
  type SimulationScenarioDefinition as RuntimeScenarioDefinition,
  type SimulationWorldValidationContext,
} from '@/shared/simulation';

import {
  applySimulationDomainEvent as applyCanonicalSimulationDomainEvent,
  SIMULATION_OPERATION_IDS,
} from './mutations';
import type { SimulationFault as DomainSimulationFault } from './scenario-schema';
import {
  SimulationDomainEventSchema,
  type SimulationDomainEvent,
  type SimulationMutationKind,
  type SimulationScenarioDefinition,
} from './scenario-schema';
import { projectSimulationFaultToRuntime } from './runtime-adapter';
import { assertSimulationScenario } from './scenario-validator';
import {
  SIMULATION_SCENARIOS,
  VIEWER_READY_HAPPY_PATH_SCENARIO,
} from './scenarios';
import { assertSimulationMutationIntegrity } from './mutation-validator';
import { assertSimulationWorldIntegrity } from './validator';
import {
  SimulationWorldSnapshotSchema,
  type SimulationWorldSnapshot,
} from './world-schema';

export type ProductionSimulationRuntime =
  SimulationRuntime<SimulationWorldSnapshot>;

export type CreateProductionSimulationRuntimeOptions = Readonly<{
  initialScenarioId?: string;
  namespace: string;
  scenarios?: readonly SimulationScenarioDefinition[];
}>;

export const SIMULATION_RUNTIME_OPERATIONS = {
  associateMedia: 'media.associate',
  invitePlayer: 'sets.invite-player',
  joinSet: 'sets.join',
  leaveSet: 'sets.leave',
  markNotificationRead: 'notifications.mark-read',
  markNotificationsSeen: SIMULATION_OPERATION_IDS.notifications.markSeenThrough,
  receiveMessage: 'messages.receive',
  requestSetJoin: 'sets.request-join',
  retryMessage: 'messages.retry',
  sendMediaMessage: 'messages.send-media',
  sendTextMessage: 'messages.send-text',
  updateProfile: 'profile.update',
} as const;

export function createProductionSimulationRuntime(
  options: CreateProductionSimulationRuntimeOptions,
): ProductionSimulationRuntime {
  const scenarios = options.scenarios ?? Object.values(SIMULATION_SCENARIOS);
  const runtimeScenarios = scenarios.map(toRuntimeScenario);
  const initialScenarioId =
    options.initialScenarioId ?? VIEWER_READY_HAPPY_PATH_SCENARIO.id;

  return createSimulationRuntime<SimulationWorldSnapshot>({
    applyDomainEvent: (world, payload) =>
      applyCanonicalSimulationDomainEvent(
        world,
        SimulationDomainEventSchema.parse(payload),
      ),
    initialScenarioId,
    mutationKindForOperation: simulationMutationKindForOperation,
    namespace: options.namespace,
    scenarios: runtimeScenarios,
    synchronizeWorldClock: (world, now) => {
      world.generatedAt = now;
    },
    validateMutation: assertSimulationMutationIntegrity,
    validateWorld: assertProductionSimulationWorld,
  });
}

export function toRuntimeScenario(
  input: SimulationScenarioDefinition,
): RuntimeScenarioDefinition<SimulationWorldSnapshot> {
  const scenario = assertSimulationScenario(input);
  return {
    allowedMutations: scenario.runtime.allowedMutations,
    clock: { at: scenario.initialClock },
    id: scenario.id,
    label: scenario.title,
    network: scenario.runtime.initialNetworkState,
    scheduledActions: scenarioScheduledActions(scenario),
    version: scenario.version,
    world: scenario.initialWorld,
  };
}

export function simulationMutationKindForOperation(
  operation: string,
): SimulationMutationKind | null {
  switch (operation) {
    case SIMULATION_OPERATION_IDS.messages.append:
      return 'send-message';
    case SIMULATION_OPERATION_IDS.messages.markRead:
      return 'mark-conversation-read';
    case SIMULATION_OPERATION_IDS.messages.transitionDelivery:
      return 'transition-message-delivery';
    case SIMULATION_OPERATION_IDS.notifications.append:
      return 'receive-notification';
    case SIMULATION_OPERATION_IDS.notifications.markRead:
      return 'mark-notification-read';
    case SIMULATION_OPERATION_IDS.notifications.markSeenThrough:
      return 'mark-notifications-seen';
    case SIMULATION_OPERATION_IDS.scenario.applyEvent:
      return 'apply-scenario-event';
    case SIMULATION_RUNTIME_OPERATIONS.associateMedia:
      return 'associate-media';
    case SIMULATION_RUNTIME_OPERATIONS.invitePlayer:
      return 'invite-player';
    case SIMULATION_RUNTIME_OPERATIONS.markNotificationRead:
      return 'mark-notification-read';
    case SIMULATION_RUNTIME_OPERATIONS.markNotificationsSeen:
      return 'mark-notifications-seen';
    case SIMULATION_RUNTIME_OPERATIONS.receiveMessage:
      return 'receive-message';
    case SIMULATION_RUNTIME_OPERATIONS.requestSetJoin:
      return 'request-set-join';
    case SIMULATION_RUNTIME_OPERATIONS.retryMessage:
      return 'retry-message';
    case SIMULATION_RUNTIME_OPERATIONS.sendMediaMessage:
    case SIMULATION_RUNTIME_OPERATIONS.sendTextMessage:
      return 'send-message';
    case SIMULATION_RUNTIME_OPERATIONS.updateProfile:
      return 'update-profile';
    case SIMULATION_RUNTIME_OPERATIONS.joinSet:
      return 'join-set';
    case SIMULATION_RUNTIME_OPERATIONS.leaveSet:
      return 'leave-set';
    default:
      return null;
  }
}

export function assertProductionSimulationWorld(
  world: SimulationWorldSnapshot,
  context: SimulationWorldValidationContext,
) {
  const parsed = SimulationWorldSnapshotSchema.parse(world);
  if (parsed.generatedAt !== context.now) {
    throw new Error(
      `Simulation world clock ${parsed.generatedAt} does not match runtime clock ${context.now}.`,
    );
  }
  assertSimulationWorldIntegrity(parsed);
}

function scenarioScheduledActions(
  scenario: SimulationScenarioDefinition,
): SimulationScheduledAction[] {
  let sequence = 0;
  const actions: Array<SimulationScheduledAction & { sequence: number }> = [];
  const add = (action: SimulationScheduledAction) => {
    sequence += 1;
    actions.push({ ...action, sequence });
  };

  for (const fault of scenario.runtime.faults) {
    for (const action of faultActions(fault)) add(action);
  }
  for (const event of scenario.timeline) {
    add(eventAction(event));
  }

  return actions
    .sort(
      (left, right) =>
        Date.parse(left.at) - Date.parse(right.at) ||
        left.sequence - right.sequence,
    )
    .map(({ sequence: _sequence, ...action }) => action);
}

function faultActions(
  fault: DomainSimulationFault,
): SimulationScheduledAction[] {
  if (fault.kind === 'offline') {
    return [
      {
        at: fault.activatesAt,
        id: `${fault.id}:activate`,
        kind: 'network',
        state: 'offline',
      },
      ...(fault.clearsAt
        ? [
            {
              at: fault.clearsAt,
              id: `${fault.id}:clear`,
              kind: 'network' as const,
              state: 'online' as const,
            },
          ]
        : []),
    ];
  }

  return projectSimulationFaultToRuntime(fault).flatMap(
    (projectedFault, index): SimulationScheduledAction[] => {
      const faultId = `${fault.id}:${index + 1}`;
      return [
        {
          at: fault.activatesAt,
          fault: projectedFault,
          faultId,
          id: `${fault.id}:activate:${index + 1}`,
          kind: 'schedule_fault',
          uses: fault.kind === 'error' ? 1 : null,
        },
        ...(fault.clearsAt
          ? [
              {
                at: fault.clearsAt,
                faultId,
                id: `${fault.id}:clear:${index + 1}`,
                kind: 'clear_fault' as const,
              },
            ]
          : []),
      ];
    },
  );
}

function eventAction(event: SimulationDomainEvent): SimulationScheduledAction {
  switch (event.kind) {
    case 'network-state-changed':
      return {
        at: event.at,
        id: event.id,
        kind: 'network',
        state: event.state,
      };
    case 'fault-cleared':
      return {
        at: event.at,
        faultId: event.faultId,
        id: event.id,
        kind: 'clear_fault',
      };
    default:
      return {
        at: event.at,
        id: event.id,
        kind: 'domain',
        payload: cloneSimulationState(event) as SimulationJsonValue,
      };
  }
}
