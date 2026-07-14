import { createContext, useContext, type PropsWithChildren } from 'react';

import type { SocialRelationshipRepository } from './social-relationship-repository';

const SocialRelationshipRepositoryContext =
  createContext<SocialRelationshipRepository | null>(null);

export type RelationshipCapabilitiesProviderProps = PropsWithChildren<{
  repository: SocialRelationshipRepository;
}>;

export function RelationshipCapabilitiesProvider({
  children,
  repository,
}: RelationshipCapabilitiesProviderProps) {
  return (
    <SocialRelationshipRepositoryContext.Provider value={repository}>
      {children}
    </SocialRelationshipRepositoryContext.Provider>
  );
}

export function useSocialRelationshipRepository() {
  const repository = useContext(SocialRelationshipRepositoryContext);
  if (!repository) {
    throw new Error(
      'RelationshipCapabilitiesProvider is missing from application composition.',
    );
  }
  return repository;
}
