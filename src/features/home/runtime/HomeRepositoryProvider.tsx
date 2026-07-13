import { createContext, useContext, type PropsWithChildren } from 'react';

import type { AuthSession } from '@/shared/auth/auth-service';

import type { HomeDashboard } from '../home-dashboard-service';

export interface HomeRepository {
  getDashboard(session: AuthSession): Promise<HomeDashboard>;
}

const HomeRepositoryContext = createContext<HomeRepository | null>(null);

export type HomeRepositoryProviderProps = PropsWithChildren<{
  repository: HomeRepository;
}>;

export function HomeRepositoryProvider({
  children,
  repository,
}: HomeRepositoryProviderProps) {
  return (
    <HomeRepositoryContext.Provider value={repository}>
      {children}
    </HomeRepositoryContext.Provider>
  );
}

export function useHomeRepository() {
  const repository = useContext(HomeRepositoryContext);
  if (!repository) {
    throw new Error(
      'HomeRepositoryProvider is missing from the application composition root.',
    );
  }
  return repository;
}
