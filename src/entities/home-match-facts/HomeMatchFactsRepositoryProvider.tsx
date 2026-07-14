import { createContext, useContext, type PropsWithChildren } from 'react';

import type { HomeMatchFactsRepository } from './home-match-facts-repository';

const Context = createContext<HomeMatchFactsRepository | null>(null);

export function HomeMatchFactsRepositoryProvider({
  children,
  repository,
}: PropsWithChildren<{ repository: HomeMatchFactsRepository }>) {
  return <Context.Provider value={repository}>{children}</Context.Provider>;
}

export function useHomeMatchFactsRepository() {
  const repository = useContext(Context);
  if (!repository) {
    throw new Error('HomeMatchFactsRepositoryProvider is missing.');
  }
  return repository;
}
