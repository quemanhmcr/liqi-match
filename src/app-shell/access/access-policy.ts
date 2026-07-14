import type { PlayerLifecycleStateV1 } from '@/shared/contracts/core-v1';

export type AccessArea = 'app' | 'onboarding' | 'public';

export type PlayerAccessMode =
  | 'active'
  | 'deleted'
  | 'deleting'
  | 'legacy_simulation'
  | 'onboarding'
  | 'suspended'
  | 'unavailable';

/** Lifecycle is the only production authority for player route eligibility. */
export function resolvePlayerAccessMode({
  lifecycleState,
  runtimeMode,
}: {
  lifecycleState: PlayerLifecycleStateV1 | null;
  runtimeMode: 'api' | 'simulation';
}): PlayerAccessMode {
  if (lifecycleState === null) {
    return runtimeMode === 'simulation' ? 'legacy_simulation' : 'unavailable';
  }
  if (lifecycleState === 'registered' || lifecycleState === 'onboarding') {
    return 'onboarding';
  }
  if (lifecycleState === 'active') return 'active';
  if (lifecycleState === 'suspended') return 'suspended';
  if (lifecycleState === 'deleting') return 'deleting';
  return 'deleted';
}
