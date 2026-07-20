import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  LiqiCard,
  LiqiChip,
  LiqiIdentityHeader,
  LiqiOrbButton,
} from '@/shared/components/liqi';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';
import {
  isCompactLiqiViewport,
  liqiColors,
  liqiComponentColors,
  liqiComponentGradients,
  liqiComponents,
} from '@/shared/theme/liqi-design-system';

import { ChatMediaViewer } from '../components/ChatMediaViewer';
import { MessageAvatarStack } from '../components/MessageAvatarStack';
import { MessageResolvedImage } from '../components/MessageResolvedImage';
import { calculateChatMediaPreviewMetrics } from '../model/chat-media-layout';
import {
  messageResolvedMediaSource,
  messageResolvedMediaState,
} from '../model/chat-message';
import type {
  ChatMessage,
  ChatThread,
  IncomingMediaMessage,
  MessageResolvedMedia,
  OutgoingChatMessage,
  OutgoingMediaMessage,
  OutgoingTextMessage,
} from '../model/chat-message';
import {
  formatChatClock,
  formatChatTimelineLabel,
} from '../model/chat-timeline';
import type { MessageConversationDetail } from '../contracts/messages-contracts';
import type { ChatNetworkState } from '../services/chat-message-transport';
import { selectionImpact } from './chat-conversation-haptics';
import { chatConversationStyles as styles } from './chat-conversation.styles';
import type { ConversationLoadState } from './chat-conversation.types';
import { messagesChatAssets } from './messages-redesign-assets';

function isEmojiOnlyMessage(text: string) {
  const value = text.trim();
  return value.length > 0 && value.length <= 8 && !/[A-Za-zÀ-ỹ0-9]/.test(value);
}

export function ChatNetworkBanner({
  networkState,
  queuedMessageCount,
}: {
  networkState: ChatNetworkState;
  queuedMessageCount: number;
}) {
  if (networkState === 'online' && queuedMessageCount === 0) return null;

  const offline = networkState === 'offline';
  const label = offline
    ? queuedMessageCount > 0
      ? `Ngoại tuyến · ${queuedMessageCount} tin sẽ tự gửi khi có mạng`
      : 'Ngoại tuyến · Tin mới sẽ được xếp hàng'
    : `Đang gửi lại ${queuedMessageCount} tin nhắn`;

  return (
    <View
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      accessible
      style={styles.networkBanner}
    >
      <Ionicons
        color={
          offline
            ? liqiComponentColors.messages.chat.networkOfflineIcon
            : liqiComponentColors.messages.chat.networkSyncIcon
        }
        name={offline ? 'cloud-offline-outline' : 'sync-outline'}
        size={14}
      />
      <Text style={styles.networkBannerText}>{label}</Text>
    </View>
  );
}

export function ConversationStateScreen({
  onRetry,
  state,
}: {
  onRetry?: () => void;
  state: ConversationLoadState;
}) {
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate(appRoutes.main.messages);
  };
  const title =
    state === 'loading'
      ? 'Đang tải cuộc trò chuyện…'
      : state === 'not-found'
        ? 'Không tìm thấy cuộc trò chuyện'
        : 'Không thể tải cuộc trò chuyện';
  const description =
    state === 'not-found'
      ? 'Liên kết có thể đã hết hạn hoặc cuộc trò chuyện không còn tồn tại.'
      : state === 'unavailable'
        ? 'Vui lòng quay lại danh sách và thử lại sau.'
        : 'Đang chuẩn bị lịch sử tin nhắn.';

  return (
    <LiqiScreen scroll={false} withBottomNavPadding={false} withHeader={false}>
      <View style={styles.conversationStateHeader}>
        <LiqiOrbButton
          accessibilityLabel="Quay lại danh sách tin nhắn"
          surfaceTone="low"
          emphasis="low"
          onPress={goBack}
          size={34}
        >
          <Ionicons
            color={liqiComponentColors.messages.chat.avatarFallbackIcon}
            name="chevron-back"
            size={18}
          />
        </LiqiOrbButton>
      </View>
      <View accessibilityLabel={title} style={styles.conversationStateBody}>
        <Ionicons
          color={liqiComponentColors.messages.chat.stateIcon}
          name={state === 'loading' ? 'chatbubble-ellipses' : 'alert-circle'}
          size={34}
        />
        <Text style={styles.conversationStateTitle}>{title}</Text>
        <Text style={styles.conversationStateDescription}>{description}</Text>
        {onRetry ? (
          <Pressable
            accessibilityLabel="Thử tải lại cuộc trò chuyện"
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.conversationStateRetry,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={liqiComponentColors.messages.chat.stateRetryText}
              name="refresh"
              size={15}
            />
            <Text style={styles.conversationStateRetryText}>Thử lại</Text>
          </Pressable>
        ) : null}
      </View>
    </LiqiScreen>
  );
}

export function ChatTimeGap({ createdAt }: { createdAt: string }) {
  const label = formatChatClock(createdAt);
  if (!label) return null;

  return (
    <View
      accessibilityLabel={`Cách quãng một giờ, tiếp tục lúc ${label}`}
      accessible
      style={styles.timeGap}
    >
      <View style={styles.timeGapDot} />
      <Text style={styles.timeGapText}>{label}</Text>
      <View style={styles.timeGapDot} />
    </View>
  );
}

export function ChatUnreadMarker() {
  return (
    <View
      accessibilityLabel="Tin nhắn chưa đọc"
      accessible
      style={styles.unreadMarker}
    >
      <View style={styles.unreadMarkerRule} />
      <Text style={styles.unreadMarkerText}>Tin nhắn chưa đọc</Text>
      <View style={styles.unreadMarkerRule} />
    </View>
  );
}

export function ChatTimelineSeparator({ createdAt }: { createdAt: string }) {
  const label = formatChatTimelineLabel(createdAt);
  if (!label) return null;

  return (
    <View
      accessibilityLabel={`Mốc thời gian ${label}`}
      accessible
      style={styles.timelineSeparator}
    >
      <View style={styles.timelineRule} />
      <Text style={styles.timelineLabel}>{label}</Text>
      <View style={styles.timelineRule} />
    </View>
  );
}

export function ConversationSourceBanner({
  source,
}: {
  source?: MessageConversationDetail['source'];
}) {
  if (source?.type !== 'play_session') return null;
  return (
    <Pressable
      accessibilityLabel="Mở chi tiết phiên chơi"
      accessibilityRole="button"
      onPress={() => {
        selectionImpact();
        router.push(appRoutes.sessions.detail(source.id));
      }}
      style={({ pressed }) => [
        styles.sourceBannerPressable,
        pressed && styles.pressed,
      ]}
    >
      <LiqiCard
        backgroundColor={liqiComponentColors.messages.sourceBannerSurface}
        backgroundSlot={
          <ImageBackground
            resizeMode="cover"
            source={messagesChatAssets.chatEventBanner}
            style={StyleSheet.absoluteFill}
          >
            <LinearGradient
              colors={liqiComponentGradients.messages.eventBannerScrim}
              end={{ x: 1, y: 0.5 }}
              locations={[0, 0.44, 1]}
              start={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </ImageBackground>
        }
        borderColor={liqiComponentColors.messages.sourceBannerStroke}
        contentStyle={styles.sourceBanner}
        density="list"
        emphasis="low"
        radius={liqiComponents.messages.chat.eventBannerRadius}
        surfaceTone="high"
        withHighlight={false}
        withShadow={false}
      >
        <View style={styles.sourceBannerIcon}>
          <Ionicons
            color={liqiComponentColors.messages.contextIcon}
            name="game-controller"
            size={19}
          />
        </View>
        <View style={styles.sourceBannerCopy}>
          <Text style={styles.sourceBannerEyebrow}>PHIÊN CHƠI</Text>
          <Text numberOfLines={1} style={styles.sourceBannerTitle}>
            Phiên chơi của nhóm ✨
          </Text>
          <Text numberOfLines={1} style={styles.sourceBannerText}>
            Trò chuyện của cả nhóm · Xem lịch và trạng thái
          </Text>
        </View>
        <Ionicons
          color={liqiColors.accent.purpleIcon}
          name="chevron-forward"
          size={21}
        />
      </LiqiCard>
    </Pressable>
  );
}

export function ChatHeader({
  onOpenOptions,
  thread,
}: {
  onOpenOptions: () => void;
  thread: ChatThread;
}) {
  const { width } = useWindowDimensions();
  const compact = isCompactLiqiViewport(width);
  const avatarSize = compact
    ? liqiComponents.messages.chat.headerAvatarCompact
    : liqiComponents.messages.chat.headerAvatar;
  const goBack = () => {
    selectionImpact();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate(appRoutes.main.messages);
  };
  const participantSuffix =
    thread.participantCount && thread.participantCount > 2
      ? ` · ${thread.participantCount} thành viên`
      : '';

  return (
    <LiqiIdentityHeader
      actions={[
        {
          accessibilityLabel: `Tuỳ chọn cuộc trò chuyện với ${thread.name}`,
          icon: 'ellipsis-horizontal',
          onPress: onOpenOptions,
        },
      ]}
      avatar={
        <MessageAvatarStack
          avatars={thread.participantAvatars}
          fallbackIcon={thread.icon}
          primaryAvatar={thread.avatar}
          size={avatarSize}
        />
      }
      compact={compact}
      leadingAction={{
        accessibilityLabel: 'Quay lại danh sách tin nhắn',
        icon: 'arrow-back',
        onPress: goBack,
      }}
      online={thread.isOnline}
      subtitle={`${thread.status}${participantSuffix}`}
      testID="chat-identity-header"
      title={thread.name}
      titleAccessory={
        thread.kind !== 'Bạn bè' ? (
          <LiqiChip
            density="compact"
            selected
            style={styles.relationshipTag}
            textStyle={styles.relationshipText}
            variant="selected"
            withSheen={false}
          >
            {thread.kind === 'Hệ thống' ? 'Thông báo' : thread.kind}
          </LiqiChip>
        ) : undefined
      }
    />
  );
}

export function ChatMessageRow({
  message,
  onCancelMedia,
  onRemoveMedia,
  onRetry,
  showAvatar,
  thread,
}: {
  message: ChatMessage;
  onCancelMedia: (message: OutgoingMediaMessage) => void;
  onRemoveMedia: (message: OutgoingMediaMessage) => void;
  onRetry: (message: OutgoingChatMessage) => void;
  showAvatar: boolean;
  thread: ChatThread;
}) {
  if (message.kind === 'typing') {
    return <TypingMessage showAvatar={showAvatar} thread={thread} />;
  }

  if (message.kind === 'team-invite') {
    return (
      <TeamInviteMessage
        message={message}
        showAvatar={showAvatar}
        thread={thread}
      />
    );
  }

  if (message.kind === 'build-share') {
    return (
      <BuildShareMessage
        message={message}
        showAvatar={showAvatar}
        thread={thread}
      />
    );
  }

  if (message.direction === 'outgoing') {
    return message.kind === 'media' ? (
      <OutgoingMediaMessageBubble
        message={message}
        onCancel={onCancelMedia}
        onRemove={onRemoveMedia}
        onRetry={onRetry}
      />
    ) : (
      <OutgoingMessage message={message} onRetry={onRetry} />
    );
  }

  if (message.kind === 'media') {
    return (
      <IncomingMediaMessageBubble
        message={message}
        showAvatar={showAvatar}
        thread={thread}
      />
    );
  }

  return (
    <IncomingMessage
      message={message}
      showAvatar={showAvatar}
      thread={thread}
    />
  );
}

function IncomingMessage({
  message,
  showAvatar,
  thread,
}: {
  message: Extract<ChatMessage, { kind: 'text' }>;
  showAvatar: boolean;
  thread: ChatThread;
}) {
  return (
    <View style={styles.incomingBlock}>
      <View style={styles.incomingRow}>
        <IncomingAvatar show={showAvatar} thread={thread} />
        <View style={styles.incomingBubble}>
          <Text style={styles.messageText}>{message.text}</Text>
        </View>
      </View>
      <Text style={styles.incomingTime}>
        {formatChatClock(message.createdAt)}
      </Text>
    </View>
  );
}

function OutgoingMessage({
  message,
  onRetry,
}: {
  message: OutgoingTextMessage;
  onRetry: (message: OutgoingChatMessage) => void;
}) {
  const emojiOnly = isEmojiOnlyMessage(message.text);

  return (
    <View style={styles.outgoingRow}>
      <LinearGradient
        colors={liqiComponentGradients.messages.outgoingBubble}
        end={{ x: 1, y: 0.9 }}
        locations={[0, 0.56, 1]}
        start={{ x: 0, y: 0.1 }}
        style={[
          styles.outgoingBubble,
          emojiOnly && styles.outgoingEmojiBubble,
          message.deliveryStatus === 'failed' && styles.outgoingBubbleFailed,
        ]}
      >
        {emojiOnly ? (
          <View style={styles.outgoingEmojiRow}>
            <Text style={styles.emojiMessageText}>{message.text}</Text>
            <MessageDeliveryMeta compact message={message} onRetry={onRetry} />
          </View>
        ) : (
          <>
            <Text style={styles.messageText}>{message.text}</Text>
            <MessageDeliveryMeta message={message} onRetry={onRetry} />
          </>
        )}
      </LinearGradient>
    </View>
  );
}

function IncomingMediaMessageBubble({
  message,
  showAvatar,
  thread,
}: {
  message: IncomingMediaMessage;
  showAvatar: boolean;
  thread: ChatThread;
}) {
  const viewport = useWindowDimensions();
  const [viewerOpen, setViewerOpen] = useState(false);
  const resolvedMedia = message.attachment.resolvedMedia;
  const resolvedSource = resolvedMedia
    ? messageResolvedMediaSource(resolvedMedia)
    : undefined;
  const resolvedState = resolvedMedia
    ? messageResolvedMediaState(resolvedMedia)
    : 'ready';
  const canOpenViewer = Boolean(message.attachment.uri);
  const [imageLoading, setImageLoading] = useState(
    message.attachment.mediaType === 'image' &&
      Boolean(resolvedSource ?? message.attachment.uri),
  );
  const preview = useMemo(
    () =>
      calculateChatMediaPreviewMetrics({
        mediaHeight: message.attachment.height,
        mediaWidth: message.attachment.width,
        viewportHeight: viewport.height,
        viewportWidth: viewport.width,
      }),
    [
      message.attachment.height,
      message.attachment.width,
      viewport.height,
      viewport.width,
    ],
  );
  const isVideo = message.attachment.mediaType === 'video';
  const mediaLabel = `${isVideo ? 'Video' : 'Ảnh'} nhận được${
    message.caption ? `, chú thích: ${message.caption}` : ''
  }, lúc ${formatChatClock(message.createdAt)}`;

  return (
    <View style={styles.incomingBlock}>
      <View style={styles.incomingRow}>
        <IncomingAvatar show={showAvatar} thread={thread} />
        <View style={[styles.mediaMessageShell, { width: preview.width }]}>
          <Pressable
            accessibilityLabel={mediaLabel}
            accessibilityRole="imagebutton"
            disabled={!canOpenViewer}
            onPress={() => {
              if (canOpenViewer) setViewerOpen(true);
            }}
            style={({ pressed }) => [
              styles.mediaPreview,
              { height: preview.height, width: preview.width },
              pressed && styles.mediaPreviewPressed,
            ]}
          >
            {message.attachment.thumbnailUri ? (
              <Image
                blurRadius={isVideo ? 0 : 5}
                resizeMode="cover"
                source={{ uri: message.attachment.thumbnailUri }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            {isVideo ? (
              <View style={styles.mediaVideoPreview}>
                <Ionicons
                  color={liqiComponentColors.messages.chat.mediaPlayIcon}
                  name="play-circle"
                  size={42}
                />
                {message.attachment.durationMs ? (
                  <Text style={styles.mediaDuration}>
                    {formatMediaDuration(message.attachment.durationMs)}
                  </Text>
                ) : null}
              </View>
            ) : resolvedMedia ? (
              <MessageResolvedImage
                accessibilityIgnoresInvertColors
                fadeDuration={120}
                media={resolvedMedia}
                onLoadEnd={() => setImageLoading(false)}
                onLoadStart={() => setImageLoading(true)}
                resizeMode={preview.resizeMode}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <Image
                accessibilityIgnoresInvertColors
                fadeDuration={120}
                onLoadEnd={() => setImageLoading(false)}
                onLoadStart={() => setImageLoading(true)}
                resizeMode={preview.resizeMode}
                source={{ uri: message.attachment.uri }}
                style={StyleSheet.absoluteFill}
              />
            )}
            {resolvedState !== 'ready' && !resolvedSource ? (
              <View
                accessibilityLabel={`Media ${resolvedState}`}
                pointerEvents="none"
                style={styles.mediaStateOverlay}
              >
                <Ionicons
                  color={liqiComponentColors.messages.chat.mediaUnavailableIcon}
                  name={
                    resolvedState === 'offline-unavailable'
                      ? 'cloud-offline-outline'
                      : 'image-outline'
                  }
                  size={24}
                />
                <Text style={styles.mediaStateTitle}>
                  {resolvedState === 'offline-unavailable'
                    ? 'Media chưa có khi offline'
                    : 'Media không khả dụng'}
                </Text>
              </View>
            ) : null}
            {imageLoading &&
            !isVideo &&
            Boolean(resolvedSource ?? message.attachment.uri) ? (
              <View pointerEvents="none" style={styles.mediaLoadingOverlay}>
                <ActivityIndicator
                  color={liqiComponentColors.messages.chat.mediaLoadingIcon}
                  size="small"
                />
              </View>
            ) : null}
          </Pressable>
          {message.caption ? (
            <View style={styles.mediaCaptionSurface}>
              <Text style={styles.mediaCaptionText}>{message.caption}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={styles.incomingTime}>
        {formatChatClock(message.createdAt)}
      </Text>
      {viewerOpen && canOpenViewer ? (
        <ChatMediaViewer
          attachment={message.attachment}
          caption={message.caption}
          createdAt={message.createdAt}
          onClose={() => setViewerOpen(false)}
          visible
        />
      ) : null}
    </View>
  );
}

function OutgoingMediaMessageBubble({
  message,
  onCancel,
  onRemove,
  onRetry,
}: {
  message: OutgoingMediaMessage;
  onCancel: (message: OutgoingMediaMessage) => void;
  onRemove: (message: OutgoingMediaMessage) => void;
  onRetry: (message: OutgoingChatMessage) => void;
}) {
  const viewport = useWindowDimensions();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(
    message.attachment.mediaType === 'image',
  );
  const preview = useMemo(
    () =>
      calculateChatMediaPreviewMetrics({
        mediaHeight: message.attachment.height,
        mediaWidth: message.attachment.width,
        viewportHeight: viewport.height,
        viewportWidth: viewport.width,
      }),
    [
      message.attachment.height,
      message.attachment.width,
      viewport.height,
      viewport.width,
    ],
  );
  const isVideo = message.attachment.mediaType === 'video';
  const hasCaption = Boolean(message.caption);
  const mediaLabel = `${isVideo ? 'Video' : 'Ảnh'} do bạn gửi${
    message.caption ? `, chú thích: ${message.caption}` : ''
  }, lúc ${formatChatClock(message.createdAt)}`;

  return (
    <View style={styles.outgoingRow}>
      <View
        style={[
          styles.mediaMessageShell,
          { width: preview.width },
          message.deliveryStatus === 'failed' && styles.mediaMessageShellFailed,
        ]}
      >
        <Pressable
          accessibilityLabel={mediaLabel}
          accessibilityRole="imagebutton"
          onPress={() => setViewerOpen(true)}
          style={({ pressed }) => [
            styles.mediaPreview,
            { height: preview.height, width: preview.width },
            pressed && styles.mediaPreviewPressed,
          ]}
        >
          {message.attachment.thumbnailUri ? (
            <Image
              blurRadius={5}
              resizeMode="cover"
              source={{ uri: message.attachment.thumbnailUri }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {isVideo ? (
            <View style={styles.mediaVideoPreview}>
              <Ionicons
                color={liqiComponentColors.messages.chat.mediaPlayIcon}
                name="play-circle"
                size={42}
              />
              {message.attachment.durationMs ? (
                <Text style={styles.mediaDuration}>
                  {formatMediaDuration(message.attachment.durationMs)}
                </Text>
              ) : null}
            </View>
          ) : (
            <Image
              accessibilityIgnoresInvertColors
              fadeDuration={120}
              onLoadEnd={() => setImageLoading(false)}
              onLoadStart={() => setImageLoading(true)}
              resizeMode={preview.resizeMode}
              source={{ uri: message.attachment.uri }}
              style={StyleSheet.absoluteFill}
            />
          )}

          {imageLoading && !isVideo ? (
            <View pointerEvents="none" style={styles.mediaLoadingOverlay}>
              <ActivityIndicator
                color={liqiComponentColors.messages.chat.mediaLoadingIcon}
                size="small"
              />
            </View>
          ) : null}

          {message.deliveryStatus === 'sending' ? (
            <MediaUploadingOverlay message={message} onCancel={onCancel} />
          ) : null}
          {message.deliveryStatus === 'queued' ? (
            <View style={styles.mediaStateOverlay}>
              <Ionicons
                color={liqiComponentColors.messages.chat.mediaQueuedIcon}
                name="cloud-offline-outline"
                size={21}
              />
              <Text style={styles.mediaStateTitle}>Đang chờ mạng</Text>
              <Text style={styles.mediaStateText}>
                Ảnh sẽ tự gửi khi kết nối trở lại.
              </Text>
            </View>
          ) : null}
          {message.deliveryStatus === 'failed' ? (
            <MediaFailedOverlay
              message={message}
              onRemove={onRemove}
              onRetry={onRetry}
            />
          ) : null}

          {!hasCaption &&
          message.deliveryStatus !== 'sending' &&
          message.deliveryStatus !== 'failed' ? (
            <View style={styles.mediaMetaOverlay}>
              <MediaDeliveryMeta message={message} />
            </View>
          ) : null}
        </Pressable>

        {hasCaption ? (
          <View style={styles.mediaCaptionSurface}>
            <Text style={styles.mediaCaptionText}>{message.caption}</Text>
            <MediaDeliveryMeta message={message} />
          </View>
        ) : null}
      </View>

      {viewerOpen ? (
        <ChatMediaViewer
          attachment={message.attachment}
          caption={message.caption}
          createdAt={message.createdAt}
          onClose={() => setViewerOpen(false)}
          visible
        />
      ) : null}
    </View>
  );
}

function formatMediaDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function MediaDeliveryMeta({ message }: { message: OutgoingMediaMessage }) {
  const visual = deliveryVisual(message);
  return (
    <View
      accessibilityLabel={`${formatChatClock(message.createdAt)}, ${visual.label}`}
      accessible
      style={styles.mediaDeliveryMeta}
    >
      <Text style={styles.mediaDeliveryTime}>
        {formatChatClock(message.createdAt)}
      </Text>
      <Ionicons color={visual.color} name={visual.icon} size={13} />
    </View>
  );
}

function MediaUploadingOverlay({
  message,
  onCancel,
}: {
  message: OutgoingMediaMessage;
  onCancel: (message: OutgoingMediaMessage) => void;
}) {
  const progress = Math.round(
    Math.min(1, Math.max(0, message.transferProgress ?? 0)) * 100,
  );
  return (
    <View style={styles.mediaStateOverlay}>
      <ActivityIndicator color={liqiColors.text.onAccent} size="small" />
      <Text style={styles.mediaStateTitle}>Đang tải lên {progress}%</Text>
      <View style={styles.mediaProgressTrack}>
        <View style={[styles.mediaProgressValue, { width: `${progress}%` }]} />
      </View>
      <Pressable
        accessibilityLabel="Hủy gửi media"
        accessibilityRole="button"
        onPress={(event) => {
          event.stopPropagation();
          onCancel(message);
        }}
        style={({ pressed }) => [
          styles.mediaOverlayAction,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons color={liqiColors.text.onAccent} name="close" size={14} />
        <Text style={styles.mediaOverlayActionText}>Hủy</Text>
      </Pressable>
    </View>
  );
}

function MediaFailedOverlay({
  message,
  onRemove,
  onRetry,
}: {
  message: OutgoingMediaMessage;
  onRemove: (message: OutgoingMediaMessage) => void;
  onRetry: (message: OutgoingChatMessage) => void;
}) {
  const wasCancelled = message.mediaFailureReason === 'cancelled';
  return (
    <View style={[styles.mediaStateOverlay, styles.mediaFailedOverlay]}>
      <Ionicons
        color={liqiComponentColors.messages.chat.mediaFailedIcon}
        name={wasCancelled ? 'close-circle-outline' : 'alert-circle-outline'}
        size={22}
      />
      <Text style={styles.mediaStateTitle}>
        {wasCancelled ? 'Đã hủy tải lên' : 'Không thể gửi'}
      </Text>
      <View style={styles.mediaFailedActions}>
        <Pressable
          accessibilityLabel="Thử lại media"
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            onRetry(message);
          }}
          style={({ pressed }) => [
            styles.mediaOverlayAction,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons color={liqiColors.text.onAccent} name="refresh" size={14} />
          <Text style={styles.mediaOverlayActionText}>Thử lại</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Xóa media khỏi cuộc trò chuyện"
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            onRemove(message);
          }}
          style={({ pressed }) => [
            styles.mediaOverlayAction,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            color={liqiColors.text.onAccent}
            name="trash-outline"
            size={14}
          />
          <Text style={styles.mediaOverlayActionText}>Xóa</Text>
        </Pressable>
      </View>
    </View>
  );
}

type DeliveryVisual = {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

function deliveryVisual(message: OutgoingChatMessage): DeliveryVisual {
  switch (message.deliveryStatus) {
    case 'queued':
      return {
        color: liqiComponentColors.messages.chat.deliveryQueued,
        icon: 'cloud-offline-outline',
        label: 'Đang chờ mạng',
      };
    case 'sending':
      return {
        color: liqiComponentColors.messages.chat.mutedMeta,
        icon: 'time-outline',
        label: 'Đang gửi',
      };
    case 'sent':
      return {
        color: liqiComponentColors.messages.chat.deliverySent,
        icon: 'checkmark',
        label: 'Đã gửi',
      };
    case 'delivered':
      return {
        color: liqiComponentColors.messages.chat.deliveryDelivered,
        icon: 'checkmark-done',
        label: 'Đã nhận',
      };
    case 'read':
      return {
        color: liqiComponentColors.messages.chat.deliveryRead,
        icon: 'checkmark-done',
        label: 'Đã đọc',
      };
    case 'failed':
      return {
        color: liqiComponentColors.messages.chat.deliveryFailed,
        icon: 'alert-circle-outline',
        label: 'Không gửi được',
      };
  }
}

function MessageDeliveryMeta({
  compact = false,
  message,
  onRetry,
}: {
  compact?: boolean;
  message: OutgoingChatMessage;
  onRetry: (message: OutgoingChatMessage) => void;
}) {
  const visual = deliveryVisual(message);

  if (message.deliveryStatus === 'failed') {
    return (
      <View style={[styles.outgoingMeta, styles.outgoingMetaFailed]}>
        <View
          accessibilityLabel={visual.label}
          accessible
          style={styles.deliveryState}
        >
          <Ionicons color={visual.color} name={visual.icon} size={14} />
          <Text style={styles.outgoingFailureText}>{visual.label}</Text>
        </View>
        <Pressable
          accessibilityLabel="Gửi lại tin nhắn"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onRetry(message)}
          style={({ pressed }) => [
            styles.retryAction,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            color={liqiComponentColors.messages.chat.retryText}
            name="refresh"
            size={13}
          />
          <Text style={styles.retryActionText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.outgoingMeta, compact && styles.outgoingMetaCompact]}>
      <Text style={styles.outgoingTime}>
        {formatChatClock(message.createdAt)}
      </Text>
      <View accessibilityLabel={visual.label} accessible>
        <Ionicons color={visual.color} name={visual.icon} size={14} />
      </View>
    </View>
  );
}

function TeamInviteMessage({
  message,
  showAvatar,
  thread,
}: {
  message: Extract<ChatMessage, { kind: 'team-invite' }>;
  showAvatar: boolean;
  thread: ChatThread;
}) {
  return (
    <View style={styles.incomingBlock}>
      <View style={styles.incomingRow}>
        <IncomingAvatar show={showAvatar} thread={thread} />
        <View style={styles.teamInviteStack}>
          <View style={styles.incomingBubble}>
            <Text style={styles.messageText}>{message.text}</Text>
          </View>
          <TeamInviteCard message={message} />
        </View>
      </View>
      <Text style={styles.incomingTime}>
        {formatChatClock(message.createdAt)}
      </Text>
    </View>
  );
}

function TeamInviteCard({
  message,
}: {
  message: Extract<ChatMessage, { kind: 'team-invite' }>;
}) {
  return (
    <View
      accessibilityLabel={`Lời mời Set ${message.teamName}`}
      accessible
      style={styles.teamCardPressable}
    >
      <LinearGradient
        colors={liqiComponentGradients.messages.chat.teamInvite}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.teamCard}
        testID="team-invite-card"
      >
        <View pointerEvents="none" style={styles.teamGlow} />
        <View style={styles.teamTopRow}>
          <View style={styles.teamEmblemFrame}>
            <MessageResolvedImage
              media={message.artwork}
              style={styles.teamEmblem}
            />
          </View>
          <View style={styles.teamCopy}>
            <View style={styles.teamTitleRow}>
              <Text numberOfLines={1} style={styles.teamName}>
                {message.teamName}
              </Text>
              <View style={styles.teamCountBadge}>
                <Text style={styles.teamCountText}>{message.teamSize}</Text>
              </View>
            </View>
            <Text numberOfLines={1} style={styles.teamMode}>
              {message.mode}
            </Text>
            <View style={styles.teamNeedRow}>
              <View style={styles.teamNeedChip}>
                <Ionicons
                  color={liqiComponentColors.messages.chat.teamNeedIcon}
                  name="flash-outline"
                  size={11}
                />
                <Text style={styles.teamNeedText}>
                  Cần {message.missingRole}
                </Text>
              </View>
              <Text numberOfLines={1} style={styles.teamMembers}>
                {message.members.join(' · ')}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.teamAction}>
          <LinearGradient
            colors={liqiComponentGradients.messages.chat.teamAction}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.teamActionText}>Lời mời Set</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function BuildShareMessage({
  message,
  showAvatar,
  thread,
}: {
  message: Extract<ChatMessage, { kind: 'build-share' }>;
  showAvatar: boolean;
  thread: ChatThread;
}) {
  return (
    <View style={styles.incomingBlock}>
      <View style={styles.incomingRow}>
        <IncomingAvatar show={showAvatar} thread={thread} />
        <View style={[styles.incomingBubble, styles.buildShareBubble]}>
          <Text style={styles.messageText}>{message.text}</Text>
          <View
            accessibilityLabel={`Build ${message.heroName}`}
            accessible
            style={styles.buildCardPressable}
          >
            <LinearGradient
              colors={liqiComponentGradients.messages.chat.buildCard}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.buildCard}
            >
              <View style={styles.buildPreviewFrame}>
                <MessageResolvedImage
                  media={message.preview}
                  style={styles.buildPreview}
                />
                <LinearGradient
                  colors={liqiComponentGradients.messages.chat.buildPreviewFade}
                  pointerEvents="none"
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.buildRoleBadge}>
                  <MessageResolvedImage
                    media={message.roleIcon}
                    style={styles.buildRoleIcon}
                  />
                </View>
              </View>
              <View style={styles.buildBody}>
                <Text style={styles.buildEyebrow}>BUILD ĐI RỪNG</Text>
                <Text numberOfLines={1} style={styles.buildTitle}>
                  {message.heroName}
                </Text>
                <Text numberOfLines={2} style={styles.buildSummary}>
                  {message.summary}
                </Text>
                <View style={styles.buildTags}>
                  {message.tags.map((tag) => (
                    <View key={tag} style={styles.buildTag}>
                      <Text style={styles.buildTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.buildActionLine}>
                  <Text style={styles.buildActionText}>Chi tiết build</Text>
                  <Ionicons
                    color={liqiComponentColors.messages.chat.buildActionIcon}
                    name="arrow-forward"
                    size={14}
                  />
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>
      </View>
      <Text style={styles.incomingTime}>
        {formatChatClock(message.createdAt)}
      </Text>
    </View>
  );
}

function IncomingAvatar({
  show,
  thread,
}: {
  show: boolean;
  thread: ChatThread;
}) {
  return (
    <View style={styles.messageAvatarSlot}>
      {show ? (
        <Avatar avatar={thread.avatar} icon={thread.icon} size={30} />
      ) : null}
    </View>
  );
}

function TypingMessage({
  showAvatar,
  thread,
}: {
  showAvatar: boolean;
  thread: ChatThread;
}) {
  return (
    <View
      accessibilityLabel={`${thread.name} đang nhập`}
      accessibilityLiveRegion="polite"
      accessible
      style={styles.incomingRow}
    >
      <IncomingAvatar show={showAvatar} thread={thread} />
      <View style={styles.typingBubble}>
        {[0, 1, 2].map((dot) => (
          <View key={dot} style={styles.typingDot} />
        ))}
      </View>
    </View>
  );
}

function Avatar({
  avatar,
  icon,
  online = false,
  size,
}: {
  avatar?: MessageResolvedMedia;
  icon?: keyof typeof Ionicons.glyphMap;
  online?: boolean;
  size: number;
}) {
  return (
    <View
      style={[
        styles.avatarFrame,
        { borderRadius: size / 2, height: size, width: size },
      ]}
    >
      {avatar ? (
        <MessageResolvedImage
          media={avatar}
          style={[styles.avatarImage, { borderRadius: size / 2 }]}
        />
      ) : (
        <LinearGradient
          colors={liqiComponentGradients.messages.chat.avatarFallback}
          style={[styles.avatarFallback, { borderRadius: size / 2 }]}
        >
          <Ionicons
            color={liqiComponentColors.messages.chat.avatarFallbackIcon}
            name={icon ?? 'person-outline'}
            size={Math.round(size * 0.42)}
          />
        </LinearGradient>
      )}
      {online ? <View style={styles.avatarOnlineDot} /> : null}
    </View>
  );
}
