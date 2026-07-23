import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/shared/auth/auth-context';

import type { MessageInboxFilter } from '../contracts/messages-contracts';
import {
  previewMessagesRequestContext,
  type ChatRepository,
} from '../services/chat-repository';
import { messagesQueryKeys } from './messages-query-keys';

export function useMessagesInboxQuery({
  filter,
  query,
  repository,
}: {
  filter: MessageInboxFilter;
  query: string;
  repository: ChatRepository;
}) {
  const canonicalQuery = query.trim();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? 'anonymous';

  const queryKey = messagesQueryKeys.inbox({
    filter,
    query: canonicalQuery,
    repository,
    viewerId,
  });

  return useQuery({
    enabled: Boolean(session),
    queryFn: ({ signal }) =>
      repository.listConversations(
        {
          filter,
          limit: 30,
          query: canonicalQuery,
        },
        { ...previewMessagesRequestContext, signal, viewerId },
      ),
    placeholderData: (previousData, previousQuery) =>
      previousQuery &&
      isSameMessageInboxQueryScope(previousQuery.queryKey, queryKey)
        ? previousData
        : undefined,
    queryKey,
    staleTime: 15_000,
  });
}

export function isSameMessageInboxQueryScope(
  previous: readonly unknown[],
  current: readonly unknown[],
) {
  if (previous.length !== current.length) return false;
  return current
    .slice(0, -1)
    .every((segment, index) => previous[index] === segment);
}
