import {
  Image,
  View,
  type ImageProps,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  discoverResolvedMediaSource,
  discoverResolvedMediaState,
  type DiscoverResolvedMedia,
} from '../model/discover-domain';

export type DiscoverResolvedImageProps = Omit<ImageProps, 'source'> & {
  media: DiscoverResolvedMedia;
};

export function DiscoverResolvedImage({
  media,
  style,
  ...props
}: DiscoverResolvedImageProps) {
  const source = discoverResolvedMediaSource(media);

  if (source) return <Image {...props} source={source} style={style} />;

  const state = discoverResolvedMediaState(media);
  return (
    <View
      accessibilityLabel={`Media ${state}`}
      style={[fallbackStyle, style as StyleProp<ViewStyle>]}
      testID={props.testID}
    />
  );
}

const fallbackStyle: StyleProp<ImageStyle> = {
  backgroundColor: 'rgba(122,132,171,0.16)',
};
