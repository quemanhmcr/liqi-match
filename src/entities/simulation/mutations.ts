import {
  SimulatedMessageSchema,
  SimulatedNotificationSchema,
  SimulatedProfileSchema,
  type SimulatedConversation,
  type SimulatedMessage,
  type SimulatedNotification,
  type SimulatedProfile,
  type SimulationWorldSnapshot,
} from './world-schema';
import type {
  ConversationId,
  MessageId,
  NotificationId,
  ProfileId,
  SetId,
} from './identity';
import type { SimulationDomainEvent } from './scenario-schema';

export const SIMULATION_OPERATION_IDS = {
  discover: {
    overview: 'discover.overview',
    players: 'discover.players',
    requestSetJoin: 'discover.request-set-join',
    sets: 'discover.sets',
    vibes: 'discover.vibes',
  },
  home: {
    dashboard: 'home.dashboard',
  },
  media: {
    associate: 'media.associate',
    loadAsset: 'assets.load',
    resolve: 'media.resolve',
    resolveAsset: 'assets.resolve',
  },
  messages: {
    append: 'messages.append',
    getConversation: 'messages.get-conversation',
    listConversations: 'messages.list-conversations',
    listTimeline: 'messages.list-timeline',
    markRead: 'messages.mark-read',
    sendMedia: 'messages.send-media',
    sendText: 'messages.send-text',
    transitionDelivery: 'messages.transition-delivery',
  },
  notifications: {
    append: 'notifications.append',
    list: 'notifications.list',
    markRead: 'notifications.mark-read',
    markSeenThrough: 'notifications.mark-seen-through',
    summary: 'notifications.summary',
  },
  profile: {
    read: 'profile.read',
    update: 'profile.update',
  },
  scenario: {
    applyEvent: 'scenario.apply-event',
  },
  sets: {
    join: 'sets.join',
    leave: 'sets.leave',
  },
} as const;

export class SimulationDomainMutationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'duplicate_id'
      | 'immutable_field_changed'
      | 'invalid_order'
      | 'invalid_transition'
      | 'not_found'
      | 'recipient_mismatch'
      | 'timestamp_before_world'
      | 'timestamp_in_future',
  ) {
    super(message);
    this.name = 'SimulationDomainMutationError';
  }
}

export function appendSimulationMessage(
  world: SimulationWorldSnapshot,
  input: Readonly<{ message: SimulatedMessage; now: string }>,
) {
  const message = SimulatedMessageSchema.parse(input.message);
  assertMutationClock(world, input.now);
  if (world.messages[message.id]) {
    throw new SimulationDomainMutationError(
      `Message already exists: ${message.id}.`,
      'duplicate_id',
    );
  }
  const conversation = requireConversation(world, message.conversationId);
  assertMessageMembership(conversation, message);
  assertTimestampAtOrBefore(message.createdAt, input.now, 'message.createdAt');
  const latestId = conversation.messageIds.at(-1);
  const latest = latestId ? world.messages[latestId] : undefined;
  if (latest && Date.parse(message.createdAt) < Date.parse(latest.createdAt)) {
    throw new SimulationDomainMutationError(
      `Message ${message.id} is older than the conversation tail ${latest.id}.`,
      'invalid_order',
    );
  }

  world.messages[message.id] = message;
  conversation.messageIds.push(message.id);
  advanceWorldClock(world, input.now);
  return message;
}

export function transitionSimulationMessageDelivery(
  world: SimulationWorldSnapshot,
  input: Readonly<{
    messageId: MessageId;
    nextStatus: SimulatedMessage['deliveryStatus'];
    now: string;
  }>,
) {
  assertMutationClock(world, input.now);
  const message = world.messages[input.messageId];
  if (!message) {
    throw new SimulationDomainMutationError(
      `Message not found: ${input.messageId}.`,
      'not_found',
    );
  }
  const allowed = DELIVERY_TRANSITIONS[message.deliveryStatus];
  if (!allowed.includes(input.nextStatus)) {
    throw new SimulationDomainMutationError(
      `Cannot move message ${message.id} from ${message.deliveryStatus} to ${input.nextStatus}.`,
      'invalid_transition',
    );
  }
  message.deliveryStatus = input.nextStatus;
  advanceWorldClock(world, input.now);
  return message;
}

export function markSimulationConversationRead(
  world: SimulationWorldSnapshot,
  input: Readonly<{
    conversationId: ConversationId;
    profileId: ProfileId;
    throughMessageId: MessageId;
    now: string;
  }>,
) {
  assertMutationClock(world, input.now);
  const conversation = requireConversation(world, input.conversationId);
  const memberState = conversation.memberState[input.profileId];
  if (!memberState || !conversation.memberIds.includes(input.profileId)) {
    throw new SimulationDomainMutationError(
      `Profile ${input.profileId} is not a member of ${input.conversationId}.`,
      'recipient_mismatch',
    );
  }
  const nextIndex = conversation.messageIds.indexOf(input.throughMessageId);
  if (nextIndex < 0) {
    throw new SimulationDomainMutationError(
      `Message ${input.throughMessageId} is not in ${input.conversationId}.`,
      'not_found',
    );
  }
  const currentIndex = memberState.lastReadMessageId
    ? conversation.messageIds.indexOf(memberState.lastReadMessageId)
    : -1;
  if (nextIndex < currentIndex) {
    throw new SimulationDomainMutationError(
      'Conversation read watermark cannot move backwards.',
      'invalid_order',
    );
  }
  memberState.lastReadMessageId = input.throughMessageId;
  for (const id of conversation.messageIds.slice(
    currentIndex + 1,
    nextIndex + 1,
  )) {
    const message = world.messages[id];
    if (
      message?.senderId !== input.profileId &&
      message?.deliveryStatus === 'delivered'
    ) {
      message.deliveryStatus = 'read';
    }
  }
  advanceWorldClock(world, input.now);
}

export function appendSimulationNotification(
  world: SimulationWorldSnapshot,
  input: Readonly<{ notification: SimulatedNotification; now: string }>,
) {
  const notification = SimulatedNotificationSchema.parse(input.notification);
  assertMutationClock(world, input.now);
  if (world.notifications[notification.id]) {
    throw new SimulationDomainMutationError(
      `Notification already exists: ${notification.id}.`,
      'duplicate_id',
    );
  }
  assertTimestampAtOrBefore(
    notification.occurredAt,
    input.now,
    'notification.occurredAt',
  );
  world.notifications[notification.id] = notification;
  advanceWorldClock(world, input.now);
  return notification;
}

export function markSimulationNotificationRead(
  world: SimulationWorldSnapshot,
  input: Readonly<{
    notificationId: NotificationId;
    profileId: ProfileId;
    now: string;
  }>,
) {
  assertMutationClock(world, input.now);
  const notification = world.notifications[input.notificationId];
  if (!notification) {
    throw new SimulationDomainMutationError(
      `Notification not found: ${input.notificationId}.`,
      'not_found',
    );
  }
  if (notification.recipientId !== input.profileId) {
    throw new SimulationDomainMutationError(
      `Notification ${notification.id} does not belong to ${input.profileId}.`,
      'recipient_mismatch',
    );
  }
  notification.seenAt ??= input.now;
  notification.readAt ??= input.now;
  advanceWorldClock(world, input.now);
  return notification;
}

export function markSimulationNotificationsSeenThrough(
  world: SimulationWorldSnapshot,
  input: Readonly<{
    profileId: ProfileId;
    seenThrough: Readonly<{ id: NotificationId; occurredAt: string }>;
    now: string;
  }>,
) {
  assertMutationClock(world, input.now);
  const watermark = world.notifications[input.seenThrough.id];
  if (!watermark) {
    throw new SimulationDomainMutationError(
      `Notification watermark not found: ${input.seenThrough.id}.`,
      'not_found',
    );
  }
  if (watermark.recipientId !== input.profileId) {
    throw new SimulationDomainMutationError(
      `Notification watermark ${watermark.id} does not belong to ${input.profileId}.`,
      'recipient_mismatch',
    );
  }
  if (watermark.occurredAt !== input.seenThrough.occurredAt) {
    throw new SimulationDomainMutationError(
      `Notification watermark timestamp does not match canonical notification ${watermark.id}.`,
      'immutable_field_changed',
    );
  }
  let changed = 0;
  for (const notification of Object.values(world.notifications)) {
    if (
      notification.recipientId === input.profileId &&
      !notification.seenAt &&
      compareWatermark(notification, input.seenThrough) <= 0
    ) {
      notification.seenAt = input.now;
      changed += 1;
    }
  }
  advanceWorldClock(world, input.now);
  return changed;
}

export function applySimulationDomainEvent(
  world: SimulationWorldSnapshot,
  event: SimulationDomainEvent,
) {
  switch (event.kind) {
    case 'message-created':
      appendSimulationMessage(world, { message: event.message, now: event.at });
      break;
    case 'notification-created':
      appendSimulationNotification(world, {
        notification: event.notification,
        now: event.at,
      });
      break;
    case 'profile-propagated':
      replaceSimulationProfile(world, event.profile, event.at);
      break;
    case 'media-associated':
      associateSimulationMedia(world, event);
      break;
    case 'set-membership-changed':
      changeSimulationSetMembership(world, {
        membership: event.membership,
        now: event.at,
        profileId: event.profileId,
        setId: event.setId,
      });
      break;
    case 'fault-cleared':
    case 'network-state-changed':
      // Controller-only events do not mutate the canonical world graph.
      break;
  }
}

function replaceSimulationProfile(
  world: SimulationWorldSnapshot,
  candidateInput: SimulatedProfile,
  now: string,
) {
  assertMutationClock(world, now);
  const candidate = SimulatedProfileSchema.parse(candidateInput);
  const current = world.profiles[candidate.id];
  if (!current) {
    throw new SimulationDomainMutationError(
      `Profile not found: ${candidate.id}.`,
      'not_found',
    );
  }
  if (
    current.identityKey !== candidate.identityKey ||
    current.createdAt !== candidate.createdAt
  ) {
    throw new SimulationDomainMutationError(
      'Profile propagation cannot change identityKey or createdAt.',
      'immutable_field_changed',
    );
  }
  assertTimestampAtOrBefore(candidate.updatedAt, now, 'profile.updatedAt');
  world.profiles[candidate.id] = candidate;
  advanceWorldClock(world, now);
}

function associateSimulationMedia(
  world: SimulationWorldSnapshot,
  event: Extract<SimulationDomainEvent, { kind: 'media-associated' }>,
) {
  assertMutationClock(world, event.at);
  const profile = world.profiles[event.profileId];
  const asset = world.assets[event.assetKey];
  if (!profile || !asset) {
    throw new SimulationDomainMutationError(
      `Missing profile or asset for media association ${event.assetKey}.`,
      'not_found',
    );
  }
  if (
    asset.owner.kind !== 'profile' ||
    asset.owner.id !== profile.id ||
    asset.state !== 'unassociated'
  ) {
    throw new SimulationDomainMutationError(
      `Asset ${asset.key} is not an unassociated asset owned by ${profile.id}.`,
      'invalid_transition',
    );
  }
  const pendingIndex = profile.media.pendingAssociations.findIndex(
    (item) =>
      item.assetKey === event.assetKey &&
      item.slot === event.slot &&
      item.position === event.position,
  );
  if (pendingIndex < 0) {
    throw new SimulationDomainMutationError(
      `Profile has no pending ${event.slot}:${event.position} association for ${event.assetKey}.`,
      'not_found',
    );
  }
  profile.media.pendingAssociations.splice(pendingIndex, 1);
  if (event.slot === 'avatar') profile.media.avatarAssetKey = event.assetKey;
  if (event.slot === 'cover') profile.media.coverAssetKey = event.assetKey;
  if (event.slot === 'wall') {
    if (event.position > profile.media.wallAssetKeys.length) {
      throw new SimulationDomainMutationError(
        `Wall position ${event.position} would create a sparse wall array.`,
        'invalid_order',
      );
    }
    if (event.position === profile.media.wallAssetKeys.length) {
      profile.media.wallAssetKeys.push(event.assetKey);
    } else {
      profile.media.wallAssetKeys[event.position] = event.assetKey;
    }
  }
  profile.canonicalProfile.mediaSelection = {
    avatarSelected: Boolean(
      profile.media.avatarAssetKey ||
      profile.media.pendingAssociations.some((item) => item.slot === 'avatar'),
    ),
    coverSelected: Boolean(
      profile.media.coverAssetKey ||
      profile.media.pendingAssociations.some((item) => item.slot === 'cover'),
    ),
    wallPositions: [
      ...new Set([
        ...profile.media.wallAssetKeys.map((_, index) => index),
        ...profile.media.pendingAssociations
          .filter((item) => item.slot === 'wall')
          .map((item) => item.position),
      ]),
    ].sort((left, right) => left - right),
  };
  profile.updatedAt = event.at;
  asset.state = 'available';
  advanceWorldClock(world, event.at);
}

export function changeSimulationSetMembership(
  world: SimulationWorldSnapshot,
  input: Readonly<{
    membership: 'joined' | 'left';
    now: string;
    profileId: ProfileId;
    setId: SetId;
  }>,
) {
  assertMutationClock(world, input.now);
  const set = world.sets[input.setId];
  if (!set || !world.profiles[input.profileId]) {
    throw new SimulationDomainMutationError(
      `Missing set or profile for membership change.`,
      'not_found',
    );
  }
  const member = set.memberIds.includes(input.profileId);
  if (input.membership === 'joined') {
    if (member) {
      throw new SimulationDomainMutationError(
        `Profile ${input.profileId} is already a set member.`,
        'invalid_transition',
      );
    }
    if (set.memberIds.length >= set.capacity) {
      throw new SimulationDomainMutationError(
        'Set is full.',
        'invalid_transition',
      );
    }
    set.memberIds.push(input.profileId);
  }
  if (input.membership === 'left') {
    if (!member) {
      throw new SimulationDomainMutationError(
        `Profile ${input.profileId} is not a set member.`,
        'invalid_transition',
      );
    }
    if (set.ownerId === input.profileId) {
      throw new SimulationDomainMutationError(
        'Set owner cannot leave without ownership transfer.',
        'immutable_field_changed',
      );
    }
    set.memberIds = set.memberIds.filter((id) => id !== input.profileId);
  }
  delete set.invites[input.profileId];
  delete set.joinRequests[input.profileId];
  set.version += 1;
  set.status = set.memberIds.length >= set.capacity ? 'full' : 'open';
  advanceWorldClock(world, input.now);
  return set;
}

const DELIVERY_TRANSITIONS: Record<
  SimulatedMessage['deliveryStatus'],
  readonly SimulatedMessage['deliveryStatus'][]
> = {
  delivered: ['read'],
  failed: ['queued', 'sending'],
  queued: ['sending', 'failed'],
  read: [],
  sending: ['sent', 'failed'],
  sent: ['delivered', 'failed'],
};

function requireConversation(
  world: SimulationWorldSnapshot,
  id: ConversationId,
): SimulatedConversation {
  const conversation = world.conversations[id];
  if (!conversation) {
    throw new SimulationDomainMutationError(
      `Conversation not found: ${id}.`,
      'not_found',
    );
  }
  return conversation;
}

function assertMessageMembership(
  conversation: SimulatedConversation,
  message: SimulatedMessage,
) {
  if (message.senderId && !conversation.memberIds.includes(message.senderId)) {
    throw new SimulationDomainMutationError(
      `Sender ${message.senderId} is not a member of ${conversation.id}.`,
      'recipient_mismatch',
    );
  }
}

function assertMutationClock(world: SimulationWorldSnapshot, now: string) {
  const current = Date.parse(world.generatedAt);
  const next = Date.parse(now);
  if (!Number.isFinite(next)) {
    throw new SimulationDomainMutationError(
      `Invalid mutation timestamp ${now}.`,
      'timestamp_in_future',
    );
  }
  if (next < current) {
    throw new SimulationDomainMutationError(
      `Mutation timestamp ${now} is before world clock ${world.generatedAt}.`,
      'timestamp_before_world',
    );
  }
}

function assertTimestampAtOrBefore(value: string, now: string, label: string) {
  if (Date.parse(value) > Date.parse(now)) {
    throw new SimulationDomainMutationError(
      `${label} ${value} is after mutation clock ${now}.`,
      'timestamp_in_future',
    );
  }
}

function advanceWorldClock(world: SimulationWorldSnapshot, now: string) {
  world.generatedAt = now;
}

function compareWatermark(
  notification: Pick<SimulatedNotification, 'id' | 'occurredAt'>,
  watermark: Readonly<{ id: NotificationId; occurredAt: string }>,
) {
  const time = notification.occurredAt.localeCompare(watermark.occurredAt);
  return time || notification.id.localeCompare(watermark.id);
}
