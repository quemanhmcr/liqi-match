import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';

import { SocialCommandCoordinator } from './social-command-coordinator';
import type {
  PlayerPrivacyProvider,
  PlayerSafetyCommandService,
  SocialRelationshipCommandService,
  SocialRelationshipRepository,
} from './social-relationship-repository';

type SocialRelationshipContextValue = Readonly<{
  coordinator: SocialCommandCoordinator | null;
  privacyProvider: PlayerPrivacyProvider | null;
  repository: SocialRelationshipRepository;
}>;

const SocialRelationshipContext =
  createContext<SocialRelationshipContextValue | null>(null);

export type RelationshipCapabilitiesProviderProps = PropsWithChildren<{
  repository: SocialRelationshipRepository;
}>;

export function RelationshipCapabilitiesProvider({
  children,
  repository,
}: RelationshipCapabilitiesProviderProps) {
  const value = useMemo<SocialRelationshipContextValue>(
    () => ({
      coordinator: isSocialCommandRuntime(repository)
        ? new SocialCommandCoordinator({
            friendship: repository,
            privacy: repository,
            safety: repository,
          })
        : null,
      privacyProvider: isPlayerPrivacyProvider(repository) ? repository : null,
      repository,
    }),
    [repository],
  );

  return (
    <SocialRelationshipContext.Provider value={value}>
      {children}
    </SocialRelationshipContext.Provider>
  );
}

export function useSocialRelationshipRepository() {
  return useSocialRelationshipContext().repository;
}

export function useSocialCommandCoordinator() {
  return useSocialRelationshipContext().coordinator;
}

export function usePlayerPrivacyProvider() {
  return useSocialRelationshipContext().privacyProvider;
}

function useSocialRelationshipContext() {
  const value = useContext(SocialRelationshipContext);
  if (!value) {
    throw new Error(
      'RelationshipCapabilitiesProvider is missing from application composition.',
    );
  }
  return value;
}

function isPlayerPrivacyProvider(
  repository: SocialRelationshipRepository,
): repository is SocialRelationshipRepository & PlayerPrivacyProvider {
  const candidate = repository as Partial<PlayerPrivacyProvider>;
  return [
    candidate.getPrivacy,
    candidate.updatePrivacy,
    candidate.getTrustVisibility,
  ].every((method) => typeof method === 'function');
}

type SocialCommandRuntime = SocialRelationshipRepository &
  SocialRelationshipCommandService &
  PlayerSafetyCommandService &
  PlayerPrivacyProvider;

function isSocialCommandRuntime(
  repository: SocialRelationshipRepository,
): repository is SocialCommandRuntime {
  const candidate = repository as Partial<SocialCommandRuntime>;
  return [
    candidate.requestFriendship,
    candidate.acceptFriendship,
    candidate.declineFriendship,
    candidate.cancelFriendship,
    candidate.removeFriendship,
    candidate.blockPlayer,
    candidate.unblockPlayer,
    candidate.mutePlayer,
    candidate.unmutePlayer,
    candidate.getPrivacy,
    candidate.updatePrivacy,
    candidate.getTrustVisibility,
    candidate.reportPlayer,
    candidate.reportMessage,
  ].every((method) => typeof method === 'function');
}
