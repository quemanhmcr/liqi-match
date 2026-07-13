import type { SimulationFaultId } from './identity';
import type {
  SimulationDomainEvent,
  SimulationRequiredRelation,
  SimulationScenarioDefinition,
} from './scenario-schema';
import { validateSimulationWorld } from './validator';

export type SimulationScenarioIssueCode =
  | 'fault_asset_missing'
  | 'required_relation_missing'
  | 'timeline_asset_missing'
  | 'timeline_conversation_missing'
  | 'timeline_fault_missing'
  | 'timeline_message_missing'
  | 'timeline_profile_missing'
  | 'timeline_set_missing'
  | 'world_integrity_failed';

export type SimulationScenarioIssue = Readonly<{
  code: SimulationScenarioIssueCode;
  message: string;
  path: string;
}>;

export class SimulationScenarioError extends Error {
  constructor(readonly issues: readonly SimulationScenarioIssue[]) {
    super(
      `Simulation scenario failed validation with ${issues.length} issue${issues.length === 1 ? '' : 's'}.`,
    );
    this.name = 'SimulationScenarioError';
  }
}

export function validateSimulationScenario(
  scenario: SimulationScenarioDefinition,
): SimulationScenarioIssue[] {
  const issues: SimulationScenarioIssue[] = validateSimulationWorld(
    scenario.initialWorld,
  ).map((worldIssue) => ({
    code: 'world_integrity_failed',
    message: `${worldIssue.code}: ${worldIssue.message}`,
    path: `initialWorld.${worldIssue.path}`,
  }));

  scenario.requiredRelations.forEach((relation, index) => {
    if (!requiredRelationExists(relation, scenario)) {
      issues.push({
        code: 'required_relation_missing',
        message: `Required ${relation.kind} relation is absent from initialWorld.`,
        path: `requiredRelations.${index}`,
      });
    }
  });

  const knownFaultIds = new Set<SimulationFaultId>();
  for (const [index, fault] of scenario.runtime.faults.entries()) {
    knownFaultIds.add(fault.id);
    if (
      fault.kind === 'media-unavailable' &&
      !scenario.initialWorld.assets[fault.assetKey]
    ) {
      issues.push({
        code: 'fault_asset_missing',
        message: `Fault references missing asset ${fault.assetKey}.`,
        path: `runtime.faults.${index}.assetKey`,
      });
    }
  }

  const knownMessages = new Set(Object.keys(scenario.initialWorld.messages));
  const knownNotifications = new Set(
    Object.keys(scenario.initialWorld.notifications),
  );

  for (const [index, event] of scenario.timeline.entries()) {
    validateTimelineEvent(
      event,
      index,
      scenario,
      knownMessages,
      knownNotifications,
      knownFaultIds,
      issues,
    );
    if (event.kind === 'message-created') knownMessages.add(event.message.id);
    if (event.kind === 'notification-created') {
      knownNotifications.add(event.notification.id);
    }
  }

  return issues;
}

export function assertSimulationScenario(
  scenario: SimulationScenarioDefinition,
): SimulationScenarioDefinition {
  const issues = validateSimulationScenario(scenario);
  if (issues.length) throw new SimulationScenarioError(issues);
  return scenario;
}

function requiredRelationExists(
  relation: SimulationRequiredRelation,
  scenario: SimulationScenarioDefinition,
) {
  const world = scenario.initialWorld;
  switch (relation.kind) {
    case 'match':
      return Object.values(world.matches).some(
        (match) =>
          relation.profileIds.every((id) => match.profileIds.includes(id)) &&
          match.profileIds.every((id) => relation.profileIds.includes(id)),
      );
    case 'set-membership':
      return Boolean(
        world.sets[relation.setId]?.memberIds.includes(relation.profileId),
      );
    case 'conversation-membership':
      return Boolean(
        world.conversations[relation.conversationId]?.memberIds.includes(
          relation.profileId,
        ),
      );
    case 'notification-conversation-link': {
      const notification = world.notifications[relation.notificationId];
      return Boolean(
        notification?.kind === 'direct-message' &&
        notification.payload.conversationId === relation.conversationId &&
        (!relation.messageId ||
          notification.payload.messageId === relation.messageId),
      );
    }
    case 'asset-state':
      return world.assets[relation.assetKey]?.state === relation.state;
  }
}

function validateTimelineEvent(
  event: SimulationDomainEvent,
  index: number,
  scenario: SimulationScenarioDefinition,
  knownMessages: ReadonlySet<string>,
  knownNotifications: ReadonlySet<string>,
  knownFaultIds: ReadonlySet<SimulationFaultId>,
  issues: SimulationScenarioIssue[],
) {
  const world = scenario.initialWorld;
  const path = `timeline.${index}`;
  switch (event.kind) {
    case 'message-created':
      if (!world.conversations[event.message.conversationId]) {
        issues.push({
          code: 'timeline_conversation_missing',
          message: `Message event references missing conversation ${event.message.conversationId}.`,
          path: `${path}.message.conversationId`,
        });
      }
      if (event.message.senderId && !world.profiles[event.message.senderId]) {
        issues.push({
          code: 'timeline_profile_missing',
          message: `Message event references missing sender ${event.message.senderId}.`,
          path: `${path}.message.senderId`,
        });
      }
      break;
    case 'notification-created': {
      const notification = event.notification;
      if (!world.profiles[notification.recipientId]) {
        issues.push({
          code: 'timeline_profile_missing',
          message: `Notification recipient ${notification.recipientId} is missing.`,
          path: `${path}.notification.recipientId`,
        });
      }
      if (
        notification.kind === 'direct-message' &&
        !knownMessages.has(notification.payload.messageId)
      ) {
        issues.push({
          code: 'timeline_message_missing',
          message: `Notification references unknown message ${notification.payload.messageId}.`,
          path: `${path}.notification.payload.messageId`,
        });
      }
      break;
    }
    case 'profile-propagated':
      if (!world.profiles[event.profile.id]) {
        issues.push({
          code: 'timeline_profile_missing',
          message: `Profile propagation references unknown profile ${event.profile.id}.`,
          path: `${path}.profile.id`,
        });
      }
      break;
    case 'media-associated':
      if (!world.profiles[event.profileId]) {
        issues.push({
          code: 'timeline_profile_missing',
          message: `Media association references missing profile ${event.profileId}.`,
          path: `${path}.profileId`,
        });
      }
      if (!world.assets[event.assetKey]) {
        issues.push({
          code: 'timeline_asset_missing',
          message: `Media association references missing asset ${event.assetKey}.`,
          path: `${path}.assetKey`,
        });
      }
      break;
    case 'set-membership-changed':
      if (!world.profiles[event.profileId]) {
        issues.push({
          code: 'timeline_profile_missing',
          message: `Membership event references missing profile ${event.profileId}.`,
          path: `${path}.profileId`,
        });
      }
      if (!world.sets[event.setId]) {
        issues.push({
          code: 'timeline_set_missing',
          message: `Membership event references missing set ${event.setId}.`,
          path: `${path}.setId`,
        });
      }
      break;
    case 'fault-cleared':
      if (!knownFaultIds.has(event.faultId)) {
        issues.push({
          code: 'timeline_fault_missing',
          message: `Fault clear event references missing fault ${event.faultId}.`,
          path: `${path}.faultId`,
        });
      }
      break;
    case 'network-state-changed':
      break;
  }

  if (
    event.kind === 'notification-created' &&
    knownNotifications.has(event.notification.id)
  ) {
    issues.push({
      code: 'required_relation_missing',
      message: `Notification event reuses existing id ${event.notification.id}.`,
      path: `${path}.notification.id`,
    });
  }
  if (event.kind === 'message-created' && knownMessages.has(event.message.id)) {
    issues.push({
      code: 'required_relation_missing',
      message: `Message event reuses existing id ${event.message.id}.`,
      path: `${path}.message.id`,
    });
  }
}
