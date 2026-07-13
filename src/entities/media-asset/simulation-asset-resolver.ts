import type { AssetCacheDriver } from '@/shared/assets/asset-cache-driver';

import type { AssetKey } from './asset-key';
import {
  createAssetResolver,
  type MutableAssetResolver,
} from './asset-resolver';
import type {
  AssetManifest,
  AssetResolutionState,
  ResolvedAsset,
} from './asset-types';

export const assetSimulationOperations = {
  load: 'assets.load',
  resolve: 'assets.resolve',
} as const;

export const assetSimulationFaultCodes = {
  corrupt: 'asset_corrupt',
  mediaAssociationFailed: 'media_association_failed',
  missing: 'asset_missing',
  remoteUnavailable: 'remote_asset_unavailable',
} as const;

type AssetSimulationNetworkState = 'offline' | 'online';

type AssetSimulationDirective =
  | {
      code: string;
      kind: 'partial_failure';
      retryable?: boolean;
    }
  | {
      kind: 'partial_response';
      limit?: number;
      ratio?: number;
    }
  | null;

type AssetSimulationOperationContext = {
  fault: AssetSimulationDirective;
  network: AssetSimulationNetworkState;
};

export interface AssetSimulationRuntimePort {
  execute<TResult>(
    input: {
      operation: string;
      scope?: string;
      signal?: AbortSignal;
    },
    task: (
      context: AssetSimulationOperationContext,
    ) => Promise<TResult> | TResult,
  ): Promise<TResult>;
  readDebugState(): {
    controller: { network: AssetSimulationNetworkState };
  };
  registerResetParticipant(participant: {
    key: string;
    phase: 'after-world';
    reset(): Promise<void> | void;
  }): () => void;
  subscribeNetworkState(
    listener: (state: AssetSimulationNetworkState) => void,
  ): { remove(): void };
}

export interface SimulationAssetResolver extends MutableAssetResolver {
  dispose(): void;
  resolveWithSimulation(
    key: AssetKey,
    signal?: AbortSignal,
  ): Promise<ResolvedAsset>;
}

export function createSimulationAssetResolver(input: {
  cacheDriver?: AssetCacheDriver;
  manifest: AssetManifest;
  participantKey?: string;
  runtime: AssetSimulationRuntimePort;
}): SimulationAssetResolver {
  let network = input.runtime.readDebugState().controller.network;
  const resolver = createAssetResolver({
    cacheDriver: input.cacheDriver,
    manifest: input.manifest,
    simulation: { snapshot: () => ({ network }) },
  });
  const networkSubscription = input.runtime.subscribeNetworkState((next) => {
    network = next;
  });
  const unregisterResetParticipant = input.runtime.registerResetParticipant({
    key: input.participantKey ?? 'assets.cache',
    phase: 'after-world',
    reset: () => resolver.invalidate(),
  });

  async function resolveWithSimulation(key: AssetKey, signal?: AbortSignal) {
    try {
      return await input.runtime.execute(
        { operation: assetSimulationOperations.resolve, scope: key, signal },
        ({ fault }) => applyDirective(resolver, key, fault),
      );
    } catch (error) {
      if (isOfflineSimulationError(error)) return resolver.resolve(key);
      throw error;
    }
  }

  async function preload(keys: readonly AssetKey[]) {
    for (const key of new Set(keys)) {
      try {
        await input.runtime.execute(
          { operation: assetSimulationOperations.load, scope: key },
          async ({ fault }) => {
            const directed = applyDirective(resolver, key, fault);
            if (directed.state !== 'ready') return;
            await resolver.preload([key]);
          },
        );
      } catch (error) {
        if (!isOfflineSimulationError(error)) throw error;
        await resolver.preload([key]);
      }
    }
  }

  return {
    ...resolver,
    dispose() {
      networkSubscription.remove();
      unregisterResetParticipant();
    },
    preload,
    resolveWithSimulation,
  };
}

function applyDirective(
  resolver: MutableAssetResolver,
  key: AssetKey,
  fault: AssetSimulationDirective,
): ResolvedAsset {
  if (!fault) return resolver.resolve(key);
  if (fault.kind === 'partial_response') {
    return fault.limit === 0 || fault.ratio === 0
      ? overrideState(resolver.resolve(key), 'missing', true)
      : resolver.resolve(key);
  }

  switch (fault.code) {
    case assetSimulationFaultCodes.corrupt:
      resolver.markLoadFailure(key, 'corrupt');
      return resolver.resolve(key);
    case assetSimulationFaultCodes.missing:
      resolver.markLoadFailure(key, 'missing');
      return resolver.resolve(key);
    case assetSimulationFaultCodes.remoteUnavailable:
      return overrideState(resolver.resolve(key), 'offline-unavailable', true);
    case assetSimulationFaultCodes.mediaAssociationFailed: {
      const current = resolver.resolve(key);
      if (current.entry) {
        resolver.upsertRuntimeAsset(current.entry, 'uploaded-but-unassociated');
      }
      return resolver.resolve(key);
    }
    default:
      return resolver.resolve(key);
  }
}

function overrideState(
  current: ResolvedAsset,
  state: AssetResolutionState,
  retryable: boolean,
): ResolvedAsset {
  return { ...current, retryable, state };
}

function isOfflineSimulationError(error: unknown) {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'offline'
  );
}
