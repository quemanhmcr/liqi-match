import type { AssetKey } from './asset-key';

export type AssetKind = 'avatar' | 'cover' | 'message-image' | 'set-artwork';

export type AssetFormat = 'jpg' | 'png' | 'webp';

export type AssetPlaceholderVariant =
  'avatar-neutral' | 'cover-neutral' | 'media-neutral' | 'set-neutral';

export type AssetManifestSource =
  | { module: number; type: 'bundled' }
  | { type: 'local-uri'; uri: string }
  | { type: 'remote'; url: string }
  | { type: 'placeholder'; variant: AssetPlaceholderVariant };

export type AssetLifecycleState =
  'stable' | 'recoverable-upload' | 'uploaded-but-unassociated';

export type AssetManifestEntry = {
  byteSize?: number;
  format: AssetFormat;
  height: number;
  key: AssetKey;
  kind: AssetKind;
  lifecycle?: AssetLifecycleState;
  ownerId?: string;
  source: AssetManifestSource;
  width: number;
};

export type AssetManifest = {
  entries: readonly AssetManifestEntry[];
  generatedAt: string;
  version: 1;
};

export type AssetRenderSource =
  | number
  | {
      cacheKey?: string;
      height?: number;
      uri: string;
      width?: number;
    };

export type AssetResolutionState =
  | 'corrupt'
  | 'loading'
  | 'missing'
  | 'offline-unavailable'
  | 'ready'
  | 'recoverable-upload'
  | 'uploaded-but-unassociated';

export type ResolvedAsset = {
  entry?: AssetManifestEntry;
  fallback: AssetPlaceholderVariant;
  key: AssetKey;
  retryable: boolean;
  source?: AssetRenderSource;
  state: AssetResolutionState;
};

export type AssetFault = 'corrupt' | 'missing' | 'remote-unavailable';

export type AssetSimulationSnapshot = {
  faults?: Readonly<Record<string, AssetFault | undefined>>;
  network: 'offline' | 'online';
};

export interface AssetSimulationStateProvider {
  snapshot(): AssetSimulationSnapshot;
}
