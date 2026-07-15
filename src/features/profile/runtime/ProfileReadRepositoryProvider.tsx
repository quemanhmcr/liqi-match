import { createContext, useContext, type PropsWithChildren } from 'react';

import type { AuthSession } from '@/shared/auth/auth-service';

import type { ProfileViewModel } from '../services/profile-service';

export type GetProfileInput = {
  /** Canonical PlayerId or a temporary legacy/simulation route identity. */
  identityId?: string;
  session: AuthSession;
};

export interface ProfileReadRepository {
  getProfile(input: GetProfileInput): Promise<ProfileViewModel | null>;
}

const ProfileReadRepositoryContext =
  createContext<ProfileReadRepository | null>(null);

export type ProfileReadRepositoryProviderProps = PropsWithChildren<{
  repository: ProfileReadRepository;
}>;

export function ProfileReadRepositoryProvider({
  children,
  repository,
}: ProfileReadRepositoryProviderProps) {
  return (
    <ProfileReadRepositoryContext.Provider value={repository}>
      {children}
    </ProfileReadRepositoryContext.Provider>
  );
}

export function useProfileReadRepository() {
  const repository = useContext(ProfileReadRepositoryContext);
  if (!repository) {
    throw new Error(
      'ProfileReadRepositoryProvider is missing from the application composition root.',
    );
  }
  return repository;
}
