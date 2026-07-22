import type {
  CanonicalMessageInboxParams,
  MessageConversationSummary,
} from '../contracts/messages-contracts';

/**
 * Canonical inbox filter semantics shared by every repository implementation.
 * Relationship labels remain row metadata; top-level inbox filters describe
 * conversation shape so direct matches, friends and soulmates cannot drift
 * into different UI-only buckets.
 */
export function matchesMessageInboxFilter(
  conversation: MessageConversationSummary,
  filter: CanonicalMessageInboxParams['filter'],
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'unread':
      return conversation.viewerState.unreadCount > 0;
    case 'direct':
      return conversation.kind === 'direct';
    case 'group':
      return conversation.kind === 'group';
  }

  const unsupportedFilter: never = filter;
  throw new Error(
    `Unsupported message inbox filter: ${String(unsupportedFilter)}`,
  );
}
