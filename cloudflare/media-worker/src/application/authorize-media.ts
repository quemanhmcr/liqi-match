import { decideMediaAccess } from '../domain/media/media-access';
import type { MediaAsset } from '../domain/media/media-types';
import type { IdentityVerifier, MediaRepository } from './ports';

export type AuthorizationResult = {
  authenticated: boolean;
  allowed: boolean;
  userId?: string;
};

export async function authorizeMediaRequest(input: {
  asset: MediaAsset;
  bearerToken?: string;
  identity: IdentityVerifier;
  repository: MediaRepository;
}): Promise<AuthorizationResult> {
  if (input.asset.visibility === 'public') {
    return { authenticated: false, allowed: true };
  }
  if (!input.bearerToken) return { authenticated: false, allowed: false };

  const { userId } = await input.identity.verify(input.bearerToken);
  const decision = decideMediaAccess(input.asset, userId);
  const allowed =
    decision === 'allow-owner' ||
    (decision === 'check-conversation-membership' &&
      (await input.repository.isConversationMemberForAsset(
        input.asset.id,
        userId,
      )));

  return { authenticated: true, allowed, userId };
}
