import { Image as ExpoImage, type ImageProps } from 'expo-image';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { profileUi } from '../ui/profile-ui';

export type ProfileArtworkVariant =
  'memory-starter' | 'play-style' | 'user-media';

type ExpoImageSource = ImageProps['source'];

/**
 * Profile artwork keeps a full-composition layer over an ambient fill layer.
 *
 * `cover` is reserved for the non-authoritative ambient background. The visible
 * composition normally uses `contain`, so arbitrary user media is never
 * cropped. The authored 2:1 starter memory may use `cover` because its source
 * and frame share the same aspect ratio and its composition is focal-safe.
 */
export function ProfileArtwork({
  accessibilityLabel,
  onError,
  recyclingKey,
  source,
  testID,
  variant,
}: Readonly<{
  accessibilityLabel: string;
  onError?: () => void;
  recyclingKey?: string;
  source: ImageSourcePropType;
  testID?: string;
  variant: ProfileArtworkVariant;
}>) {
  const resolvedSource = source as ExpoImageSource;
  const remote = isRemoteSource(source);
  const contentPosition =
    variant === 'play-style' ? ('top center' as const) : ('center' as const);
  const foregroundFit = variant === 'memory-starter' ? 'cover' : 'contain';

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <ExpoImage
        allowDownscaling
        blurRadius={profileUi.artwork.ambientBlur}
        cachePolicy="memory-disk"
        contentFit="cover"
        contentPosition={contentPosition}
        recyclingKey={recyclingKey ? `${recyclingKey}:ambient` : undefined}
        source={resolvedSource}
        style={[StyleSheet.absoluteFill, styles.ambient]}
        transition={remote ? profileUi.artwork.remoteTransitionMs : 0}
      />
      <View style={[StyleSheet.absoluteFill, styles.ambientVeil]} />
      <ExpoImage
        accessibilityLabel={accessibilityLabel}
        accessible
        allowDownscaling
        cachePolicy="memory-disk"
        contentFit={foregroundFit}
        contentPosition={contentPosition}
        onError={onError}
        recyclingKey={recyclingKey}
        source={resolvedSource}
        style={[
          StyleSheet.absoluteFill,
          variant === 'play-style' && styles.playStyleComposition,
        ]}
        testID={testID}
        transition={remote ? profileUi.artwork.remoteTransitionMs : 0}
      />
    </View>
  );
}

function isRemoteSource(source: ImageSourcePropType) {
  if (!source || typeof source === 'number' || Array.isArray(source))
    return false;
  return typeof source.uri === 'string' && /^https?:\/\//i.test(source.uri);
}

const styles = StyleSheet.create({
  ambient: { opacity: profileUi.artwork.ambientOpacity },
  ambientVeil: { backgroundColor: profileUi.colors.artworkAmbientVeil },
  playStyleComposition: {
    bottom: profileUi.artwork.playStyleSafeInsetBottom,
    left: profileUi.artwork.playStyleSafeInsetHorizontal,
    right: profileUi.artwork.playStyleSafeInsetHorizontal,
    top: profileUi.artwork.playStyleSafeInsetTop,
  },
});
