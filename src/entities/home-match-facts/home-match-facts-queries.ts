import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/shared/auth/auth-context';

import { useHomeMatchFactsRepository } from './HomeMatchFactsRepositoryProvider';

export const homeMatchFactsQueryKey = ['home-match-facts', 'v1'] as const;

export function useHomeMatchFactsQuery() {
  const { session } = useAuth();
  const repository = useHomeMatchFactsRepository();
  return useQuery({
    enabled: Boolean(session),
    queryFn: async () => {
      if (!session) throw new Error('Authentication is required.');
      return await repository.list(session);
    },
    queryKey: homeMatchFactsQueryKey,
  });
}
