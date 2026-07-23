import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { appColors } from '@/shared/ui';

import type { MessageResolvedMedia } from '../model/chat-message';
import { MessageResolvedImage } from './MessageResolvedImage';
import { messagesUi } from '../ui/messages-ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type MessageAvatarStackProps = Readonly<{
  avatars?: readonly MessageResolvedMedia[];
  fallbackIcon?: IoniconName;
  fallbackLabel?: string;
  online?: boolean;
  primaryAvatar?: MessageResolvedMedia;
  size: number;
  testID?: string;
}>;

export function MessageAvatarStack({
  avatars = [],
  fallbackIcon = 'chatbubble-ellipses-outline',
  fallbackLabel,
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
  const fallbackInitials = fallbackLabel
    ? messageAvatarInitials(fallbackLabel)
    : undefined;
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
        <AvatarFrame
          fallbackIcon={fallbackIcon}
          fallbackInitials={fallbackInitials}
          fallbackTestID={testID ? `${testID}-fallback` : undefined}
          left={0}
          size={size}
        />
      )}
      {online ? <View style={styles.onlineDot} /> : null}
    </View>
  );
}

function AvatarFrame({
  avatar,
  fallbackIcon,
  fallbackInitials,
  fallbackTestID,
  left,
  size,
}: Readonly<{
  avatar?: MessageResolvedMedia;
  fallbackIcon?: IoniconName;
  fallbackInitials?: string;
  fallbackTestID?: string;
  left: number;
  size: number;
}>) {
  return (
    <LinearGradient
      colors={messagesUi.gradients.avatarRing}
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
        ) : fallbackInitials ? (
          <Text
            maxFontSizeMultiplier={1}
            style={[
              styles.fallbackInitials,
              { fontSize: Math.round(size * 0.32) },
            ]}
            testID={fallbackTestID ? `${fallbackTestID}-initials` : undefined}
          >
            {fallbackInitials}
          </Text>
        ) : (
          <Ionicons
            color={appColors.icon.primary}
            name={fallbackIcon ?? 'person-outline'}
            size={Math.round(size * 0.42)}
            testID={fallbackTestID ? `${fallbackTestID}-icon` : undefined}
          />
        )}
      </View>
    </LinearGradient>
  );
}

function messageAvatarInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0];
  if (!first) return undefined;
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : undefined;
  return `${first}${second ?? ''}`.toUpperCase();
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
  fallbackInitials: {
    color: appColors.text.primary,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  frame: {
    alignItems: 'center',
    backgroundColor: messagesUi.colors.avatarFrame,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  onlineDot: {
    backgroundColor: appColors.status.online,
    borderColor: messagesUi.colors.onlineFrame,
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
