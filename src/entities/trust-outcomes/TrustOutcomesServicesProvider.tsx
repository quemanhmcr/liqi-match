import { createContext, useContext, type PropsWithChildren } from 'react';

import type {
  ActivityFeedRepository,
  EndorsementCommandService,
  EngagementPolicyProvider,
  PlayerTrustProjectionProvider,
  ReputationLedgerProvider,
  RepeatPlayRecommendationProvider,
  SessionOutcomeRepository,
} from './trust-outcomes-repositories';

export type TrustOutcomesServices = Readonly<{
  activityFeedRepository: ActivityFeedRepository;
  endorsementCommandService: EndorsementCommandService;
  engagementPolicyProvider: EngagementPolicyProvider;
  playerTrustProjectionProvider: PlayerTrustProjectionProvider;
  reputationLedgerProvider: ReputationLedgerProvider;
  repeatPlayRecommendationProvider: RepeatPlayRecommendationProvider;
  sessionOutcomeRepository: SessionOutcomeRepository;
}>;

const Context = createContext<TrustOutcomesServices | null>(null);

export function TrustOutcomesServicesProvider({
  children,
  services,
}: PropsWithChildren<{ services: TrustOutcomesServices }>) {
  return <Context.Provider value={services}>{children}</Context.Provider>;
}

export function useTrustOutcomesServices() {
  const services = useContext(Context);
  if (!services) {
    throw new Error(
      'useTrustOutcomesServices must be used within TrustOutcomesServicesProvider.',
    );
  }
  return services;
}
