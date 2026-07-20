import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  liqiColors,
  liqiComponentColors,
  liqiComponentGradients,
} from '@/shared/theme/liqi-design-system';

import type { MessageResolvedMedia } from '../model/chat-message';
import { MessageResolvedImage } from './MessageResolvedImage';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type MessageAvatarStackProps = Readonly<{
  avatars?: readonly MessageResolvedMedia[];
  fallbackIcon?: IoniconName;
  online?: boolean;
  primaryAvatar?: MessageResolvedMedia;
  size: number;
  testID?: string;
}>;

export function MessageAvatarStack({
  avatars = [],
  fallbackIcon = 'chatbubble-ellipses-outline',
  online = false,
  primaryAvatar,
  size,
  testID,
}: MessageAvatarStackProps) {
  const uniqueAvatars = deduplicateAvatars(
    [primaryAvatar, ...avatars].filter(
      (avatar): avatar is MessageResolvedMedia => Boolean(avatar),
    ),
  ).slice(0, 2);
  const stacked = uniqueAvatars.length > 1;
  const avatarSize = stacked ? Math.round(size * 0.76) : size;
  const width = stacked ? Math.round(size * 1.34) : size;

  return (
    <View style={{ height: size, width }} testID={testID}>
      {uniqueAvatars.length ? (
        uniqueAvatars.map((avatar, index) => (
          <AvatarFrame
            avatar={avatar}
            key={mediaIdentity(avatar)}
            left={stacked ? index * Math.round(size * 0.48) : 0}
            size={avatarSize}
          />
        ))
      ) : (
        <AvatarFrame fallbackIcon={fallbackIcon} left={0} size={size} />
      )}
      {online ? <View style={styles.onlineDot} /> : null}
    </View>
  );
}

function AvatarFrame({
  avatar,
  fallbackIcon,
  left,
  size,
}: Readonly<{
  avatar?: MessageResolvedMedia;
  fallbackIcon?: IoniconName;
  left: number;
  size: number;
}>) {
  return (
    <LinearGradient
      colors={liqiComponentGradients.messages.avatarRing}
      style={[
        styles.ring,
        {
          borderRadius: size / 2,
          height: size,
          left,
          width: size,
        },
      ]}
    >
      <View
        style={[
          styles.frame,
          {
            borderRadius: size / 2 - 2,
            height: size - 4,
            width: size - 4,
          },
        ]}
      >
        {avatar ? (
          <MessageResolvedImage
            media={avatar}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <Ionicons
            color={liqiColors.icon.primary}
            name={fallbackIcon ?? 'person-outline'}
            size={Math.round(size * 0.42)}
          />
        )}
      </View>
    </LinearGradient>
  );
}

function deduplicateAvatars(avatars: readonly MessageResolvedMedia[]) {
  const identities = new Set<string>();
  return avatars.filter((avatar) => {
    const identity = mediaIdentity(avatar);
    if (identities.has(identity)) return false;
    identities.add(identity);
    return true;
  });
}

function mediaIdentity(media: MessageResolvedMedia) {
  if (media.kind === 'remote') return `remote:${media.uri}`;
  if (media.kind === 'asset') return `asset:${String(media.resolved.source)}`;
  return 'unresolved';
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.messages.avatarFrame,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  onlineDot: {
    backgroundColor: liqiColors.status.online,
    borderColor: liqiComponentColors.messages.onlineFrame,
    borderRadius: 7,
    borderWidth: 2,
    bottom: 0,
    height: 14,
    position: 'absolute',
    right: 0,
    width: 14,
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
  },
});
