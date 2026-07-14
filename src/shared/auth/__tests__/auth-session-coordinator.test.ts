import { describe, expect, it, jest } from '@jest/globals';

import { AuthSessionCoordinator } from '@/shared/auth/auth-session-coordinator';
import type { AuthSession } from '@/shared/auth/auth-session';

function session(accessToken: string): AuthSession {
  return {
    accessToken,
    expiresAt: 4_102_444_800,
    refreshToken: `refresh-${accessToken}`,
    tokenType: 'bearer',
    user: { id: '01000000-0000-4000-8000-000000000020' },
  };
}

describe('AuthSessionCoordinator', () => {
  it('deduplicates reconciliation for the same access token', async () => {
    const coordinator = new AuthSessionCoordinator();
    const resolve = jest.fn(async () => session('token-a'));

    const [first, second] = await Promise.all([
      coordinator.reconcile('token-a', resolve),
      coordinator.reconcile('token-a', resolve),
    ]);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(coordinator.getCurrent()).toBe(first);
  });

  it('does not revive a session after sign-out during reconciliation', async () => {
    const coordinator = new AuthSessionCoordinator();
    let release!: (value: AuthSession) => void;
    const pending = new Promise<AuthSession>((resolve) => {
      release = resolve;
    });
    const reconciliation = coordinator.reconcile('token-a', () => pending);

    coordinator.clear();
    release(session('token-a'));
    await reconciliation;

    expect(coordinator.getCurrent()).toBeNull();
  });

  it('prevents an older token response from replacing a newer session', async () => {
    const coordinator = new AuthSessionCoordinator();
    let releaseOld!: (value: AuthSession) => void;
    const oldPending = new Promise<AuthSession>((resolve) => {
      releaseOld = resolve;
    });
    const oldRequest = coordinator.reconcile('token-a', () => oldPending);
    const newSession = await coordinator.reconcile('token-b', async () =>
      session('token-b'),
    );

    releaseOld(session('token-a'));
    await oldRequest;

    expect(coordinator.getCurrent()).toBe(newSession);
    expect(coordinator.getCurrent()?.accessToken).toBe('token-b');
  });

  it('immediately publishes current state to new subscribers', () => {
    const coordinator = new AuthSessionCoordinator();
    const listener = jest.fn();

    const unsubscribe = coordinator.subscribe(listener);
    coordinator.clear();
    unsubscribe();

    expect(listener).toHaveBeenCalledWith(null);
  });
  it('isolates listener failures from session publication', async () => {
    const coordinator = new AuthSessionCoordinator();
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const healthyListener = jest.fn();
    coordinator.subscribe(() => {
      throw new Error('listener failed');
    });
    coordinator.subscribe(healthyListener);

    const resolved = await coordinator.reconcile('token-a', async () =>
      session('token-a'),
    );

    expect(coordinator.getCurrent()).toBe(resolved);
    expect(healthyListener).toHaveBeenLastCalledWith(resolved);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
