import { describe, expect, it, jest } from '@jest/globals';

import { createRetryableLazyModuleLoader } from '../retryable-lazy-module';

describe('createRetryableLazyModuleLoader', () => {
  it('normalizes a thenable that does not implement catch or finally', async () => {
    const loadedModule = { name: 'auth-runtime' };
    const expoStyleThenable = {
      then<TResult1 = typeof loadedModule, TResult2 = never>(
        onfulfilled?:
          | ((value: typeof loadedModule) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?:
          ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): PromiseLike<TResult1 | TResult2> {
        return Promise.resolve(loadedModule).then(onfulfilled, onrejected);
      },
    } satisfies PromiseLike<typeof loadedModule>;

    expect('catch' in expoStyleThenable).toBe(false);
    expect('finally' in expoStyleThenable).toBe(false);

    const load = createRetryableLazyModuleLoader(() => expoStyleThenable);

    await expect(load()).resolves.toBe(loadedModule);
  });

  it('shares one in-flight module load across concurrent callers', async () => {
    const loadedModule = { name: 'auth-runtime' };
    let resolveLoad!: (value: typeof loadedModule) => void;
    const pending = new Promise<typeof loadedModule>((resolve) => {
      resolveLoad = resolve;
    });
    const importer = jest.fn(() => pending);
    const load = createRetryableLazyModuleLoader(importer);

    const first = load();
    const second = load();

    expect(second).toBe(first);
    expect(importer).toHaveBeenCalledTimes(0);

    await Promise.resolve();
    expect(importer).toHaveBeenCalledTimes(1);

    resolveLoad(loadedModule);
    await expect(first).resolves.toBe(loadedModule);
  });

  it('clears a failed attempt so the next call can retry', async () => {
    const loadedModule = { name: 'auth-runtime' };
    const importer = jest
      .fn<() => PromiseLike<typeof loadedModule>>()
      .mockRejectedValueOnce(new Error('split bundle unavailable'))
      .mockResolvedValueOnce(loadedModule);
    const load = createRetryableLazyModuleLoader(importer);

    await expect(load()).rejects.toThrow('split bundle unavailable');
    await expect(load()).resolves.toBe(loadedModule);
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
