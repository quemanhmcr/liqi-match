import type { ChatMessage, OutgoingChatMessage } from './chat-message';
import { areMessagesInSameCluster } from './chat-timeline';

export function mergeThreadMessages(
  threadMessages: readonly ChatMessage[],
  localMessages: readonly OutgoingChatMessage[],
) {
  if (localMessages.length === 0) return threadMessages;

  const knownIdentities = new Set<string>();
  for (const message of threadMessages) {
    knownIdentities.add(message.id);
    if (message.kind !== 'typing' && message.clientMessageId) {
      knownIdentities.add(message.clientMessageId);
    }
    if (message.direction === 'outgoing' && message.canonicalId) {
      knownIdentities.add(message.canonicalId);
    }
  }
  const uniqueLocalMessages = localMessages.filter((message) => {
    const identities = [
      message.id,
      message.clientMessageId,
      message.canonicalId,
    ].filter((value): value is string => Boolean(value));
    if (identities.some((identity) => knownIdentities.has(identity)))
      return false;
    for (const identity of identities) knownIdentities.add(identity);
    return true;
  });

  const trailingMessage = threadMessages[threadMessages.length - 1];
  if (trailingMessage?.kind !== 'typing') {
    return [...threadMessages, ...uniqueLocalMessages];
  }

  return [
    ...threadMessages.slice(0, -1),
    ...uniqueLocalMessages,
    trailingMessage,
  ];
}

export function latestTimestampedMessage(messages: readonly ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.kind !== 'typing') return message;
  }
  return undefined;
}

export function authoritativeSequence(message: ChatMessage) {
  return message.kind === 'typing' ? 0 : (message.sequence ?? 0);
}

export function latestAuthoritativeSequence(messages: readonly ChatMessage[]) {
  return messages.reduce(
    (latest, message) => Math.max(latest, authoritativeSequence(message)),
    0,
  );
}

export function mergeAuthoritativeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
) {
  const byIdentity = new Map<string, ChatMessage>();
  for (const message of [...current, ...incoming]) {
    const identity =
      message.kind === 'typing'
        ? message.id
        : (message.clientMessageId ?? message.id);
    const previous = byIdentity.get(identity);
    if (
      !previous ||
      authoritativeSequence(message) >= authoritativeSequence(previous)
    ) {
      byIdentity.set(identity, message);
    }
  }
  return [...byIdentity.values()].sort((left, right) => {
    const sequenceDelta =
      authoritativeSequence(left) - authoritativeSequence(right);
    if (sequenceDelta !== 0) return sequenceDelta;
    return (left.kind === 'typing' ? '' : left.createdAt).localeCompare(
      right.kind === 'typing' ? '' : right.createdAt,
    );
  });
}

export function isGroupedWithPrevious(
  messages: readonly ChatMessage[],
  index: number,
) {
  return areMessagesInSameCluster(messages[index - 1], messages[index]);
}

export function shouldShowIncomingAvatar(
  messages: readonly ChatMessage[],
  index: number,
) {
  const message = messages[index];
  if (message?.direction !== 'incoming') return false;

  return !areMessagesInSameCluster(message, messages[index + 1]);
}
