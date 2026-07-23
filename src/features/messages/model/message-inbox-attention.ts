import type { ChatDeliveryStatus } from './chat-message';

export type MessageInboxAttentionState =
  'failed' | 'queued' | 'draft' | 'sending' | 'unread' | 'normal';

export type MessageInboxAttentionInput = Readonly<{
  hasDraft: boolean;
  latestDeliveryStatus?: ChatDeliveryStatus;
  latestDirection?: 'incoming' | 'outgoing';
  unreadCount?: number;
}>;

/**
 * Resolves the single primary inbox state shown by grouping and row chrome.
 * Failed and queued delivery recovery states outrank unfinished work; a draft
 * outranks transient sending; unread is used only when no stronger state exists.
 */
export function resolveMessageInboxAttentionState({
  hasDraft,
  latestDeliveryStatus,
  latestDirection,
  unreadCount,
}: MessageInboxAttentionInput): MessageInboxAttentionState {
  const outgoingStatus =
    latestDirection === 'outgoing' ? latestDeliveryStatus : undefined;

  if (outgoingStatus === 'failed') return 'failed';
  if (outgoingStatus === 'queued') return 'queued';
  if (hasDraft) return 'draft';
  if (outgoingStatus === 'sending') return 'sending';
  if ((unreadCount ?? 0) > 0) return 'unread';
  return 'normal';
}

export function isMessageInboxAttentionStateActionable(
  state: MessageInboxAttentionState,
): boolean {
  switch (state) {
    case 'failed':
    case 'queued':
    case 'draft':
    case 'unread':
      return true;
    case 'sending':
    case 'normal':
      return false;
  }

  const unsupportedState: never = state;
  throw new Error(
    `Unsupported message inbox attention state: ${String(unsupportedState)}`,
  );
}
