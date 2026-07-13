import type { ImageSourcePropType } from 'react-native';

import { resolveGoldenWorldAssetSource } from '@/entities/media-asset';

import type { MessageAssetRef } from '../contracts/messages-contracts';

export function resolveMessageAsset(
  asset: MessageAssetRef | undefined,
): ImageSourcePropType | undefined {
  if (!asset) return undefined;
  if (asset.kind === 'remote') return { uri: asset.url };
  return resolveGoldenWorldAssetSource(asset.assetKey) as
    ImageSourcePropType | undefined;
}

export function resolveMessageAssetUri(asset: MessageAssetRef) {
  if (asset.kind === 'remote') return asset.url;
  const source = resolveMessageAsset(asset);
  return source && typeof source === 'object' && 'uri' in source
    ? source.uri
    : undefined;
}
