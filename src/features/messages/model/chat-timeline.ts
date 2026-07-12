import type { ChatMessage } from './chat-message';

export const CHAT_MESSAGE_CLUSTER_GAP_MS = 5 * 60 * 1000;
export const CHAT_SESSION_GAP_MS = 60 * 60 * 1000;

function parseTimestamp(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function startOfLocalDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function weekdayLabel(date: Date) {
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][date.getDay()] ?? '';
}

export function formatChatClock(createdAt: string) {
  const date = parseTimestamp(createdAt);
  if (!date) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatChatTimelineLabel(
  createdAt: string,
  referenceDate = new Date(),
) {
  const date = parseTimestamp(createdAt);
  if (!date) return '';

  const clock = formatChatClock(createdAt);
  const dayDistance = Math.round(
    (startOfLocalDay(referenceDate) - startOfLocalDay(date)) /
      (24 * 60 * 60 * 1000),
  );

  if (dayDistance === 0) return `Hôm nay, ${clock}`;
  if (dayDistance === 1) return `Hôm qua, ${clock}`;
  if (date.getFullYear() === referenceDate.getFullYear()) {
    return `${weekdayLabel(date)}, ${date.getDate()} thg ${date.getMonth() + 1}, ${clock}`;
  }
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}, ${clock}`;
}

export function formatInboxTimestamp(
  createdAt: string,
  referenceDate = new Date(),
) {
  const date = parseTimestamp(createdAt);
  if (!date) return '';

  const dayDistance = Math.round(
    (startOfLocalDay(referenceDate) - startOfLocalDay(date)) /
      (24 * 60 * 60 * 1000),
  );
  if (dayDistance === 0) return formatChatClock(createdAt);
  if (dayDistance === 1) return 'Hôm qua';
  if (dayDistance > 1 && dayDistance < 7) return weekdayLabel(date);
  if (date.getFullYear() === referenceDate.getFullYear()) {
    return `${date.getDate()}/${date.getMonth() + 1}`;
  }
  return `${date.getDate()}/${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`;
}

export function getChatMessageCreatedAt(message: ChatMessage | undefined) {
  if (!message || message.kind === 'typing') return undefined;
  return message.createdAt;
}

function timestampGapMs(
  left: ChatMessage | undefined,
  right: ChatMessage | undefined,
) {
  const leftDate = parseTimestamp(getChatMessageCreatedAt(left));
  const rightDate = parseTimestamp(getChatMessageCreatedAt(right));
  if (!leftDate || !rightDate) return undefined;
  return Math.abs(rightDate.getTime() - leftDate.getTime());
}

export function areMessagesInSameCluster(
  previous: ChatMessage | undefined,
  current: ChatMessage | undefined,
) {
  if (!previous || !current) return false;
  if (getChatMessageActorKey(previous) !== getChatMessageActorKey(current))
    return false;
  if (previous.kind === 'typing' || current.kind === 'typing') return false;
  const gap = timestampGapMs(previous, current);
  return gap !== undefined && gap <= CHAT_MESSAGE_CLUSTER_GAP_MS;
}

function getChatMessageActorKey(message: ChatMessage | undefined) {
  if (!message) return undefined;
  if (message.direction === 'outgoing') return 'self';
  if (message.kind === 'typing') return undefined;
  return message.senderId ?? 'thread-peer';
}

export function shouldInsertLightChatTimeGap(
  previous: ChatMessage | undefined,
  current: ChatMessage | undefined,
) {
  if (!previous || !current) return false;
  if (getChatMessageActorKey(previous) !== getChatMessageActorKey(current))
    return false;
  if (previous.kind === 'typing' || current.kind === 'typing') return false;
  const previousDate = parseTimestamp(getChatMessageCreatedAt(previous));
  const currentDate = parseTimestamp(getChatMessageCreatedAt(current));
  if (!previousDate || !currentDate) return false;
  if (!isSameCalendarDay(previousDate, currentDate)) return false;
  return currentDate.getTime() - previousDate.getTime() >= CHAT_SESSION_GAP_MS;
}

export function shouldStartChatSession(
  previous: ChatMessage | undefined,
  current: ChatMessage | undefined,
) {
  const currentDate = parseTimestamp(getChatMessageCreatedAt(current));
  if (!currentDate) return false;
  const previousDate = parseTimestamp(getChatMessageCreatedAt(previous));
  if (!previousDate) return true;
  if (!isSameCalendarDay(previousDate, currentDate)) return true;
  if (getChatMessageActorKey(previous) === getChatMessageActorKey(current))
    return false;
  return currentDate.getTime() - previousDate.getTime() >= CHAT_SESSION_GAP_MS;
}

export function findPreviousTimestampedMessage(
  messages: readonly ChatMessage[],
  index: number,
) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (getChatMessageCreatedAt(message)) return message;
  }
  return undefined;
}

export type ChatTimelineItem =
  | {
      createdAt: string;
      id: string;
      kind: 'separator';
    }
  | {
      createdAt: string;
      id: string;
      kind: 'time-gap';
    }
  | {
      id: string;
      kind: 'unread-marker';
    }
  | {
      id: string;
      kind: 'message';
      message: ChatMessage;
      messageIndex: number;
    };

export function buildChatTimelineItems(
  messages: readonly ChatMessage[],
  firstUnreadMessageId?: string,
): ChatTimelineItem[] {
  const items: ChatTimelineItem[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) continue;
    const previousTimestamped = findPreviousTimestampedMessage(messages, index);
    const createdAt = getChatMessageCreatedAt(message);

    if (createdAt && shouldStartChatSession(previousTimestamped, message)) {
      items.push({
        createdAt,
        id: `separator:${message.id}`,
        kind: 'separator',
      });
    } else if (
      createdAt &&
      shouldInsertLightChatTimeGap(previousTimestamped, message)
    ) {
      items.push({
        createdAt,
        id: `time-gap:${message.id}`,
        kind: 'time-gap',
      });
    }

    if (message.id === firstUnreadMessageId) {
      items.push({ id: `unread:${message.id}`, kind: 'unread-marker' });
    }

    items.push({
      id: `message:${message.id}`,
      kind: 'message',
      message,
      messageIndex: index,
    });
  }

  return items;
}
