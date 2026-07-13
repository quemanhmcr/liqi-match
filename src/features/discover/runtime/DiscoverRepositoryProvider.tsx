import { createContext, useContext, type PropsWithChildren } from 'react';

import type { DiscoverRepository } from '../services/discover-repository';

const DiscoverRepositoryContext = createContext<DiscoverRepository | null>(
  null,
);

export type DiscoverRepositoryProviderProps = PropsWithChildren<{
  repository: DiscoverRepository;
}>;

export function DiscoverRepositoryProvider({
  children,
  repository,
}: DiscoverRepositoryProviderProps) {
  return (
    <DiscoverRepositoryContext.Provider value={repository}>
      {children}
    </DiscoverRepositoryContext.Provider>
  );
}

export function useDiscoverRepository() {
  const repository = useContext(DiscoverRepositoryContext);
  if (!repository) {
    throw new Error(
      'DiscoverRepositoryProvider is missing from the application composition root.',
    );
  }
  return repository;
}
