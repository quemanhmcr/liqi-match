import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AuthSession } from '@/shared/auth/auth-service';
import type {
  ConfirmSessionParticipationCommandV2,
  DisputeSessionParticipationCommandV2,
  DismissActivityItemCommandV2,
  RequestRepeatSessionCommandV2,
  SubmitPlayerEndorsementCommandV2,
  UpdateEngagementPreferencesCommandV2,
} from '@/shared/contracts/core-v2';

import { useTrustOutcomesServices } from './TrustOutcomesServicesProvider';

export const trustOutcomeQueryKeys = {
  activity: (accountId: string) =>
    ['core-v2-trust', 'activity', accountId] as const,
  all: ['core-v2-trust'] as const,
  feedback: (accountId: string, sessionId: string) =>
    ['core-v2-trust', 'feedback', accountId, sessionId] as const,
  outcome: (accountId: string, sessionId: string) =>
    ['core-v2-trust', 'outcome', accountId, sessionId] as const,
  preferences: (accountId: string) =>
    ['core-v2-trust', 'preferences', accountId] as const,
  reputationLedger: (viewerAccountId: string, playerId: string) =>
    ['core-v2-trust', 'reputation-ledger', viewerAccountId, playerId] as const,
  projection: (viewerAccountId: string, playerId: string) =>
    ['core-v2-trust', 'projection', viewerAccountId, playerId] as const,
  recommendations: (accountId: string) =>
    ['core-v2-trust', 'recommendations', accountId] as const,
};

export function useSessionFeedbackSurface(
  session: AuthSession | null,
  sessionId: string | undefined,
) {
  const { sessionOutcomeRepository } = useTrustOutcomesServices();
  return useQuery({
    enabled: Boolean(session && sessionId),
    queryFn: () => {
      if (!session || !sessionId) {
        throw new Error(
          'Session feedback requires a session and PlaySessionId.',
        );
      }
      return sessionOutcomeRepository.getFeedbackSurface(session, sessionId);
    },
    queryKey: trustOutcomeQueryKeys.feedback(
      session?.user.id ?? 'anonymous',
      sessionId ?? 'missing',
    ),
    staleTime: 5_000,
  });
}

export function useConfirmSessionParticipation(session: AuthSession | null) {
  const { sessionOutcomeRepository } = useTrustOutcomesServices();
  return useTrustFeedbackMutation(session, (command) =>
    sessionOutcomeRepository.confirmParticipation(
      requireSession(session),
      command as ConfirmSessionParticipationCommandV2,
    ),
  );
}

export function useDisputeSessionParticipation(session: AuthSession | null) {
  const { sessionOutcomeRepository } = useTrustOutcomesServices();
  return useTrustFeedbackMutation(session, (command) =>
    sessionOutcomeRepository.disputeParticipation(
      requireSession(session),
      command as DisputeSessionParticipationCommandV2,
    ),
  );
}

export function useSubmitPlayerEndorsement(session: AuthSession | null) {
  const { endorsementCommandService } = useTrustOutcomesServices();
  return useTrustFeedbackMutation(session, (command) =>
    endorsementCommandService.submit(
      requireSession(session),
      command as SubmitPlayerEndorsementCommandV2,
    ),
  );
}

export function useReputationLedger(
  session: AuthSession | null,
  playerId: string | undefined,
) {
  const { reputationLedgerProvider } = useTrustOutcomesServices();
  return useQuery({
    enabled: Boolean(session && playerId),
    queryFn: () => {
      if (!session || !playerId) {
        throw new Error('Reputation ledger requires a session and PlayerId.');
      }
      return reputationLedgerProvider.listForPlayer(session, playerId);
    },
    queryKey: trustOutcomeQueryKeys.reputationLedger(
      session?.user.id ?? 'anonymous',
      playerId ?? 'missing',
    ),
    staleTime: 30_000,
  });
}

export function usePlayerTrustProjection(
  session: AuthSession | null,
  playerId: string | undefined,
) {
  const { playerTrustProjectionProvider } = useTrustOutcomesServices();
  return useQuery({
    enabled: Boolean(session && playerId),
    queryFn: () => {
      if (!session || !playerId) {
        throw new Error('Trust projection requires a session and PlayerId.');
      }
      return playerTrustProjectionProvider.getForPlayer(session, playerId);
    },
    queryKey: trustOutcomeQueryKeys.projection(
      session?.user.id ?? 'anonymous',
      playerId ?? 'missing',
    ),
    staleTime: 30_000,
  });
}

export function useTrustActivityFeed(session: AuthSession | null, limit = 20) {
  const { activityFeedRepository } = useTrustOutcomesServices();
  return useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Trust activity requires a session.');
      return activityFeedRepository.list(session, { limit });
    },
    queryKey: trustOutcomeQueryKeys.activity(session?.user.id ?? 'anonymous'),
    staleTime: 15_000,
  });
}

export function useRepeatPlayRecommendations(session: AuthSession | null) {
  const { repeatPlayRecommendationProvider } = useTrustOutcomesServices();
  return useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session)
        throw new Error('Repeat recommendations require a session.');
      return repeatPlayRecommendationProvider.listRecommendations(session);
    },
    queryKey: trustOutcomeQueryKeys.recommendations(
      session?.user.id ?? 'anonymous',
    ),
    staleTime: 15_000,
  });
}

export function useDismissTrustActivity(session: AuthSession | null) {
  const { activityFeedRepository } = useTrustOutcomesServices();
  const queryClient = useQueryClient();
  const accountId = session?.user.id ?? 'anonymous';
  return useMutation({
    mutationFn: (command: DismissActivityItemCommandV2) => {
      if (!session) throw new Error('Activity dismissal requires a session.');
      return activityFeedRepository.dismiss(session, command);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trustOutcomeQueryKeys.activity(accountId),
        }),
        queryClient.invalidateQueries({
          queryKey: trustOutcomeQueryKeys.recommendations(accountId),
        }),
      ]);
    },
  });
}

export function useRequestRepeatSession(session: AuthSession | null) {
  const { repeatPlayRecommendationProvider } = useTrustOutcomesServices();
  const queryClient = useQueryClient();
  const accountId = session?.user.id ?? 'anonymous';
  return useMutation({
    mutationFn: (command: RequestRepeatSessionCommandV2) => {
      if (!session) throw new Error('Repeat request requires a session.');
      return repeatPlayRecommendationProvider.requestRepeatSession(
        session,
        command,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: trustOutcomeQueryKeys.recommendations(accountId),
      });
    },
  });
}

export function useEngagementPreferences(session: AuthSession | null) {
  const { engagementPolicyProvider } = useTrustOutcomesServices();
  return useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session)
        throw new Error('Engagement preferences require a session.');
      return engagementPolicyProvider.getPreferences(session);
    },
    queryKey: trustOutcomeQueryKeys.preferences(
      session?.user.id ?? 'anonymous',
    ),
  });
}

export function useUpdateEngagementPreferences(session: AuthSession | null) {
  const { engagementPolicyProvider } = useTrustOutcomesServices();
  const queryClient = useQueryClient();
  const accountId = session?.user.id ?? 'anonymous';
  return useMutation({
    mutationFn: (command: UpdateEngagementPreferencesCommandV2) => {
      if (!session) throw new Error('Preference update requires a session.');
      return engagementPolicyProvider.updatePreferences(session, command);
    },
    onSuccess: (receipt) => {
      queryClient.setQueryData(
        trustOutcomeQueryKeys.preferences(accountId),
        receipt.preferences,
      );
    },
  });
}

function useTrustFeedbackMutation(
  session: AuthSession | null,
  mutationFn: (command: unknown) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  const accountId = session?.user.id ?? 'anonymous';
  return useMutation({
    mutationFn,
    onSuccess: async (_receipt, command) => {
      const sessionId =
        command && typeof command === 'object' && 'sessionId' in command
          ? String(command.sessionId)
          : null;
      await Promise.all([
        sessionId
          ? queryClient.invalidateQueries({
              queryKey: trustOutcomeQueryKeys.feedback(accountId, sessionId),
            })
          : Promise.resolve(),
        queryClient.invalidateQueries({
          queryKey: trustOutcomeQueryKeys.activity(accountId),
        }),
        queryClient.invalidateQueries({
          queryKey: ['core-v2-trust', 'projection'],
        }),
        queryClient.invalidateQueries({
          queryKey: trustOutcomeQueryKeys.recommendations(accountId),
        }),
      ]);
    },
  });
}

function requireSession(session: AuthSession | null) {
  if (!session) throw new Error('Core V2 trust mutation requires a session.');
  return session;
}
