import {
  Image,
  View,
  type ImageProps,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  messageResolvedMediaSource,
  messageResolvedMediaState,
  type MessageResolvedMedia,
} from '../model/chat-message';

export type MessageResolvedImageProps = Omit<ImageProps, 'source'> & {
  media: MessageResolvedMedia;
};

export function MessageResolvedImage({
  media,
  style,
  ...props
}: MessageResolvedImageProps) {
  const source = messageResolvedMediaSource(media);
  if (source) return <Image {...props} source={source} style={style} />;

  const state = messageResolvedMediaState(media);
  return (
    <View
      accessibilityLabel={`Message media ${state}`}
      style={[fallbackStyle, style as StyleProp<ViewStyle>]}
      testID={props.testID}
    />
  );
}

const fallbackStyle: StyleProp<ImageStyle> = {
  backgroundColor: 'rgba(108,120,160,0.18)',
};
