import { createContext, useContext, type PropsWithChildren } from 'react';

import type { MatchIntentRepository } from './match-intent-repository';

const MatchIntentRepositoryContext =
  createContext<MatchIntentRepository | null>(null);

export type MatchIntentRepositoryProviderProps = PropsWithChildren<{
  repository: MatchIntentRepository;
}>;

export function MatchIntentRepositoryProvider({
  children,
  repository,
}: MatchIntentRepositoryProviderProps) {
  return (
    <MatchIntentRepositoryContext.Provider value={repository}>
      {children}
    </MatchIntentRepositoryContext.Provider>
  );
}

export function useMatchIntentRepository() {
  const repository = useContext(MatchIntentRepositoryContext);
  if (!repository) {
    throw new Error(
      'MatchIntentRepositoryProvider is missing from the application composition root.',
    );
  }
  return repository;
}
