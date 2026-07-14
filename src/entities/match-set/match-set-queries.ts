import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import type { SetDiscoveryPageV1 } from '@/shared/contracts/core-v1';

import { useAuth } from '@/shared/auth/auth-context';

import { MatchSetCommandJournal } from './match-set-command-journal';
import { useMatchSetRepository } from './MatchSetRepositoryProvider';

export const matchSetQueryKey = ['match-set', 'discovery'] as const;
const journal = new MatchSetCommandJournal();

export function useMatchSetDiscoveryQuery(limit = 20) {
  const { session } = useAuth();
  const repository = useMatchSetRepository();
  const queryKey = [...matchSetQueryKey, limit] as const;
  return useInfiniteQuery<
    SetDiscoveryPageV1,
    Error,
    InfiniteData<SetDiscoveryPageV1>,
    typeof queryKey,
    string | null
  >({
    enabled: Boolean(session),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!session) throw new Error('Authentication is required.');
      return await repository.list(session, { cursor: pageParam, limit });
    },
    queryKey,
  });
}

export function useRequestSetJoinV1Mutation() {
  const { session } = useAuth();
  const repository = useMatchSetRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      expectedSetVersion: number;
      setId: string;
    }) => {
      if (!session) throw new Error('Authentication is required.');
      const command = await journal.requestJoin({
        accountId: session.user.id,
        ...input,
      });
      const receipt = await repository.requestJoin(session, command);
      await journal.complete({
        accountId: session.user.id,
        kind: 'join',
        setId: command.setId,
      });
      return receipt;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: matchSetQueryKey });
    },
  });
}

export function useCreateSetInviteV1Mutation() {
  const { session } = useAuth();
  const repository = useMatchSetRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      expectedSetVersion: number;
      setId: string;
      targetPlayerId: string;
    }) => {
      if (!session) throw new Error('Authentication is required.');
      const command = await journal.invite({
        accountId: session.user.id,
        ...input,
      });
      const receipt = await repository.invite(session, command);
      await journal.complete({
        accountId: session.user.id,
        kind: 'invite',
        setId: command.setId,
        targetPlayerId: command.targetPlayerId,
      });
      return receipt;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: matchSetQueryKey });
    },
  });
}
