import { useEffect, useRef } from 'react';
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
    queryKey: playSessionQueryKeys.current(
      session?.lifecycle?.playerId ?? 'anonymous',
    ),
  });
}

export function usePlaySessionInvites() {
  const { session } = useAuth();
  const { repository } = usePlaySessionServices();
  return useQuery({
    enabled: Boolean(session?.principal?.playerId && session.lifecycle),
    queryFn: async () =>
      repository.listInvites(resolvePlaySessionActor(session)),
    queryKey: playSessionQueryKeys.invites(
      session?.lifecycle?.playerId ?? 'anonymous',
    ),
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
    queryKey: playSessionQueryKeys.detail(
      session?.lifecycle?.playerId ?? 'anonymous',
      sessionId ?? 'missing',
    ),
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
  const sessionRef = useRef(session);
  const mutationPlayerIdRef = useRef<string | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  return useMutation({
    ...options,
    mutationFn: async (command) => {
      const actor = resolvePlaySessionActor(sessionRef.current);
      mutationPlayerIdRef.current = actor.lifecycle.playerId;
      return execute(actor, command);
    },
    onError: async (error, command, onMutateResult, mutationContext) => {
      const commandSessionId =
        command &&
        typeof command === 'object' &&
        'sessionId' in command &&
        typeof command.sessionId === 'string'
          ? command.sessionId
          : null;
      const playerId = mutationPlayerIdRef.current;
      await Promise.all([
        ...(playerId
          ? [
              queryClient.invalidateQueries({
                queryKey: playSessionQueryKeys.current(playerId),
              }),
              queryClient.invalidateQueries({
                queryKey: playSessionQueryKeys.invites(playerId),
              }),
            ]
          : []),
        ...(commandSessionId && playerId
          ? [
              queryClient.invalidateQueries({
                queryKey: playSessionQueryKeys.detail(
                  playerId,
                  commandSessionId,
                ),
              }),
            ]
          : []),
      ]);
      await options.onError?.(error, command, onMutateResult, mutationContext);
    },
    onSuccess: async (receipt, command, onMutateResult, mutationContext) => {
      const playerId = mutationPlayerIdRef.current;
      if (playerId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: playSessionQueryKeys.current(playerId),
          }),
          queryClient.invalidateQueries({
            queryKey: playSessionQueryKeys.invites(playerId),
          }),
          queryClient.invalidateQueries({
            queryKey: playSessionQueryKeys.detail(
              playerId,
              receipt.aggregateId,
            ),
          }),
        ]);
      }
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
