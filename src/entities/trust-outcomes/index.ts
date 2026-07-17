export { InMemoryTrustOutcomesEngine } from './in-memory-trust-outcomes-engine';
export type {
  ActivityFeedRepository,
  EndorsementCommandService,
  EngagementPolicyProvider,
  PlayerTrustProjectionProvider,
  ReputationLedgerProvider,
  RepeatPlayRecommendationProvider,
  SessionCompletedEventV2,
  SessionOutcomeRepository,
} from './trust-outcomes-repositories';
export { ActivityNotificationEligibilityPolicyV2 } from './activity-notification-eligibility-policy';
export type {
  ActivityNotificationEligibilityInputV2,
  ActivityNotificationEligibilityPolicyDependenciesV2,
} from './activity-notification-eligibility-policy';

export {
  SupabaseTrustOutcomesEngine,
  TrustOutcomesPrivilegedOperationError,
} from './supabase-trust-outcomes-engine';
export type {
  TrustOutcomesPrivilegedOperations,
  TrustOutcomesRpcTransport,
} from './supabase-trust-outcomes-engine';

export {
  TrustOutcomesServicesProvider,
  useTrustOutcomesServices,
} from './TrustOutcomesServicesProvider';
export type { TrustOutcomesServices } from './TrustOutcomesServicesProvider';

export { createTrustAwarePlaySessionCommandService } from './play-session-trust-outcome-bridge';

export {
  trustOutcomeQueryKeys,
  useConfirmSessionParticipation,
  useDismissTrustActivity,
  useDisputeSessionParticipation,
  useEngagementPreferences,
  usePlayerTrustProjection,
  useRepeatPlayRecommendations,
  useReputationLedger,
  useRequestRepeatSession,
  useSessionFeedbackSurface,
  useSubmitPlayerEndorsement,
  useTrustActivityFeed,
  useUpdateEngagementPreferences,
} from './trust-outcomes-hooks';

export {
  createTrustCreateMetadata,
  createTrustCreateMetadataForSource,
  createTrustMutationMetadata,
  createTrustMutationMetadataForSource,
} from './trust-command-metadata';
export type { TrustCommandMetadataDependencies } from './trust-command-metadata';
