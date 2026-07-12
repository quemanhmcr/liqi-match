import type { MessageInboxFilter } from '../contracts/messages-contracts';
import type { ChatRepository } from '../services/chat-repository';

const repositoryIdentities = new WeakMap<ChatRepository, number>();
let nextRepositoryIdentity = 1;

function getRepositoryIdentity(repository: ChatRepository) {
  const existing = repositoryIdentities.get(repository);
  if (existing) return existing;
  const identity = nextRepositoryIdentity;
  nextRepositoryIdentity += 1;
  repositoryIdentities.set(repository, identity);
  return identity;
}

export const messagesQueryKeys = {
  all: ['messages'] as const,
  inbox: ({
    filter,
    query,
    repository,
    viewerId,
  }: {
    filter: MessageInboxFilter;
    query: string;
    repository: ChatRepository;
    viewerId: string;
  }) =>
    [
      ...messagesQueryKeys.all,
      'inbox',
      viewerId,
      getRepositoryIdentity(repository),
      filter,
      query,
    ] as const,
};
