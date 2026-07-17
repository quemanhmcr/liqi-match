import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/shared/auth/auth-context';
import { PlayerIdSchema, type PlayerId } from '@/shared/contracts/core-v1';

import { usePlayerIdentityRepository } from './PlayerIdentityRepositoryProvider';

export const playerIdentityQueryKey = ['player-identities', 'visible'] as const;

export function usePlayerIdentities(playerIds: readonly string[]) {
  const { session } = useAuth();
  const repository = usePlayerIdentityRepository();
  const parsedIds = [...new Set(playerIds)]
    .map((id) => PlayerIdSchema.safeParse(id))
    .filter(
      (result): result is { success: true; data: PlayerId } => result.success,
    )
    .map((result) => result.data)
    .sort();

  return useQuery({
    enabled: Boolean(session && parsedIds.length > 0),
    queryFn: async () => {
      if (!session) return [];
      return repository.listVisible(session, parsedIds);
    },
    queryKey: [...playerIdentityQueryKey, parsedIds.join(':')],
    staleTime: 60_000,
  });
}
