import type { ImageSourcePropType } from 'react-native';

import { requireGoldenWorldAssetSource } from '@/entities/media-asset';

export function resolveDiscoverAsset(assetKey: string): ImageSourcePropType {
  return requireGoldenWorldAssetSource(assetKey) as ImageSourcePropType;
}
