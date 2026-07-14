import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { MatchIntentFiltersV1 } from '@/shared/contracts/core-v1';
import { useAuth } from '@/shared/auth/auth-context';

import { MatchIntentCommandJournal } from './match-intent-command-journal';
import {
  activateMatchIntent,
  pauseMatchIntent,
} from './match-intent-command-service';
import { useMatchIntentRepository } from './MatchIntentRepositoryProvider';

export const matchIntentQueryKey = ['match-intent', 'current'] as const;
const commandJournal = new MatchIntentCommandJournal();

export function useCurrentMatchIntentQuery() {
  const { session } = useAuth();
  const repository = useMatchIntentRepository();

  return useQuery({
    enabled: Boolean(session),
    queryFn: async () => {
      if (!session) throw new Error('Authentication is required.');
      return await repository.getCurrent(session);
    },
    queryKey: matchIntentQueryKey,
    staleTime: 15_000,
  });
}

export function useActivateMatchIntentMutation() {
  const { session } = useAuth();
  const repository = useMatchIntentRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      expectedVersion,
      filters,
    }: {
      expectedVersion?: number;
      filters: MatchIntentFiltersV1;
    }) => {
      if (!session) throw new Error('Authentication is required.');
      return await activateMatchIntent({
        expectedVersion,
        filters,
        journal: commandJournal,
        repository,
        session,
      });
    },
    onSuccess: async (receipt) => {
      queryClient.setQueryData(matchIntentQueryKey, receipt);
      await queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });
}

export function usePauseMatchIntentMutation() {
  const { session } = useAuth();
  const repository = useMatchIntentRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ expectedVersion }: { expectedVersion: number }) => {
      if (!session) throw new Error('Authentication is required.');
      return await pauseMatchIntent({
        expectedVersion,
        journal: commandJournal,
        repository,
        session,
      });
    },
    onSuccess: (receipt) => {
      queryClient.setQueryData(matchIntentQueryKey, receipt);
    },
  });
}
