import { describe, expect, it, jest } from '@jest/globals';

import type {
  AssetCacheDriver,
  AssetCacheLoadResult,
} from '@/shared/assets/asset-cache-driver';

import { createAssetKey } from '../asset-key';
import { createAssetManifest } from '../asset-manifest';
import { createAssetResolver } from '../asset-resolver';
import type {
  AssetManifestEntry,
  AssetSimulationSnapshot,
} from '../asset-types';

const bundledKey = createAssetKey('asset:profile:minh-anh:avatar');
const remoteKey = createAssetKey('asset:profile:khoa-jungle:avatar');
const uploadKey = createAssetKey('asset:profile:minh-anh:cover');

const entries: readonly AssetManifestEntry[] = [
  {
    format: 'png',
    height: 512,
    key: bundledKey,
    kind: 'avatar',
    ownerId: 'profile:minh-anh',
    source: { module: 101, type: 'bundled' },
    width: 512,
  },
  {
    format: 'webp',
    height: 720,
    key: remoteKey,
    kind: 'avatar',
    ownerId: 'profile:khoa-jungle',
    source: { type: 'remote', url: 'https://cdn.example/avatar.webp' },
    width: 720,
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function cacheDriver(
  overrides: Partial<AssetCacheDriver> = {},
): AssetCacheDriver {
  return {
    clear: jest.fn(async () => {}),
    isRemoteCached: jest.fn(async () => false),
    preloadBundled: jest.fn(async () => ({ state: 'ready' as const })),
    preloadLocal: jest.fn(async () => ({ state: 'ready' as const })),
    preloadRemote: jest.fn(async () => ({ state: 'ready' as const })),
    ...overrides,
  };
}

function setup(
  input: {
    cache?: AssetCacheDriver;
    snapshot?: AssetSimulationSnapshot;
  } = {},
) {
  let snapshot = input.snapshot ?? { network: 'online' as const };
  const resolver = createAssetResolver({
    cacheDriver: input.cache ?? cacheDriver(),
    manifest: createAssetManifest({
      entries,
      generatedAt: '2026-07-13T00:00:00.000Z',
    }),
    simulation: { snapshot: () => snapshot },
  });
  return {
    resolver,
    setSnapshot(next: AssetSimulationSnapshot) {
      snapshot = next;
    },
  };
}

describe('AssetResolver', () => {
  it('resolves bundled and remote sources through one contract', () => {
    const { resolver } = setup();

    expect(resolver.resolve(bundledKey)).toMatchObject({
      fallback: 'avatar-neutral',
      source: 101,
      state: 'ready',
    });
    expect(resolver.resolve(remoteKey)).toMatchObject({
      source: {
        cacheKey: 'https://cdn.example/avatar.webp',
        uri: 'https://cdn.example/avatar.webp',
      },
      state: 'ready',
    });
  });

  it('exposes loading and final preload states deterministically', async () => {
    const pending = deferred<AssetCacheLoadResult>();
    const driver = cacheDriver({
      preloadBundled: jest.fn(() => pending.promise),
    });
    const { resolver } = setup({ cache: driver });

    const preload = resolver.preload([bundledKey]);
    expect(resolver.resolve(bundledKey).state).toBe('loading');
    pending.resolve({ state: 'ready' });
    await preload;
    expect(resolver.resolve(bundledKey).state).toBe('ready');
  });

  it('uses cached remote media offline and reports uncached media unavailable', async () => {
    const driver = cacheDriver({
      isRemoteCached: jest.fn(async () => true),
    });
    const { resolver, setSnapshot } = setup({ cache: driver });
    setSnapshot({ network: 'offline' });

    expect(resolver.resolve(remoteKey).state).toBe('offline-unavailable');
    await resolver.preload([remoteKey]);
    expect(resolver.resolve(remoteKey).state).toBe('ready');
  });

  it('maps shared simulation faults without owning a network controller', () => {
    const { resolver } = setup({
      snapshot: {
        faults: { [bundledKey]: 'corrupt', [remoteKey]: 'remote-unavailable' },
        network: 'online',
      },
    });

    expect(resolver.resolve(bundledKey).state).toBe('corrupt');
    expect(resolver.resolve(remoteKey).state).toBe('offline-unavailable');
  });

  it.each<
    [
      'recoverable-upload' | 'uploaded-but-unassociated',
      'recoverable-upload' | 'uploaded-but-unassociated',
    ]
  >([
    ['recoverable-upload', 'recoverable-upload'],
    ['uploaded-but-unassociated', 'uploaded-but-unassociated'],
  ])('exposes upload lifecycle %s', (lifecycle, expected) => {
    const { resolver } = setup();
    resolver.upsertRuntimeAsset(
      {
        format: 'jpg',
        height: 1200,
        key: uploadKey,
        kind: 'cover',
        ownerId: 'profile:minh-anh',
        source: { type: 'local-uri', uri: 'file:///draft/cover.jpg' },
        width: 1600,
      },
      lifecycle,
    );

    expect(resolver.resolve(uploadKey)).toMatchObject({
      source: { uri: 'file:///draft/cover.jpg' },
      state: expected,
    });
  });

  it('supports logical per-key invalidation and physical global invalidation', async () => {
    const driver = cacheDriver();
    const { resolver } = setup({ cache: driver });
    resolver.markLoadFailure(bundledKey, 'corrupt');
    resolver.markLoadFailure(remoteKey, 'missing');

    await resolver.invalidate([bundledKey]);
    expect(resolver.resolve(bundledKey).state).toBe('ready');
    expect(resolver.resolve(remoteKey).state).toBe('missing');
    expect(driver.clear).not.toHaveBeenCalled();

    await resolver.invalidate();
    expect(resolver.resolve(remoteKey).state).toBe('ready');
    expect(driver.clear).toHaveBeenCalledTimes(1);
  });

  it('returns a stable missing contract for unknown keys', () => {
    const { resolver } = setup();
    const unknown = createAssetKey('asset:profile:unknown:avatar');

    expect(resolver.resolve(unknown)).toEqual({
      fallback: 'media-neutral',
      key: unknown,
      retryable: true,
      state: 'missing',
    });
  });
});
