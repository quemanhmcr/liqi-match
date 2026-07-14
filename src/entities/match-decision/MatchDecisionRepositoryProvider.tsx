import { createContext, useContext, type PropsWithChildren } from 'react';

import type { MatchDecisionRepository } from './match-decision-repository';

const MatchDecisionRepositoryContext =
  createContext<MatchDecisionRepository | null>(null);

export function MatchDecisionRepositoryProvider({
  children,
  repository,
}: PropsWithChildren<{ repository: MatchDecisionRepository }>) {
  return (
    <MatchDecisionRepositoryContext.Provider value={repository}>
      {children}
    </MatchDecisionRepositoryContext.Provider>
  );
}

export function useMatchDecisionRepository() {
  const repository = useContext(MatchDecisionRepositoryContext);
  if (!repository) {
    throw new Error(
      'MatchDecisionRepositoryProvider is missing from application composition.',
    );
  }
  return repository;
}
