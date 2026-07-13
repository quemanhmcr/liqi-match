import {
  passiveAssetCacheDriver,
  type AssetCacheDriver,
  type AssetCacheLoadState,
} from '@/shared/assets/asset-cache-driver';

import type { AssetKey } from './asset-key';
import { indexAssetManifest } from './asset-manifest';
import type {
  AssetFault,
  AssetLifecycleState,
  AssetManifest,
  AssetManifestEntry,
  AssetPlaceholderVariant,
  AssetRenderSource,
  AssetResolutionState,
  AssetSimulationStateProvider,
  ResolvedAsset,
} from './asset-types';

export interface AssetResolver {
  invalidate(keys?: readonly AssetKey[]): Promise<void>;
  preload(keys: readonly AssetKey[]): Promise<void>;
  resolve(key: AssetKey): ResolvedAsset;
}

export interface MutableAssetResolver extends AssetResolver {
  markLoadFailure(key: AssetKey, reason: 'corrupt' | 'missing'): void;
  markReady(key: AssetKey): void;
  removeRuntimeAsset(key: AssetKey): void;
  upsertRuntimeAsset(
    entry: AssetManifestEntry,
    lifecycle?: AssetLifecycleState,
  ): void;
}

type ResolverLoadState = AssetCacheLoadState | 'loading';

const onlineStateProvider: AssetSimulationStateProvider = {
  snapshot: () => ({ network: 'online' }),
};

export function createAssetResolver(input: {
  cacheDriver?: AssetCacheDriver;
  manifest: AssetManifest;
  simulation?: AssetSimulationStateProvider;
}): MutableAssetResolver {
  const cacheDriver = input.cacheDriver ?? passiveAssetCacheDriver;
  const simulation = input.simulation ?? onlineStateProvider;
  const manifestEntries = indexAssetManifest(input.manifest);
  const runtimeEntries = new Map<string, AssetManifestEntry>();
  const loadStates = new Map<string, ResolverLoadState>();
  const cachedRemoteKeys = new Set<string>();

  function entryFor(key: AssetKey) {
    return runtimeEntries.get(key) ?? manifestEntries.get(key);
  }

  function resolve(key: AssetKey): ResolvedAsset {
    const entry = entryFor(key);
    if (!entry) return failedResolution(key, 'missing');

    const snapshot = simulation.snapshot();
    const fault = snapshot.faults?.[key];
    if (fault) return resolutionForFault(entry, fault);

    const loadState = loadStates.get(key);
    if (loadState === 'loading') return resolution(entry, 'loading');
    if (loadState === 'corrupt') return resolution(entry, 'corrupt');
    if (loadState === 'missing') return resolution(entry, 'missing');

    if (
      entry.source.type === 'remote' &&
      snapshot.network === 'offline' &&
      !cachedRemoteKeys.has(key)
    ) {
      return resolution(entry, 'offline-unavailable');
    }

    if (entry.simulationState === 'missing') {
      return resolution(entry, 'missing');
    }
    if (entry.simulationState === 'corrupt') {
      return resolution(entry, 'corrupt');
    }
    if (entry.simulationState === 'unassociated') {
      return resolution(entry, 'uploaded-but-unassociated');
    }
    if (entry.lifecycle === 'recoverable-upload') {
      return resolution(entry, 'recoverable-upload');
    }
    if (entry.lifecycle === 'uploaded-but-unassociated') {
      return resolution(entry, 'uploaded-but-unassociated');
    }

    return resolution(entry, 'ready');
  }

  async function preload(keys: readonly AssetKey[]) {
    const uniqueKeys = [...new Set(keys)];
    await Promise.all(
      uniqueKeys.map(async (key) => {
        const entry = entryFor(key);
        if (!entry) {
          loadStates.set(key, 'missing');
          return;
        }

        if (simulation.snapshot().faults?.[key]) return;
        loadStates.set(key, 'loading');

        if (entry.source.type === 'placeholder') {
          loadStates.set(key, 'ready');
          return;
        }

        if (entry.source.type === 'remote') {
          if (simulation.snapshot().network === 'offline') {
            const cached = await cacheDriver.isRemoteCached(entry.source.url);
            if (cached) {
              cachedRemoteKeys.add(key);
              loadStates.set(key, 'ready');
            } else {
              loadStates.delete(key);
            }
            return;
          }
          const result = await cacheDriver.preloadRemote(entry.source.url);
          if (result.state === 'ready') cachedRemoteKeys.add(key);
          loadStates.set(key, result.state);
          return;
        }

        const result =
          entry.source.type === 'bundled'
            ? await cacheDriver.preloadBundled(entry.source.module)
            : await cacheDriver.preloadLocal(entry.source.uri);
        loadStates.set(key, result.state);
      }),
    );
  }

  async function invalidate(keys?: readonly AssetKey[]) {
    if (keys) {
      for (const key of keys) {
        loadStates.delete(key);
        cachedRemoteKeys.delete(key);
      }
      return;
    }

    loadStates.clear();
    cachedRemoteKeys.clear();
    await cacheDriver.clear();
  }

  return {
    invalidate,
    markLoadFailure(key, reason) {
      loadStates.set(key, reason);
    },
    markReady(key) {
      loadStates.set(key, 'ready');
    },
    preload,
    removeRuntimeAsset(key) {
      runtimeEntries.delete(key);
      loadStates.delete(key);
      cachedRemoteKeys.delete(key);
    },
    resolve,
    upsertRuntimeAsset(entry, lifecycle = entry.lifecycle ?? 'stable') {
      runtimeEntries.set(entry.key, { ...entry, lifecycle });
      loadStates.delete(entry.key);
      cachedRemoteKeys.delete(entry.key);
    },
  };
}

function resolutionForFault(
  entry: AssetManifestEntry,
  fault: AssetFault,
): ResolvedAsset {
  if (fault === 'remote-unavailable') {
    return resolution(entry, 'offline-unavailable');
  }
  return resolution(entry, fault);
}

function failedResolution(
  key: AssetKey,
  state: Exclude<AssetResolutionState, 'ready'>,
): ResolvedAsset {
  return {
    fallback: 'media-neutral',
    key,
    retryable: state !== 'corrupt',
    state,
  };
}

function resolution(
  entry: AssetManifestEntry,
  state: AssetResolutionState,
): ResolvedAsset {
  const exposesSource = !['corrupt', 'missing', 'offline-unavailable'].includes(
    state,
  );
  return {
    entry,
    fallback: fallbackFor(entry),
    key: entry.key,
    retryable: [
      'loading',
      'offline-unavailable',
      'recoverable-upload',
      'uploaded-but-unassociated',
    ].includes(state),
    source: exposesSource ? sourceFor(entry) : undefined,
    state,
  };
}

function sourceFor(entry: AssetManifestEntry): AssetRenderSource | undefined {
  switch (entry.source.type) {
    case 'bundled':
      return entry.source.module;
    case 'local-uri':
      return {
        height: entry.height,
        uri: entry.source.uri,
        width: entry.width,
      };
    case 'remote':
      return {
        cacheKey: entry.source.url,
        height: entry.height,
        uri: entry.source.url,
        width: entry.width,
      };
    case 'placeholder':
      return undefined;
  }
}

function fallbackFor(entry: AssetManifestEntry): AssetPlaceholderVariant {
  if (entry.source.type === 'placeholder') return entry.source.variant;
  switch (entry.kind) {
    case 'avatar':
    case 'shared-fallback':
      return 'avatar-neutral';
    case 'cover':
    case 'wall':
      return 'cover-neutral';
    case 'set-artwork':
      return 'set-neutral';
    case 'build-preview':
    case 'message-image':
    case 'message-video':
    case 'role-icon':
    case 'vibe-artwork':
      return 'media-neutral';
  }
}
