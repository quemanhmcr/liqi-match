import type {
  AssetKey,
  ConversationId,
  MessageId,
  NotificationId,
  ProfileId,
  SetId,
} from './identity';
import type {
  SimulatedAssetManifestEntry,
  SimulatedConversation,
  SimulatedMessage,
  SimulatedNotification,
  SimulatedProfile,
  SimulatedSet,
  SimulationDeepLinkTarget,
  SimulationWorldSnapshot,
} from './world-schema';

export type SimulationIntegrityIssueCode =
  | 'asset_key_missing'
  | 'asset_owner_missing'
  | 'conversation_member_missing'
  | 'conversation_member_state_missing'
  | 'conversation_message_missing'
  | 'conversation_message_mismatch'
  | 'conversation_set_missing'
  | 'conversation_typing_member_missing'
  | 'duplicate_logical_actor'
  | 'entity_key_mismatch'
  | 'match_conversation_member_mismatch'
  | 'match_conversation_missing'
  | 'match_profile_missing'
  | 'match_set_missing'
  | 'message_conversation_missing'
  | 'message_sender_missing'
  | 'message_sender_not_member'
  | 'message_set_missing'
  | 'notification_conversation_missing'
  | 'notification_message_missing'
  | 'notification_profile_missing'
  | 'notification_set_missing'
  | 'profile_media_summary_mismatch'
  | 'set_member_missing'
  | 'set_owner_missing'
  | 'timestamp_after_world_clock'
  | 'viewer_missing';

export type SimulationIntegrityIssue = Readonly<{
  code: SimulationIntegrityIssueCode;
  message: string;
  path: string;
}>;

export class SimulationIntegrityError extends Error {
  constructor(readonly issues: readonly SimulationIntegrityIssue[]) {
    super(
      `Simulation world failed referential integrity with ${issues.length} issue${issues.length === 1 ? '' : 's'}.`,
    );
    this.name = 'SimulationIntegrityError';
  }
}

export function validateSimulationWorld(
  world: SimulationWorldSnapshot,
): SimulationIntegrityIssue[] {
  const issues: SimulationIntegrityIssue[] = [];
  const profileIds = new Set(Object.keys(world.profiles));
  const setIds = new Set(Object.keys(world.sets));
  const conversationIds = new Set(Object.keys(world.conversations));
  const messageIds = new Set(Object.keys(world.messages));
  const assetKeys = new Set(Object.keys(world.assets));

  if (!profileIds.has(world.viewerId)) {
    issues.push(
      issue(
        'viewer_missing',
        'viewerId must reference an existing profile.',
        'viewerId',
      ),
    );
  }

  validateRecordKeys(world.profiles, 'profiles', issues);
  validateRecordKeys(world.sets, 'sets', issues);
  validateRecordKeys(world.matches, 'matches', issues);
  validateRecordKeys(world.conversations, 'conversations', issues);
  validateRecordKeys(world.messages, 'messages', issues);
  validateRecordKeys(world.notifications, 'notifications', issues);
  validateAssetRecordKeys(world.assets, issues);
  validateLogicalActors(world.profiles, issues);

  for (const profile of Object.values(world.profiles)) {
    validateProfile(profile, world, assetKeys, issues);
    validateTimestamp(
      profile.createdAt,
      world,
      `profiles.${profile.id}.createdAt`,
      issues,
    );
    validateTimestamp(
      profile.updatedAt,
      world,
      `profiles.${profile.id}.updatedAt`,
      issues,
    );
    validateTimestamp(
      profile.presence.changedAt,
      world,
      `profiles.${profile.id}.presence.changedAt`,
      issues,
    );
    if (profile.readiness.since) {
      validateTimestamp(
        profile.readiness.since,
        world,
        `profiles.${profile.id}.readiness.since`,
        issues,
      );
    }
  }

  for (const set of Object.values(world.sets)) {
    validateSet(set, profileIds, assetKeys, world, issues);
  }

  for (const conversation of Object.values(world.conversations)) {
    validateConversation(
      conversation,
      profileIds,
      setIds,
      messageIds,
      world,
      issues,
    );
  }

  for (const message of Object.values(world.messages)) {
    validateMessage(message, world, assetKeys, issues);
  }

  for (const match of Object.values(world.matches)) {
    for (const [index, profileId] of match.profileIds.entries()) {
      if (!profileIds.has(profileId)) {
        issues.push(
          issue(
            'match_profile_missing',
            `Match references missing profile ${profileId}.`,
            `matches.${match.id}.profileIds.${index}`,
          ),
        );
      }
    }
    if (match.setId && !setIds.has(match.setId)) {
      issues.push(
        issue(
          'match_set_missing',
          `Match references missing set ${match.setId}.`,
          `matches.${match.id}.setId`,
        ),
      );
    }
    if (match.conversationId) {
      const conversation = world.conversations[match.conversationId];
      if (!conversation) {
        issues.push(
          issue(
            'match_conversation_missing',
            `Match references missing conversation ${match.conversationId}.`,
            `matches.${match.id}.conversationId`,
          ),
        );
      } else if (!sameMembers(conversation.memberIds, match.profileIds)) {
        issues.push(
          issue(
            'match_conversation_member_mismatch',
            'Direct match conversation members must equal match participants.',
            `matches.${match.id}.conversationId`,
          ),
        );
      }
    }
    validateTimestamp(
      match.createdAt,
      world,
      `matches.${match.id}.createdAt`,
      issues,
    );
    if (match.unmatchedAt) {
      validateTimestamp(
        match.unmatchedAt,
        world,
        `matches.${match.id}.unmatchedAt`,
        issues,
      );
    }
  }

  for (const notification of Object.values(world.notifications)) {
    validateNotification(notification, world, issues);
  }

  for (const asset of Object.values(world.assets)) {
    validateAssetOwner(asset, world, issues);
  }

  return issues;
}

export function assertSimulationWorldIntegrity(world: SimulationWorldSnapshot) {
  const issues = validateSimulationWorld(world);
  if (issues.length) throw new SimulationIntegrityError(issues);
  return world;
}

function validateRecordKeys<T extends { id: string }>(
  records: Record<string, T>,
  table: string,
  issues: SimulationIntegrityIssue[],
) {
  for (const [key, entity] of Object.entries(records)) {
    if (key !== entity.id) {
      issues.push(
        issue(
          'entity_key_mismatch',
          `${table} key ${key} does not match entity id ${entity.id}.`,
          `${table}.${key}.id`,
        ),
      );
    }
  }
}

function validateAssetRecordKeys(
  assets: Record<AssetKey, SimulatedAssetManifestEntry>,
  issues: SimulationIntegrityIssue[],
) {
  for (const [key, asset] of Object.entries(assets)) {
    if (key !== asset.key) {
      issues.push(
        issue(
          'entity_key_mismatch',
          `assets key ${key} does not match asset key ${asset.key}.`,
          `assets.${key}.key`,
        ),
      );
    }
  }
}

function validateLogicalActors(
  profiles: Record<ProfileId, SimulatedProfile>,
  issues: SimulationIntegrityIssue[],
) {
  const byIdentityKey = new Map<string, ProfileId>();
  for (const profile of Object.values(profiles)) {
    const existing = byIdentityKey.get(profile.identityKey);
    if (existing && existing !== profile.id) {
      issues.push(
        issue(
          'duplicate_logical_actor',
          `Profiles ${existing} and ${profile.id} share logical identity ${profile.identityKey}.`,
          `profiles.${profile.id}.identityKey`,
        ),
      );
    } else {
      byIdentityKey.set(profile.identityKey, profile.id);
    }
  }
}

function validateProfile(
  profile: SimulatedProfile,
  world: SimulationWorldSnapshot,
  assetKeys: ReadonlySet<string>,
  issues: SimulationIntegrityIssue[],
) {
  const refs: Array<readonly [AssetKey | null, string]> = [
    [profile.media.avatarAssetKey, 'avatarAssetKey'],
    [profile.media.coverAssetKey, 'coverAssetKey'],
    ...profile.media.wallAssetKeys.map(
      (key, index) => [key, `wallAssetKeys.${index}`] as const,
    ),
    ...profile.media.pendingAssociations.map(
      (item, index) =>
        [item.assetKey, `pendingAssociations.${index}.assetKey`] as const,
    ),
  ];
  for (const [key, suffix] of refs) {
    if (key && !assetKeys.has(key)) {
      issues.push(
        issue(
          'asset_key_missing',
          `Profile references missing asset ${key}.`,
          `profiles.${profile.id}.media.${suffix}`,
        ),
      );
    }
  }

  const summary = profile.canonicalProfile.mediaSelection;
  const pendingAvatar = profile.media.pendingAssociations.some(
    (item) => item.slot === 'avatar',
  );
  const pendingCover = profile.media.pendingAssociations.some(
    (item) => item.slot === 'cover',
  );
  if (
    summary.avatarSelected !==
    Boolean(profile.media.avatarAssetKey || pendingAvatar)
  ) {
    issues.push(
      issue(
        'profile_media_summary_mismatch',
        'avatarSelected must match an associated or pending avatar.',
        `profiles.${profile.id}.canonicalProfile.mediaSelection.avatarSelected`,
      ),
    );
  }
  if (
    summary.coverSelected !==
    Boolean(profile.media.coverAssetKey || pendingCover)
  ) {
    issues.push(
      issue(
        'profile_media_summary_mismatch',
        'coverSelected must match an associated or pending cover.',
        `profiles.${profile.id}.canonicalProfile.mediaSelection.coverSelected`,
      ),
    );
  }
  const selectedWallPositions = new Set(summary.wallPositions);
  const associatedWallPositions = new Set(
    profile.media.wallAssetKeys.map((_, index) => index),
  );
  for (const pending of profile.media.pendingAssociations) {
    if (pending.slot === 'wall') associatedWallPositions.add(pending.position);
  }
  if (!sameNumberSet(selectedWallPositions, associatedWallPositions)) {
    issues.push(
      issue(
        'profile_media_summary_mismatch',
        'wallPositions must match associated and pending wall media.',
        `profiles.${profile.id}.canonicalProfile.mediaSelection.wallPositions`,
      ),
    );
  }

  for (const pending of profile.media.pendingAssociations) {
    const asset = world.assets[pending.assetKey];
    if (asset && asset.state !== 'unassociated') {
      issues.push(
        issue(
          'profile_media_summary_mismatch',
          `Pending asset ${pending.assetKey} must use unassociated manifest state.`,
          `profiles.${profile.id}.media.pendingAssociations`,
        ),
      );
    }
  }
}

function validateSet(
  set: SimulatedSet,
  profileIds: ReadonlySet<string>,
  assetKeys: ReadonlySet<string>,
  world: SimulationWorldSnapshot,
  issues: SimulationIntegrityIssue[],
) {
  if (!profileIds.has(set.ownerId)) {
    issues.push(
      issue(
        'set_owner_missing',
        `Set owner ${set.ownerId} does not exist.`,
        `sets.${set.id}.ownerId`,
      ),
    );
  }
  for (const [index, memberId] of set.memberIds.entries()) {
    if (!profileIds.has(memberId)) {
      issues.push(
        issue(
          'set_member_missing',
          `Set member ${memberId} does not exist.`,
          `sets.${set.id}.memberIds.${index}`,
        ),
      );
    }
  }
  for (const table of [
    'compatibilityByProfile',
    'invites',
    'joinRequests',
  ] as const) {
    for (const profileId of Object.keys(set[table])) {
      if (!profileIds.has(profileId)) {
        issues.push(
          issue(
            'set_member_missing',
            `${table} references missing profile ${profileId}.`,
            `sets.${set.id}.${table}.${profileId}`,
          ),
        );
      }
    }
  }
  if (!assetKeys.has(set.artworkAssetKey)) {
    issues.push(
      issue(
        'asset_key_missing',
        `Set references missing artwork ${set.artworkAssetKey}.`,
        `sets.${set.id}.artworkAssetKey`,
      ),
    );
  }
  validateTimestamp(set.createdAt, world, `sets.${set.id}.createdAt`, issues);
  validateTimestamp(set.openedAt, world, `sets.${set.id}.openedAt`, issues);
}

function validateConversation(
  conversation: SimulatedConversation,
  profileIds: ReadonlySet<string>,
  setIds: ReadonlySet<string>,
  messageIds: ReadonlySet<string>,
  world: SimulationWorldSnapshot,
  issues: SimulationIntegrityIssue[],
) {
  for (const [index, memberId] of conversation.memberIds.entries()) {
    if (!profileIds.has(memberId)) {
      issues.push(
        issue(
          'conversation_member_missing',
          `Conversation member ${memberId} does not exist.`,
          `conversations.${conversation.id}.memberIds.${index}`,
        ),
      );
    }
    if (!conversation.memberState[memberId]) {
      issues.push(
        issue(
          'conversation_member_state_missing',
          `Conversation member ${memberId} has no member state.`,
          `conversations.${conversation.id}.memberState.${memberId}`,
        ),
      );
    }
  }
  for (const typingId of conversation.typingProfileIds) {
    if (!conversation.memberIds.includes(typingId)) {
      issues.push(
        issue(
          'conversation_typing_member_missing',
          `Typing profile ${typingId} is not a conversation member.`,
          `conversations.${conversation.id}.typingProfileIds`,
        ),
      );
    }
  }
  if (conversation.setId && !setIds.has(conversation.setId)) {
    issues.push(
      issue(
        'conversation_set_missing',
        `Conversation references missing set ${conversation.setId}.`,
        `conversations.${conversation.id}.setId`,
      ),
    );
  }
  let previousTimestamp = '';
  for (const [index, id] of conversation.messageIds.entries()) {
    if (!messageIds.has(id)) {
      issues.push(
        issue(
          'conversation_message_missing',
          `Conversation references missing message ${id}.`,
          `conversations.${conversation.id}.messageIds.${index}`,
        ),
      );
      continue;
    }
    const message = world.messages[id];
    if (!message) continue;
    if (message.conversationId !== conversation.id) {
      issues.push(
        issue(
          'conversation_message_mismatch',
          `Message ${id} belongs to ${message.conversationId}, not ${conversation.id}.`,
          `conversations.${conversation.id}.messageIds.${index}`,
        ),
      );
    }
    if (previousTimestamp && message.createdAt < previousTimestamp) {
      issues.push(
        issue(
          'conversation_message_mismatch',
          'Conversation messageIds must follow chronological order.',
          `conversations.${conversation.id}.messageIds.${index}`,
        ),
      );
    }
    previousTimestamp = message.createdAt;
  }
  for (const [memberId, state] of Object.entries(conversation.memberState)) {
    if (!conversation.memberIds.includes(memberId as ProfileId)) {
      issues.push(
        issue(
          'conversation_member_state_missing',
          `Member state belongs to non-member ${memberId}.`,
          `conversations.${conversation.id}.memberState.${memberId}`,
        ),
      );
    }
    if (
      state.lastReadMessageId &&
      !conversation.messageIds.includes(state.lastReadMessageId)
    ) {
      issues.push(
        issue(
          'conversation_message_missing',
          `Read watermark ${state.lastReadMessageId} is not in the conversation.`,
          `conversations.${conversation.id}.memberState.${memberId}.lastReadMessageId`,
        ),
      );
    }
  }
  validateTimestamp(
    conversation.createdAt,
    world,
    `conversations.${conversation.id}.createdAt`,
    issues,
  );
}

function validateMessage(
  message: SimulatedMessage,
  world: SimulationWorldSnapshot,
  assetKeys: ReadonlySet<string>,
  issues: SimulationIntegrityIssue[],
) {
  const conversation = world.conversations[message.conversationId];
  if (!conversation) {
    issues.push(
      issue(
        'message_conversation_missing',
        `Message references missing conversation ${message.conversationId}.`,
        `messages.${message.id}.conversationId`,
      ),
    );
  }
  if (message.senderId) {
    if (!world.profiles[message.senderId]) {
      issues.push(
        issue(
          'message_sender_missing',
          `Message sender ${message.senderId} does not exist.`,
          `messages.${message.id}.senderId`,
        ),
      );
    } else if (
      conversation &&
      !conversation.memberIds.includes(message.senderId)
    ) {
      issues.push(
        issue(
          'message_sender_not_member',
          `Message sender ${message.senderId} is not a conversation member.`,
          `messages.${message.id}.senderId`,
        ),
      );
    }
  }
  if (message.kind === 'media') {
    validateAssetRef(
      message.assetKey,
      `messages.${message.id}.assetKey`,
      assetKeys,
      issues,
    );
  }
  if (message.kind === 'build_share') {
    validateAssetRef(
      message.previewAssetKey,
      `messages.${message.id}.previewAssetKey`,
      assetKeys,
      issues,
    );
    validateAssetRef(
      message.roleIconAssetKey,
      `messages.${message.id}.roleIconAssetKey`,
      assetKeys,
      issues,
    );
  }
  if (message.kind === 'team_invite' && !world.sets[message.setId]) {
    issues.push(
      issue(
        'message_set_missing',
        `Team invite references missing set ${message.setId}.`,
        `messages.${message.id}.setId`,
      ),
    );
  }
  validateTimestamp(
    message.createdAt,
    world,
    `messages.${message.id}.createdAt`,
    issues,
  );
}

function validateNotification(
  notification: SimulatedNotification,
  world: SimulationWorldSnapshot,
  issues: SimulationIntegrityIssue[],
) {
  validateProfileRef(
    notification.recipientId,
    `notifications.${notification.id}.recipientId`,
    world,
    issues,
  );
  switch (notification.kind) {
    case 'set-invite':
      validateProfileRef(
        notification.payload.actorId,
        notificationPath(notification, 'payload.actorId'),
        world,
        issues,
      );
      validateSetRef(
        notification.payload.setId,
        notificationPath(notification, 'payload.setId'),
        world,
        issues,
      );
      break;
    case 'direct-message':
      validateProfileRef(
        notification.payload.actorId,
        notificationPath(notification, 'payload.actorId'),
        world,
        issues,
      );
      validateConversationRef(
        notification.payload.conversationId,
        notificationPath(notification, 'payload.conversationId'),
        world,
        issues,
      );
      validateMessageRef(
        notification.payload.messageId,
        notificationPath(notification, 'payload.messageId'),
        world,
        issues,
      );
      break;
    case 'praise-received':
      notification.payload.actorIds.forEach((profileId, index) =>
        validateProfileRef(
          profileId,
          notificationPath(notification, `payload.actorIds.${index}`),
          world,
          issues,
        ),
      );
      break;
    case 'team-event':
      validateSetRef(
        notification.payload.setId,
        notificationPath(notification, 'payload.setId'),
        world,
        issues,
      );
      break;
    case 'profile-liked':
      validateProfileRef(
        notification.payload.actorId,
        notificationPath(notification, 'payload.actorId'),
        world,
        issues,
      );
      break;
    case 'weekly-reward':
    case 'reputation-changed':
      break;
  }
  validateDeepLink(notification.target, notification, world, issues);
  validateTimestamp(
    notification.occurredAt,
    world,
    `notifications.${notification.id}.occurredAt`,
    issues,
  );
  if (notification.seenAt) {
    validateTimestamp(
      notification.seenAt,
      world,
      `notifications.${notification.id}.seenAt`,
      issues,
    );
  }
  if (notification.readAt) {
    validateTimestamp(
      notification.readAt,
      world,
      `notifications.${notification.id}.readAt`,
      issues,
    );
  }
}

function validateDeepLink(
  target: SimulationDeepLinkTarget,
  notification: SimulatedNotification,
  world: SimulationWorldSnapshot,
  issues: SimulationIntegrityIssue[],
) {
  if (target.kind === 'profile') {
    validateProfileRef(
      target.profileId,
      notificationPath(notification, 'target.profileId'),
      world,
      issues,
    );
  } else if (target.kind === 'conversation') {
    validateConversationRef(
      target.conversationId,
      notificationPath(notification, 'target.conversationId'),
      world,
      issues,
    );
  } else if (target.kind === 'set') {
    validateSetRef(
      target.setId,
      notificationPath(notification, 'target.setId'),
      world,
      issues,
    );
  }
}

function validateAssetOwner(
  asset: SimulatedAssetManifestEntry,
  world: SimulationWorldSnapshot,
  issues: SimulationIntegrityIssue[],
) {
  const missing =
    (asset.owner.kind === 'profile' && !world.profiles[asset.owner.id]) ||
    (asset.owner.kind === 'set' && !world.sets[asset.owner.id]) ||
    (asset.owner.kind === 'message' && !world.messages[asset.owner.id]);
  if (missing) {
    issues.push(
      issue(
        'asset_owner_missing',
        `Asset owner ${asset.owner.id} does not exist.`,
        `assets.${asset.key}.owner.id`,
      ),
    );
  }
}

function validateProfileRef(
  id: ProfileId,
  path: string,
  world: SimulationWorldSnapshot,
  issues: SimulationIntegrityIssue[],
) {
  if (!world.profiles[id]) {
    issues.push(
      issue('notification_profile_missing', `Missing profile ${id}.`, path),
    );
  }
}

function validateSetRef(
  id: SetId,
  path: string,
  world: SimulationWorldSnapshot,
  issues: SimulationIntegrityIssue[],
) {
  if (!world.sets[id]) {
    issues.push(issue('notification_set_missing', `Missing set ${id}.`, path));
  }
}

function validateConversationRef(
  id: ConversationId,
  path: string,
  world: SimulationWorldSnapshot,
  issues: SimulationIntegrityIssue[],
) {
  if (!world.conversations[id]) {
    issues.push(
      issue(
        'notification_conversation_missing',
        `Missing conversation ${id}.`,
        path,
      ),
    );
  }
}

function validateMessageRef(
  id: MessageId,
  path: string,
  world: SimulationWorldSnapshot,
  issues: SimulationIntegrityIssue[],
) {
  if (!world.messages[id]) {
    issues.push(
      issue('notification_message_missing', `Missing message ${id}.`, path),
    );
  }
}

function validateAssetRef(
  key: AssetKey,
  path: string,
  assetKeys: ReadonlySet<string>,
  issues: SimulationIntegrityIssue[],
) {
  if (!assetKeys.has(key)) {
    issues.push(issue('asset_key_missing', `Missing asset ${key}.`, path));
  }
}

function validateTimestamp(
  value: string,
  world: SimulationWorldSnapshot,
  path: string,
  issues: SimulationIntegrityIssue[],
) {
  if (Date.parse(value) > Date.parse(world.generatedAt)) {
    issues.push(
      issue(
        'timestamp_after_world_clock',
        `${value} occurs after world clock ${world.generatedAt}.`,
        path,
      ),
    );
  }
}

function sameMembers(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function sameNumberSet(left: ReadonlySet<number>, right: ReadonlySet<number>) {
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}

function notificationPath(
  notification: Pick<SimulatedNotification, 'id'>,
  suffix: string,
) {
  return `notifications.${notification.id}.${suffix}`;
}

function issue(
  code: SimulationIntegrityIssueCode,
  message: string,
  path: string,
): SimulationIntegrityIssue {
  return { code, message, path };
}
