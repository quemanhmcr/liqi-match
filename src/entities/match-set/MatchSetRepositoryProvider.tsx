import { createContext, useContext, type PropsWithChildren } from 'react';

import type { MatchSetRepository } from './match-set-repository';

const Context = createContext<MatchSetRepository | null>(null);

export function MatchSetRepositoryProvider({
  children,
  repository,
}: PropsWithChildren<{ repository: MatchSetRepository }>) {
  return <Context.Provider value={repository}>{children}</Context.Provider>;
}

export function useMatchSetRepository() {
  const repository = useContext(Context);
  if (!repository) throw new Error('MatchSetRepositoryProvider is missing.');
  return repository;
}
