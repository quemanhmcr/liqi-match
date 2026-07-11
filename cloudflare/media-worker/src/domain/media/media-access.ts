import type { MediaAsset } from './media-types';

export type MediaAccessDecision =
  'allow-public' | 'allow-owner' | 'check-conversation-membership' | 'deny';

/** Pure policy. Authentication and database lookups belong to application code. */
export function decideMediaAccess(
  asset: MediaAsset,
  userId: string | undefined,
): MediaAccessDecision {
  if (asset.visibility === 'public') return 'allow-public';
  if (!userId) return 'deny';
  if (asset.owner_id === userId) return 'allow-owner';
  if (asset.visibility === 'conversation_members') {
    return 'check-conversation-membership';
  }
  return 'deny';
}

export function isReadyForDelivery(asset: MediaAsset) {
  return (
    asset.deleted_at === null &&
    asset.status === 'ready' &&
    asset.moderation_status === 'approved'
  );
}
