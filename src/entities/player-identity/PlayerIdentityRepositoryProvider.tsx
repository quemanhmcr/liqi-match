import { createContext, type PropsWithChildren, useContext } from 'react';

import type { PlayerIdentityRepository } from './player-identity-repository';

const PlayerIdentityRepositoryContext =
  createContext<PlayerIdentityRepository | null>(null);

export function PlayerIdentityRepositoryProvider({
  children,
  repository,
}: PropsWithChildren<{ repository: PlayerIdentityRepository }>) {
  return (
    <PlayerIdentityRepositoryContext.Provider value={repository}>
      {children}
    </PlayerIdentityRepositoryContext.Provider>
  );
}

export function usePlayerIdentityRepository() {
  const repository = useContext(PlayerIdentityRepositoryContext);
  if (!repository) {
    throw new Error('PlayerIdentityRepositoryProvider is missing.');
  }
  return repository;
}
