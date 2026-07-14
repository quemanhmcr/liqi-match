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
    queryKey: messagesQueryKeys.inbox({
      filter,
      query: canonicalQuery,
      repository,
      viewerId,
    }),
    staleTime: 15_000,
  });
}
