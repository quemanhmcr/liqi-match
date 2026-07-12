import { useQuery } from '@tanstack/react-query';

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

  return useQuery({
    queryFn: ({ signal }) =>
      repository.listConversations(
        {
          filter,
          limit: 30,
          query: canonicalQuery,
        },
        { ...previewMessagesRequestContext, signal },
      ),
    queryKey: messagesQueryKeys.inbox({
      filter,
      query: canonicalQuery,
      repository,
      viewerId: previewMessagesRequestContext.viewerId,
    }),
    staleTime: 15_000,
  });
}
