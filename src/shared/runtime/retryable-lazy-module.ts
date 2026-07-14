/**
 * Normalizes bundler-specific PromiseLike module imports into native Promises.
 *
 * Expo's development lazy bundler may return a thenable that only implements
 * `then`, so consumers must not call `catch` or `finally` on the raw import.
 */
export function createRetryableLazyModuleLoader<T>(
  loadModule: () => PromiseLike<T>,
): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight !== null) return inFlight;

    // Starting from a native Promise captures synchronous loader failures and
    // assimilates PromiseLike values that expose only `then`.
    const attempt = Promise.resolve().then(loadModule);
    inFlight = attempt;

    void attempt.catch(() => {
      // Do not let a stale failed attempt clear a newer successful attempt.
      if (inFlight === attempt) inFlight = null;
    });

    return attempt;
  };
}
