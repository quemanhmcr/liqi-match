import {
  Image,
  View,
  type ImageProps,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { notificationsUi } from '../ui/notifications-ui';
import {
  notificationResolvedMediaSource,
  notificationResolvedMediaState,
  type NotificationResolvedMedia,
} from '../model/notification-view-model';

export type NotificationResolvedImageProps = Omit<ImageProps, 'source'> & {
  media: NotificationResolvedMedia;
};

export function NotificationResolvedImage({
  media,
  style,
  ...props
}: NotificationResolvedImageProps) {
  const source = notificationResolvedMediaSource(media);
  if (source) return <Image {...props} source={source} style={style} />;

  const state = notificationResolvedMediaState(media);
  return (
    <View
      accessibilityLabel={`Notification media ${state}`}
      style={[fallbackStyle, style as StyleProp<ViewStyle>]}
      testID={props.testID}
    />
  );
}

const fallbackStyle: StyleProp<ImageStyle> = {
  backgroundColor: notificationsUi.colors.mediaFallback,
};
