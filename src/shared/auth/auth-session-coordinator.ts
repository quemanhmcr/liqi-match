import type { AuthSession } from './auth-session';

type SessionListener = (session: AuthSession | null) => void;

type InFlightReconciliation = Readonly<{
  key: string;
  revision: number;
  promise: Promise<AuthSession>;
}>;

/**
 * Serializes authoritative session reconciliation and prevents a stale network
 * response from reviving a session after sign-out or a newer token rotation.
 */
export class AuthSessionCoordinator {
  private current: AuthSession | null = null;
  private revision = 0;
  private inFlight: InFlightReconciliation | null = null;
  private readonly listeners = new Set<SessionListener>();

  getCurrent(): AuthSession | null {
    return this.current;
  }

  reconcile(
    key: string,
    resolve: () => Promise<AuthSession>,
  ): Promise<AuthSession> {
    if (this.inFlight?.key === key) return this.inFlight.promise;

    const revision = ++this.revision;
    const promise = resolve().then((session) => {
      if (this.revision === revision) this.publish(session);
      return session;
    });
    this.inFlight = { key, promise, revision };

    return promise.finally(() => {
      if (this.inFlight?.promise === promise) this.inFlight = null;
    });
  }

  clear(): void {
    this.revision += 1;
    this.inFlight = null;
    this.publish(null);
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    this.notify(listener, this.current);
    return () => this.listeners.delete(listener);
  }

  private publish(session: AuthSession | null): void {
    if (this.current === session) return;
    this.current = session;
    for (const listener of this.listeners) this.notify(listener, session);
  }

  private notify(listener: SessionListener, session: AuthSession | null): void {
    try {
      listener(session);
    } catch (error) {
      console.error('[auth.session_listener_failed]', error);
    }
  }
}
