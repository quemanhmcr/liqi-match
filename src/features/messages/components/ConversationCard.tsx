import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AppCard,
  appColors,
  appMotion,
  appOpacity,
  appRadii,
  appSpacing,
  appTypography,
} from '@/shared/ui';

import { MessageAvatarStack } from './MessageAvatarStack';
import type { ChatDeliveryStatus } from '../model/chat-message';
import type { MessageInboxConversationViewModel } from '../model/message-surface-presenters';
import { messagesChatAssets } from '../screens/messages-redesign-assets';
import { messagesUi, resolveMessageInboxCardVisual } from '../ui/messages-ui';

export type ConversationCardProps = Readonly<{
  compact: boolean;
  conversation: MessageInboxConversationViewModel;
  onPress: (conversationId: string) => void;
}>;

/** Inbox row for one canonical conversation summary. */
export function ConversationCard({
  compact,
  conversation,
  onPress,
}: ConversationCardProps) {
  const isUnread = conversation.attentionState === 'unread';
  const artwork = conversationArtwork(conversation);
  const cardVisual = resolveMessageInboxCardVisual(conversation.attentionState);
  const avatarSize = compact
    ? messagesUi.metrics.inbox.avatarCompact
    : messagesUi.metrics.inbox.avatar;
  const cardRadius = compact
    ? messagesUi.metrics.inbox.cardRadiusCompact
    : messagesUi.metrics.inbox.cardRadius;

  return (
    <Pressable
      accessibilityLabel={`Mở chat với ${conversation.name}`}
      accessibilityRole="button"
      onPress={() => onPress(conversation.id)}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <AppCard
        backgroundColor={messagesUi.colors.listCardSurface}
        backgroundSlot={
          artwork ? (
            <ImageBackground
              resizeMode="cover"
              source={artwork}
              style={StyleSheet.absoluteFill}
              testID={`messages-conversation-artwork-${conversation.id}`}
            >
              <LinearGradient
                colors={messagesUi.gradients.cardScrim}
                end={{ x: 1, y: 0.5 }}
                locations={[0, 0.42, 0.76, 1]}
                start={{ x: 0, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </ImageBackground>
          ) : undefined
        }
        borderColor={cardVisual.borderColor}
        borderOpacity={1}
        contentStyle={[
          styles.content,
          {
            minHeight: compact
              ? messagesUi.metrics.inbox.cardMinHeightCompact
              : messagesUi.metrics.inbox.cardMinHeight,
          },
        ]}
        density="list"
        emphasis={cardVisual.emphasis}
        frameGradient={cardVisual.frameGradient}
        radius={cardRadius}
        surfaceTone="high"
        testID={`messages-conversation-card-${conversation.id}`}
        withHighlight={false}
        withShadow={cardVisual.withShadow}
      >
        <MessageAvatarStack
          avatars={conversation.participantAvatars}
          fallbackIcon={conversation.icon}
          online={conversation.isOnline}
          primaryAvatar={conversation.avatar}
          size={avatarSize}
          testID={`messages-conversation-avatar-${conversation.id}`}
        />

        <View style={styles.body}>
          <View style={styles.titleLine}>
            <Text
              maxFontSizeMultiplier={1}
              numberOfLines={1}
              style={[styles.title, isUnread && styles.titleUnread]}
            >
              {conversation.name}
            </Text>
            <RelationshipAdornment conversation={conversation} />
          </View>
          <View
            accessibilityLabel={`Tin nhắn cuối: ${
              conversation.previewPrefix ? `${conversation.previewPrefix} ` : ''
            }${conversation.lastMessage}`}
            accessible
            style={styles.previewLine}
          >
            {conversation.previewPrefix ? (
              <Text
                style={[
                  styles.previewPrefix,
                  conversation.isDraft && styles.previewPrefixDraft,
                ]}
              >
                {conversation.previewPrefix}{' '}
              </Text>
            ) : null}
            <Text
              numberOfLines={1}
              style={[styles.previewText, isUnread && styles.previewTextUnread]}
            >
              {conversation.lastMessage}
            </Text>
          </View>
          <View style={styles.metaLine}>
            <ConversationMetaIcon conversation={conversation} />
            <Text numberOfLines={1} style={styles.metaText}>
              {conversation.isGroup && conversation.participantCount > 0
                ? `${conversation.participantCount} thành viên`
                : conversation.presenceLabel}
            </Text>
          </View>
        </View>

        <View style={styles.trailingColumn}>
          <Text style={[styles.time, isUnread && styles.timeUnread]}>
            {conversation.time}
          </Text>
          <ConversationAccessory conversation={conversation} />
        </View>
      </AppCard>
    </Pressable>
  );
}

function conversationArtwork(conversation: MessageInboxConversationViewModel) {
  switch (conversation.artworkVariant) {
    case 'love':
      return messagesChatAssets.inboxLove;
    case 'pair':
      return messagesChatAssets.inboxPair;
    case 'party':
      return messagesChatAssets.inboxParty;
    case 'rank':
      return messagesChatAssets.inboxRank;
    default:
      return undefined;
  }
}

function RelationshipAdornment({
  conversation,
}: Readonly<{ conversation: MessageInboxConversationViewModel }>) {
  const icon = relationshipIcon(conversation);
  if (!icon) return null;

  return (
    <Ionicons
      accessibilityLabel={conversation.relationshipLabel}
      color={relationshipColor(conversation)}
      name={icon}
      size={18}
      testID={`messages-conversation-relationship-icon-${conversation.id}`}
    />
  );
}

function relationshipIcon(
  conversation: MessageInboxConversationViewModel,
): keyof typeof Ionicons.glyphMap | undefined {
  if (conversation.relationship === 'team') return 'trophy';
  if (conversation.relationship === 'soulmate') return 'heart';
  if (conversation.sourceType === 'play_session') return 'game-controller';
  if (conversation.kind === 'system') return 'sparkles';
  return undefined;
}

function relationshipColor(conversation: MessageInboxConversationViewModel) {
  if (conversation.relationship === 'team') return appColors.accent.amber;
  if (conversation.relationship === 'soulmate') return appColors.accent.pink;
  return appColors.accent.purple;
}

function ConversationMetaIcon({
  conversation,
}: Readonly<{ conversation: MessageInboxConversationViewModel }>) {
  if (conversation.isGroup) {
    return (
      <Ionicons
        accessible={false}
        color={appColors.accent.purple}
        name="people"
        size={14}
        testID={`messages-conversation-group-indicator-${conversation.id}`}
      />
    );
  }
  if (!conversation.isOnline) return null;

  return (
    <Ionicons
      accessible={false}
      color={appColors.status.online}
      name="ellipse"
      size={8}
      testID={`messages-conversation-online-indicator-${conversation.id}`}
    />
  );
}

function ConversationAccessory({
  conversation,
}: Readonly<{
  conversation: MessageInboxConversationViewModel;
}>) {
  switch (conversation.attentionState) {
    case 'failed':
    case 'queued':
    case 'sending':
      return <DeliveryAccessory status={conversation.attentionState} />;
    case 'draft':
      return (
        <Ionicons
          accessibilityLabel="Có bản nháp"
          color={appColors.status.warning}
          name="create-outline"
          size={18}
        />
      );
    case 'unread':
      return conversation.unreadCount ? (
        <View
          accessibilityLabel={`${conversation.unreadCount} tin nhắn chưa đọc`}
          accessible
          style={styles.unreadBadge}
        >
          <Text style={styles.unreadText}>{conversation.unreadCount}</Text>
        </View>
      ) : (
        <View style={styles.trailingSpacer} />
      );
    case 'normal':
      break;
    default: {
      const unsupportedState: never = conversation.attentionState;
      throw new Error(
        `Unsupported message inbox attention state: ${String(unsupportedState)}`,
      );
    }
  }

  if (conversation.latestDirection === 'outgoing') {
    return <DeliveryAccessory status={conversation.latestDeliveryStatus} />;
  }
  if (conversation.isMuted) {
    return (
      <Ionicons
        accessibilityLabel="Cuộc trò chuyện đã tắt thông báo"
        color={appColors.text.muted}
        name="notifications-off-outline"
        size={18}
      />
    );
  }
  if (conversation.isPinned) {
    return (
      <Ionicons
        accessibilityLabel="Cuộc trò chuyện đã ghim"
        color={appColors.accent.purpleSoft}
        name="bookmark"
        size={17}
      />
    );
  }
  return <View style={styles.trailingSpacer} />;
}

function DeliveryAccessory({ status }: { status?: ChatDeliveryStatus }) {
  if (status === 'failed') {
    return (
      <Ionicons
        accessibilityLabel="Tin nhắn gửi thất bại"
        color={appColors.status.danger}
        name="alert-circle-outline"
        size={18}
      />
    );
  }
  if (status === 'sending') {
    return (
      <ActivityIndicator
        accessibilityLabel="Tin nhắn đang gửi"
        color={appColors.text.muted}
        size="small"
      />
    );
  }
  if (status === 'queued') {
    return (
      <Ionicons
        accessibilityLabel="Tin nhắn đang chờ mạng"
        color={appColors.status.warning}
        name="cloud-offline-outline"
        size={18}
      />
    );
  }
  return (
    <Ionicons
      accessibilityLabel={
        status === 'read' ? 'Tin nhắn đã đọc' : 'Tin nhắn đã gửi'
      }
      color={
        status === 'read'
          ? messagesUi.colors.deliveryRead
          : appColors.text.muted
      }
      name={status === 'sent' ? 'checkmark' : 'checkmark-done'}
      size={17}
    />
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: appSpacing.xs, minWidth: 0 },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.lg,
    paddingHorizontal: appSpacing.xl,
    paddingVertical: appSpacing.md,
  },
  metaLine: { alignItems: 'center', flexDirection: 'row', gap: appSpacing.sm },
  metaText: {
    ...appTypography.caption,
    color: appColors.text.tertiary,
    flex: 1,
    fontWeight: '600',
  },
  pressed: {
    opacity: appOpacity.pressed,
    transform: [{ scale: appMotion.subtlePressScale }],
  },
  previewLine: { alignItems: 'baseline', flexDirection: 'row', minWidth: 0 },
  previewPrefix: {
    ...appTypography.bodyCompact,
    color: appColors.text.secondary,
    fontWeight: '700',
  },
  previewPrefixDraft: { color: appColors.status.warning },
  previewText: {
    ...appTypography.bodyCompact,
    color: appColors.text.tertiary,
    flex: 1,
  },
  previewTextUnread: { color: appColors.text.secondary, fontWeight: '600' },
  time: {
    ...appTypography.caption,
    color: messagesUi.colors.timestamp,
    fontWeight: '600',
  },
  timeUnread: { color: appColors.text.primary },
  title: {
    ...appTypography.cardTitle,
    color: appColors.text.secondary,
    flexShrink: 1,
  },
  titleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.sm,
    minWidth: 0,
  },
  titleUnread: { color: appColors.text.primary, fontWeight: '800' },
  trailingColumn: {
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    minWidth: 42,
    paddingVertical: appSpacing.xs,
  },
  trailingSpacer: { height: 18, width: 18 },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: messagesUi.colors.unread,
    borderColor: appColors.border.surfaceHighlight,
    borderRadius: appRadii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 24,
    paddingHorizontal: appSpacing.sm,
    paddingVertical: appSpacing.xs,
  },
  unreadText: {
    ...appTypography.caption,
    color: appColors.text.onAccent,
    fontWeight: '900',
  },
});
