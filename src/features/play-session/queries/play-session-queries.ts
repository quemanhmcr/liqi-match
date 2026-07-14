import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import {
  playSessionQueryKeys,
  prepareCoreV2CommandMetadata,
  resolvePlaySessionActor,
  usePlaySessionServices,
  type PlaySessionActorContext,
} from '@/entities/play-session';
import { useAuth } from '@/shared/auth/auth-context';
import type {
  PlaySessionCommandReceiptV2,
  PlaySessionId,
} from '@/shared/contracts/core-v2';

export function useCurrentPlaySessions() {
  const { session } = useAuth();
  const { repository } = usePlaySessionServices();
  return useQuery({
    enabled: Boolean(session?.principal?.playerId && session.lifecycle),
    queryFn: async () =>
      repository.listCurrent(resolvePlaySessionActor(session)),
    queryKey: playSessionQueryKeys.current(),
  });
}

export function usePlaySessionInvites() {
  const { session } = useAuth();
  const { repository } = usePlaySessionServices();
  return useQuery({
    enabled: Boolean(session?.principal?.playerId && session.lifecycle),
    queryFn: async () =>
      repository.listInvites(resolvePlaySessionActor(session)),
    queryKey: playSessionQueryKeys.invites(),
  });
}

export function usePlaySessionDetail(sessionId: PlaySessionId | null) {
  const { session } = useAuth();
  const { repository } = usePlaySessionServices();
  return useQuery({
    enabled: Boolean(
      sessionId && session?.principal?.playerId && session.lifecycle,
    ),
    queryFn: async () => {
      if (!sessionId) throw new Error('PlaySessionId is required.');
      return repository.get(resolvePlaySessionActor(session), sessionId);
    },
    queryKey: playSessionQueryKeys.detail(sessionId ?? 'missing'),
  });
}

export { prepareCoreV2CommandMetadata };

export function usePlaySessionCommandMutation<TCommand>(
  execute: (
    actor: PlaySessionActorContext,
    command: TCommand,
  ) => Promise<PlaySessionCommandReceiptV2>,
  options: Omit<
    UseMutationOptions<PlaySessionCommandReceiptV2, Error, TCommand>,
    'mutationFn'
  > = {},
) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: async (command) =>
      execute(resolvePlaySessionActor(session), command),
    onSuccess: async (receipt, command, onMutateResult, mutationContext) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: playSessionQueryKeys.current(),
        }),
        queryClient.invalidateQueries({
          queryKey: playSessionQueryKeys.invites(),
        }),
        queryClient.invalidateQueries({
          queryKey: playSessionQueryKeys.detail(receipt.aggregateId),
        }),
      ]);
      await options.onSuccess?.(
        receipt,
        command,
        onMutateResult,
        mutationContext,
      );
    },
    retry: false,
  });
}
