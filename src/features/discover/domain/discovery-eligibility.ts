import type { PlayerLifecycleSnapshotV1 } from '@/shared/contracts/core-v1';

/**
 * Consumer-owned acceptance policy for the lifecycle capability supplied by
 * Mission 1. Profile shape, avatar presence, hero count, and persistence layout
 * are deliberately unavailable at this boundary.
 */
export function isDiscoveryEligible(
  lifecycle: PlayerLifecycleSnapshotV1,
): boolean {
  return lifecycle.state === 'active' && lifecycle.discoverable;
}
