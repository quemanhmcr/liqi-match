import type { MessageInboxFilter } from '../contracts/messages-contracts';

export type MessageInboxComposePlacement = 'empty-state' | 'header-only';

/** Keeps text-heavy compose promotion for a genuinely empty inbox only. */
export function resolveMessageInboxComposePlacement({
  filter,
  inboxReady,
  query,
  resultCount,
}: Readonly<{
  filter: MessageInboxFilter;
  inboxReady: boolean;
  query: string;
  resultCount?: number;
}>): MessageInboxComposePlacement {
  if (!inboxReady) return 'header-only';
  if (filter !== 'all') return 'header-only';
  if (query.trim().length > 0) return 'header-only';
  return resultCount === 0 ? 'empty-state' : 'header-only';
}
