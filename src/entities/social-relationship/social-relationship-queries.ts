import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/shared/auth/auth-context';

import { useSocialRelationshipRepository } from './RelationshipCapabilitiesProvider';

export const friendshipsQueryKey = [
  'social-relationships',
  'friendships',
] as const;

export function useFriendshipsQuery(limit = 100) {
  const { session } = useAuth();
  const repository = useSocialRelationshipRepository();
  return useQuery({
    enabled: Boolean(session),
    queryFn: async () => {
      if (!session) throw new Error('Authentication is required.');
      return repository.listFriendships(session, { limit });
    },
    queryKey: [...friendshipsQueryKey, limit],
    staleTime: 30_000,
  });
}

export const socialRelationshipsQueryKey = [
  'social-relationships',
  'hub',
] as const;

export function useSocialRelationshipsQuery(limit = 100) {
  const { session } = useAuth();
  const repository = useSocialRelationshipRepository();
  return useQuery({
    enabled: Boolean(session),
    queryFn: async () => {
      if (!session) throw new Error('Authentication is required.');
      return repository.listRelationships(session, { limit });
    },
    queryKey: [...socialRelationshipsQueryKey, limit],
    staleTime: 15_000,
  });
}
