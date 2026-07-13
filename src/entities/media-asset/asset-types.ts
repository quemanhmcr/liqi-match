import type {
  AssetKey,
  SimulatedAssetKind,
  SimulatedAssetState,
} from '@/entities/simulation';

export type AssetKind = SimulatedAssetKind;
export type AssetFormat = 'jpg' | 'mp4' | 'png' | 'webp';

export type AssetPlaceholderVariant =
  'avatar-neutral' | 'cover-neutral' | 'media-neutral' | 'set-neutral';

export type AssetManifestSource =
  | { module: number; type: 'bundled' }
  | { type: 'local-uri'; uri: string }
  | { type: 'remote'; url: string }
  | { type: 'placeholder'; variant: AssetPlaceholderVariant };

export type AssetLifecycleState =
  'stable' | 'recoverable-upload' | 'uploaded-but-unassociated';

export type AssetManifestUsage = 'golden-world' | 'legacy-library' | 'scenario';

export type AssetOwnerKind = 'message' | 'profile' | 'set' | 'shared';

export type AssetManifestEntry = {
  altText?: string;
  byteSize?: number;
  format: AssetFormat;
  height: number;
  key: AssetKey;
  kind: AssetKind;
  lifecycle?: AssetLifecycleState;
  ownerId?: string;
  ownerKind?: AssetOwnerKind;
  simulationState?: SimulatedAssetState;
  source: AssetManifestSource;
  usage?: AssetManifestUsage;
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
