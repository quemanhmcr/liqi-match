import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { MatchIntentFiltersV1 } from '@/shared/contracts/core-v1';
import { useAuth } from '@/shared/auth/auth-context';

import { resolveActiveMatchIntentActor } from './match-intent-actor';
import { MatchIntentCommandJournal } from './match-intent-command-journal';
import {
  activateMatchIntent,
  pauseMatchIntent,
} from './match-intent-command-service';
import { useMatchIntentRepository } from './MatchIntentRepositoryProvider';

export const matchIntentQueryKey = ['match-intent', 'current'] as const;
export const matchIntentQueryKeys = {
  all: ['match-intent'] as const,
  current: (playerId: string) =>
    [...matchIntentQueryKey, 'player', playerId] as const,
};
const commandJournal = new MatchIntentCommandJournal();

export function useCurrentMatchIntentQuery() {
  const { session } = useAuth();
  const repository = useMatchIntentRepository();
  const playerId = session?.principal?.playerId ?? 'anonymous';
  const lifecycleActive = session?.lifecycle?.state === 'active';

  return useQuery({
    enabled: Boolean(session?.principal?.playerId && lifecycleActive),
    queryFn: async () => {
      if (!session) throw new Error('Authentication is required.');
      resolveActiveMatchIntentActor(session);
      return await repository.getCurrent(session);
    },
    queryKey: matchIntentQueryKeys.current(playerId),
    staleTime: 15_000,
  });
}

export function useActivateMatchIntentMutation() {
  const { session } = useAuth();
  const repository = useMatchIntentRepository();
  const queryClient = useQueryClient();
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  return useMutation({
    mutationFn: async ({
      expectedVersion,
      filters,
    }: {
      expectedVersion?: number;
      filters: MatchIntentFiltersV1;
    }) => {
      const currentSession = sessionRef.current;
      if (!currentSession) throw new Error('Authentication is required.');
      return await activateMatchIntent({
        expectedVersion,
        filters,
        journal: commandJournal,
        repository,
        session: currentSession,
      });
    },
    onSuccess: async (receipt) => {
      queryClient.setQueryData(
        matchIntentQueryKeys.current(receipt.playerId),
        receipt,
      );
      await queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });
}

export function usePauseMatchIntentMutation() {
  const { session } = useAuth();
  const repository = useMatchIntentRepository();
  const queryClient = useQueryClient();
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  return useMutation({
    mutationFn: async ({ expectedVersion }: { expectedVersion: number }) => {
      const currentSession = sessionRef.current;
      if (!currentSession) throw new Error('Authentication is required.');
      return await pauseMatchIntent({
        expectedVersion,
        journal: commandJournal,
        repository,
        session: currentSession,
      });
    },
    onSuccess: (receipt) => {
      queryClient.setQueryData(
        matchIntentQueryKeys.current(receipt.playerId),
        receipt,
      );
    },
  });
}
