import type {
  DeepLinkV1,
  PlayerLifecycleStateV1,
} from '@/shared/contracts/core-v1';

export type DeepLinkAccessDecision =
  | Readonly<{ kind: 'destination'; deepLink: DeepLinkV1 }>
  | Readonly<{ kind: 'defer-lifecycle' }>
  | Readonly<{ kind: 'defer-target-resolution' }>
  | Readonly<{ kind: 'login-then-destination' }>
  | Readonly<{
      kind: 'home-safe-fallback';
      reason: 'expired-target' | 'player-unavailable';
    }>;

export type DecideDeepLinkAccessInput = Readonly<{
  authenticated: boolean;
  deepLink: DeepLinkV1;
  playerLifecycle: PlayerLifecycleStateV1 | null;
  targetExists: boolean | null;
}>;

export function decideDeepLinkAccess(
  input: DecideDeepLinkAccessInput,
): DeepLinkAccessDecision {
  if (!input.authenticated) return { kind: 'login-then-destination' };
  if (!input.playerLifecycle) return { kind: 'defer-lifecycle' };

  switch (input.playerLifecycle) {
    case 'registered':
    case 'onboarding':
      return { kind: 'defer-lifecycle' };
    case 'suspended':
    case 'deleting':
    case 'deleted':
      return { kind: 'home-safe-fallback', reason: 'player-unavailable' };
    case 'active':
      if (input.targetExists === null) {
        return { kind: 'defer-target-resolution' };
      }
      return input.targetExists
        ? { deepLink: input.deepLink, kind: 'destination' }
        : { kind: 'home-safe-fallback', reason: 'expired-target' };
  }
}
