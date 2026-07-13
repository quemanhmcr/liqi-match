import { describe, expect, it, jest } from '@jest/globals';

import type { AssetCacheDriver } from '@/shared/assets/asset-cache-driver';

import { createAssetKey } from '../asset-key';
import { createAssetManifest } from '../asset-manifest';
import {
  assetSimulationFaultCodes,
  assetSimulationOperations,
  createSimulationAssetResolver,
  type AssetSimulationRuntimePort,
} from '../simulation-asset-resolver';

const bundledKey = createAssetKey('asset:v1/profile/minh-anh/avatar');
const remoteKey = createAssetKey('asset:v1/profile/khoa-jungle/avatar');

function manifest() {
  return createAssetManifest({
    entries: [
      {
        format: 'png',
        height: 512,
        key: bundledKey,
        kind: 'avatar',
        ownerId: 'minh-anh',
        source: { module: 1, type: 'bundled' },
        width: 512,
      },
      {
        format: 'webp',
        height: 512,
        key: remoteKey,
        kind: 'avatar',
        ownerId: 'khoa-jungle',
        source: { type: 'remote', url: 'https://cdn.example/khoa.webp' },
        width: 512,
      },
    ],
    generatedAt: '2026-07-13T00:00:00.000Z',
  });
}

function cacheDriver(remoteCached = false): AssetCacheDriver {
  return {
    clear: jest.fn(async () => {}),
    isRemoteCached: jest.fn(async () => remoteCached),
    preloadBundled: jest.fn(async () => ({ state: 'ready' as const })),
    preloadLocal: jest.fn(async () => ({ state: 'ready' as const })),
    preloadRemote: jest.fn(async () => ({ state: 'ready' as const })),
  };
}

function runtime() {
  let network: 'offline' | 'online' = 'online';
  let listener: ((state: 'offline' | 'online') => void) | undefined;
  let participant:
    | { key: string; phase: 'after-world'; reset(): Promise<void> | void }
    | undefined;
  let directive: Parameters<
    Parameters<AssetSimulationRuntimePort['execute']>[1]
  >[0]['fault'] = null;
  const operations: { operation: string; scope?: string }[] = [];

  const port: AssetSimulationRuntimePort = {
    async execute(input, task) {
      operations.push({ operation: input.operation, scope: input.scope });
      if (network === 'offline') {
        throw Object.assign(new Error('offline'), { code: 'offline' });
      }
      const current = directive;
      directive = null;
      return task({ fault: current, network });
    },
    readDebugState: () => ({ controller: { network } }),
    registerResetParticipant(next) {
      participant = next;
      return () => {
        participant = undefined;
      };
    },
    subscribeNetworkState(next) {
      listener = next;
      return { remove: () => (listener = undefined) };
    },
  };

  return {
    operations,
    port,
    resetCache: () => participant?.reset(),
    schedulePartialFailure(code: string) {
      directive = { code, kind: 'partial_failure', retryable: true };
    },
    setNetwork(next: 'offline' | 'online') {
      network = next;
      listener?.(next);
    },
  };
}

describe('simulation asset resolver adapter', () => {
  it('uses shared runtime operations and asset-key scope', async () => {
    const current = runtime();
    const resolver = createSimulationAssetResolver({
      manifest: manifest(),
      runtime: current.port,
    });

    await resolver.resolveWithSimulation(bundledKey);
    await resolver.preload([bundledKey]);

    expect(current.operations).toEqual([
      { operation: assetSimulationOperations.resolve, scope: bundledKey },
      { operation: assetSimulationOperations.load, scope: bundledKey },
    ]);
  });

  it('reacts to the shared offline transition and still uses cached remote bytes', async () => {
    const current = runtime();
    const resolver = createSimulationAssetResolver({
      cacheDriver: cacheDriver(true),
      manifest: manifest(),
      runtime: current.port,
    });

    current.setNetwork('offline');
    expect((await resolver.resolveWithSimulation(remoteKey)).state).toBe(
      'offline-unavailable',
    );
    await resolver.preload([remoteKey]);
    expect(resolver.resolve(remoteKey).state).toBe('ready');
  });

  it('maps media association failure to uploaded-but-unassociated', async () => {
    const current = runtime();
    const resolver = createSimulationAssetResolver({
      manifest: manifest(),
      runtime: current.port,
    });
    current.schedulePartialFailure(
      assetSimulationFaultCodes.mediaAssociationFailed,
    );

    expect((await resolver.resolveWithSimulation(bundledKey)).state).toBe(
      'uploaded-but-unassociated',
    );
  });

  it.each<
    [
      'asset_corrupt' | 'asset_missing' | 'remote_asset_unavailable',
      'corrupt' | 'missing' | 'offline-unavailable',
    ]
  >([
    [assetSimulationFaultCodes.corrupt, 'corrupt'],
    [assetSimulationFaultCodes.missing, 'missing'],
    [assetSimulationFaultCodes.remoteUnavailable, 'offline-unavailable'],
  ])('maps %s to %s', async (code, expected) => {
    const current = runtime();
    const resolver = createSimulationAssetResolver({
      manifest: manifest(),
      runtime: current.port,
    });
    current.schedulePartialFailure(code);

    expect((await resolver.resolveWithSimulation(remoteKey)).state).toBe(
      expected,
    );
  });

  it('registers a non-snapshotted after-world cache reset participant', async () => {
    const current = runtime();
    const driver = cacheDriver();
    createSimulationAssetResolver({
      cacheDriver: driver,
      manifest: manifest(),
      runtime: current.port,
    });

    await current.resetCache();
    expect(driver.clear).toHaveBeenCalledTimes(1);
  });
});
