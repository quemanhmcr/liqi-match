import type { ImageSourcePropType } from 'react-native';

import { resolveGoldenWorldAssetSource } from '@/entities/media-asset';

import type { MessageAssetRef } from '../contracts/messages-contracts';

const roleJungle =
  require('../../../../assets/anh_mau2/lane-icons/jungle.png') as ImageSourcePropType;

export function resolveMessageAsset(
  asset: MessageAssetRef | undefined,
): ImageSourcePropType | undefined {
  if (!asset) return undefined;
  if (asset.kind === 'remote') return { uri: asset.url };
  if (asset.assetKey === 'role:jungle') return roleJungle;
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
