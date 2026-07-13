import type { ImageSourcePropType } from 'react-native';

import type {
  AssetKey,
  AssetResolutionState,
  AssetResolver,
} from '@/entities/media-asset';

export type ProfileResolvedMedia = Readonly<{
  source?: ImageSourcePropType;
  state: AssetResolutionState;
}>;

export function resolveProfileMedia(
  resolver: AssetResolver,
  input: Readonly<{ assetKey?: AssetKey; uri?: string }>,
): ProfileResolvedMedia {
  if (input.uri) {
    return { source: { uri: input.uri }, state: 'ready' };
  }
  if (!input.assetKey) return { state: 'missing' };

  const resolved = resolver.resolve(input.assetKey);
  return {
    ...(resolved.source
      ? { source: resolved.source as ImageSourcePropType }
      : undefined),
    state: resolved.state,
  };
}
