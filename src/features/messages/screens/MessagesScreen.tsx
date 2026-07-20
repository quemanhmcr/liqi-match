import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { FriendPlayerPickerModal } from '@/entities/social-relationship/ui';
import {
  useAssetResolver,
  usePreloadAssetSurface,
} from '@/entities/media-asset';
import {
  LiqiButton,
  LiqiCard,
  LiqiChip,
  LiqiIdentityHeader,
  LiqiSectionHeader,
  LiqiSurface,
} from '@/shared/components/liqi';
import type { PlayerId } from '@/shared/contracts/core-v1';
import { classifyApplicationError } from '@/shared/errors/application-error';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';
import {
  isCompactLiqiViewport,
  liqiColors,
  liqiComponentColors,
  liqiComponentGradients,
  liqiComponents,
  liqiMotion,
  liqiOpacity,
  liqiRadius,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import { MessageAvatarStack } from '../components/MessageAvatarStack';
import type {
  MessageConversationSummary,
  MessageInboxFilter,
} from '../contracts/messages-contracts';
import { loadChatDraftIndex } from '../model/chat-draft-store';
import type { ChatDeliveryStatus } from '../model/chat-message';
import {
  presentInboxConversation,
  type MessageInboxConversationViewModel,
} from '../model/message-surface-presenters';
import { useChatRuntimeStore } from '../model/chat-runtime-store';
import { useMessagesInboxQuery } from '../queries/messages-queries';
import { useMessagesServices } from '../runtime/MessagesServicesProvider';
import type { ChatRepository } from '../services/chat-repository';
import { messagesChatAssets } from './messages-redesign-assets';

const inboxFilters: readonly {
  id: MessageInboxFilter;
  label: string;
}[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'teams', label: 'Phòng' },
  { id: 'friends', label: 'Cá nhân' },
  { id: 'soulmates', label: 'Tri kỉ' },
];

export type MessagesClock = {
  now(): Date;
};

const systemMessagesClock: MessagesClock = {
  now: () => new Date(),
};

export type MessagesScreenProps = {
  clock?: MessagesClock;
  repository?: ChatRepository;
};

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function lightImpact() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
}

function openConversation(conversationId: string) {
  selectionImpact();
  router.push(appRoutes.messages.detail(conversationId));
}

function isActionableConversation(
  conversation: MessageInboxConversationViewModel,
) {
  return Boolean(
    conversation.isDraft ||
    conversation.unreadCount ||
    conversation.latestDeliveryStatus === 'failed' ||
    conversation.latestDeliveryStatus === 'queued',
  );
}

function compareActivity(
  left: MessageInboxConversationViewModel,
  right: MessageInboxConversationViewModel,
) {
  return (right.activityAt ?? '').localeCompare(left.activityAt ?? '');
}

function findDirectConversation(
  conversations: readonly MessageConversationSummary[],
  targetPlayerId: PlayerId,
) {
  return conversations.find(
    (conversation) =>
      conversation.kind === 'direct' &&
      conversation.capabilities.canMessage &&
      conversation.participants.preview.some(
        (participant) => participant.id === targetPlayerId,
      ),
  );
}

export function MessagesScreen(props: MessagesScreenProps = {}) {
  const services = useMessagesServices();
  const { width: viewportWidth } = useWindowDimensions();
  const compactLayout = isCompactLiqiViewport(viewportWidth);
  const assetResolver = useAssetResolver();
  usePreloadAssetSurface('messages');
  const clock = props.clock ?? systemMessagesClock;
  const repository = props.repository ?? services.repository;
  const [query, setQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [selectedFilter, setSelectedFilter] =
    useState<MessageInboxFilter>('all');
  const [composePickerVisible, setComposePickerVisible] = useState(false);
  const [composePending, setComposePending] = useState(false);
  const [composeSelectedPlayerIds, setComposeSelectedPlayerIds] = useState<
    readonly PlayerId[]
  >([]);
  const runtimeMessagesByConversation = useChatRuntimeStore(
    (state) => state.messagesByConversation,
  );
  const draftPreviewsByConversation = useChatRuntimeStore(
    (state) => state.draftPreviewsByConversation,
  );
  const draftUpdatedAtByConversation = useChatRuntimeStore(
    (state) => state.draftUpdatedAtByConversation,
  );
  const draftIndexHydrated = useChatRuntimeStore(
    (state) => state.draftIndexHydrated,
  );
  const readConversationIds = useChatRuntimeStore(
    (state) => state.readConversationIds,
  );
  const hydrateDraftIndex = useChatRuntimeStore(
    (state) => state.hydrateDraftIndex,
  );
  const canonicalQuery = query.trim();
  const inboxQuery = useMessagesInboxQuery({
    filter: selectedFilter,
    query: canonicalQuery,
    repository,
  });

  useEffect(() => {
    if (draftIndexHydrated) return;
    let active = true;
    loadChatDraftIndex()
      .then((index) => {
        if (active) hydrateDraftIndex(index);
      })
      .catch(() => {
        if (active) hydrateDraftIndex({});
      });
    return () => {
      active = false;
    };
  }, [draftIndexHydrated, hydrateDraftIndex]);

  const activeSnapshot = inboxQuery.data?.data;
  const inboxFailure = classifyApplicationError(inboxQuery.error);
  const hasResolvedInbox = Boolean(activeSnapshot);
  const isLoading = inboxQuery.isPending && !hasResolvedInbox;
  const hasLoadError = inboxQuery.isError && !hasResolvedInbox;
  const referenceDate = clock.now();
  const conversations = useMemo(
    () =>
      (activeSnapshot?.items ?? []).map((conversation) =>
        presentInboxConversation({
          assetResolver,
          conversation,
          draftPreview: draftPreviewsByConversation[conversation.id],
          draftUpdatedAt: draftUpdatedAtByConversation[conversation.id],
          isRead: Boolean(readConversationIds[conversation.id]),
          referenceDate,
          runtimeMessages: runtimeMessagesByConversation[conversation.id] ?? [],
        }),
      ),
    [
      activeSnapshot?.items,
      assetResolver,
      draftPreviewsByConversation,
      draftUpdatedAtByConversation,
      readConversationIds,
      referenceDate,
      runtimeMessagesByConversation,
    ],
  );
  const actionable = conversations
    .filter(isActionableConversation)
    .sort(compareActivity);
  const actionableIds = new Set(actionable.map(({ id }) => id));
  const pinned = conversations
    .filter(
      (conversation) =>
        conversation.isPinned && !actionableIds.has(conversation.id),
    )
    .sort(compareActivity);
  const sectionedIds = new Set([
    ...actionableIds,
    ...pinned.map(({ id }) => id),
  ]);
  const recent = conversations
    .filter((conversation) => !sectionedIds.has(conversation.id))
    .sort(compareActivity);
  const unreadCount = activeSnapshot?.unreadConversationCount ?? 0;
  const openComposePicker = () => {
    lightImpact();
    setQuery('');
    setSelectedFilter('friends');
    setComposeSelectedPlayerIds([]);
    setComposePickerVisible(true);
  };

  const openFriendConversation = async (playerIds: readonly PlayerId[]) => {
    const targetPlayerId = playerIds[0];
    if (!targetPlayerId || composePending) return;

    setComposePending(true);
    try {
      let conversation = findDirectConversation(
        activeSnapshot?.items ?? [],
        targetPlayerId,
      );
      if (!conversation) {
        const refreshed = await inboxQuery.refetch();
        conversation = findDirectConversation(
          refreshed.data?.data.items ?? [],
          targetPlayerId,
        );
      }
      if (!conversation) {
        Alert.alert(
          'Trò chuyện đang được đồng bộ',
          'Quan hệ bạn bè đã được ghi nhận nhưng phòng chat chưa xuất hiện trong hộp thư. Hãy làm mới và thử lại.',
        );
        return;
      }

      setComposePickerVisible(false);
      setComposeSelectedPlayerIds([]);
      openConversation(conversation.id);
    } catch {
      Alert.alert(
        'Chưa mở được trò chuyện',
        'Không thể làm mới hộp thư lúc này. Hãy kiểm tra kết nối và thử lại.',
      );
    } finally {
      setComposePending(false);
    }
  };

  const toggleSearch = () => {
    selectionImpact();
    setSearchVisible((visible) => {
      if (visible) setQuery('');
      return !visible;
    });
  };

  return (
    <LiqiScreen
      contentContainerStyle={[
        styles.content,
        compactLayout && styles.contentCompact,
      ]}
      scroll
      withHeader={false}
    >
      <LiqiIdentityHeader
        actions={[
          {
            accessibilityLabel: 'Tìm cuộc trò chuyện',
            emphasized: true,
            icon: searchVisible ? 'close-outline' : 'search-outline',
            onPress: toggleSearch,
          },
          {
            accessibilityLabel: 'Tạo cuộc trò chuyện',
            emphasized: true,
            icon: 'create-outline',
            onPress: openComposePicker,
          },
        ]}
        compact={compactLayout}
        online={false}
        presentation="page"
        subtitle="Kết nối với những người bạn hợp vibe"
        testID="messages-identity-header"
        title="Tin nhắn"
        titleAccessory={
          <Ionicons
            color={liqiColors.accent.purpleIcon}
            name="sparkles"
            size={compactLayout ? 22 : 24}
          />
        }
      />

      <View style={styles.inboxControls}>
        {searchVisible ? (
          <LiqiSurface
            backgroundColor={liqiComponentColors.messages.composerInput}
            borderColor={liqiComponentColors.messages.composerStroke}
            contentStyle={styles.searchBox}
            emphasis="none"
            radius={liqiRadius.pill}
            style={styles.searchShell}
            variant="nav"
            withHighlight={false}
            withShadow={false}
          >
            <Ionicons
              color={liqiColors.text.muted}
              name="search-outline"
              size={20}
            />
            <TextInput
              accessibilityLabel="Tìm kiếm cuộc trò chuyện"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              maxLength={120}
              onChangeText={setQuery}
              placeholder="Tìm người hoặc trò chuyện..."
              placeholderTextColor={liqiColors.text.muted}
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
            />
            {query ? (
              <Pressable
                accessibilityLabel="Xoá tìm kiếm"
                hitSlop={8}
                onPress={() => setQuery('')}
              >
                <Ionicons
                  color={liqiColors.text.tertiary}
                  name="close-circle"
                  size={19}
                />
              </Pressable>
            ) : null}
          </LiqiSurface>
        ) : null}

        <ScrollView
          accessibilityLabel="Bộ lọc cuộc trò chuyện"
          contentContainerStyle={styles.filterRail}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {inboxFilters.map((filter) => {
            const selected = selectedFilter === filter.id;
            return (
              <LiqiChip
                accessibilityLabel={`Lọc ${filter.label}`}
                accessibilityState={{ selected }}
                density="compact"
                key={filter.id}
                onPress={() => {
                  selectionImpact();
                  setSelectedFilter(filter.id);
                }}
                selected={selected}
                selectedGradient={
                  liqiComponentGradients.messages.filterSelected
                }
                style={[
                  styles.filterChip,
                  selected && styles.filterChipSelected,
                ]}
                textStyle={styles.filterChipText}
                trailingIcon={
                  filter.id === 'unread' && unreadCount > 0 ? (
                    <View
                      style={styles.filterUnreadDot}
                      testID="messages-unread-filter-indicator"
                    />
                  ) : undefined
                }
                variant={selected ? 'selected' : 'default'}
                withSheen={selected}
              >
                {filter.label}
              </LiqiChip>
            );
          })}
        </ScrollView>
      </View>

      {inboxQuery.isError && hasResolvedInbox ? (
        <View
          accessibilityLabel="Hộp thư đang hiển thị dữ liệu cũ"
          accessibilityLiveRegion="polite"
          accessible
        >
          <LiqiSurface
            backgroundColor={liqiColors.background.deep}
            borderColor={liqiColors.status.warning}
            borderOpacity={0.22}
            contentStyle={styles.staleBanner}
            emphasis="none"
            radius={liqiRadius.lg}
            variant="card"
            withShadow={false}
          >
            <Ionicons
              color={liqiColors.status.warning}
              name="information-circle"
              size={17}
            />
            <Text style={styles.staleText}>
              Không thể làm mới. Đang hiển thị cuộc trò chuyện đã tải gần nhất.
            </Text>
          </LiqiSurface>
        </View>
      ) : null}

      {isLoading ? (
        <InboxState
          description="Đang lấy trạng thái mới nhất của cuộc trò chuyện."
          icon="chatbubble-ellipses-outline"
          loading
          title="Đang tải cuộc trò chuyện"
        />
      ) : hasLoadError ? (
        <InboxState
          actionLabel={inboxFailure.retryable ? 'Thử lại' : undefined}
          description={
            inboxFailure.kind === 'offline'
              ? 'Thiết bị đang offline. Kết nối lại để tải hộp thư.'
              : inboxFailure.retryable
                ? 'Hộp thư tạm thời chưa sẵn sàng. Hãy thử lại.'
                : 'Yêu cầu hộp thư không thể hoàn tất.'
          }
          icon={
            inboxFailure.kind === 'offline'
              ? 'cloud-offline-outline'
              : 'alert-circle-outline'
          }
          onAction={
            inboxFailure.retryable
              ? () => {
                  void inboxQuery.refetch();
                }
              : undefined
          }
          title="Không thể tải hộp thư"
        />
      ) : conversations.length === 0 ? (
        <InboxState
          description={
            canonicalQuery
              ? `Không có kết quả cho “${canonicalQuery}”.`
              : 'Bộ lọc này chưa có cuộc trò chuyện phù hợp.'
          }
          icon="search-outline"
          title="Không tìm thấy cuộc trò chuyện"
        />
      ) : (
        <View style={styles.sections}>
          <ConversationSection
            compact={compactLayout}
            conversations={actionable}
            label="Cần bạn xử lý"
          />
          <ConversationSection
            compact={compactLayout}
            conversations={pinned}
            label="Đã ghim"
          />
          <ConversationSection
            compact={compactLayout}
            conversations={recent}
            label="Gần đây"
          />
        </View>
      )}

      <StartConversationCard
        compact={compactLayout}
        onPress={openComposePicker}
      />

      <FriendPlayerPickerModal
        maxSelected={1}
        onClose={() => {
          if (composePending) return;
          setComposePickerVisible(false);
          setComposeSelectedPlayerIds([]);
        }}
        onConfirm={(playerIds) => {
          void openFriendConversation(playerIds);
        }}
        purpose="conversation"
        selectedPlayerIds={composeSelectedPlayerIds}
        setSelectedPlayerIds={setComposeSelectedPlayerIds}
        title="Bắt đầu trò chuyện"
        visible={composePickerVisible}
      />
    </LiqiScreen>
  );
}

function ConversationSection({
  compact,
  conversations,
  label,
}: Readonly<{
  compact: boolean;
  conversations: readonly MessageInboxConversationViewModel[];
  label: string;
}>) {
  if (conversations.length === 0) return null;

  return (
    <View style={styles.section}>
      <LiqiSectionHeader
        action={<Text style={styles.sectionCount}>{conversations.length}</Text>}
        style={styles.sectionHeading}
        title={label}
      />
      <View style={styles.conversationList}>
        {conversations.map((conversation) => (
          <ConversationCard
            compact={compact}
            conversation={conversation}
            key={conversation.id}
          />
        ))}
      </View>
    </View>
  );
}

function ConversationCard({
  compact,
  conversation,
}: Readonly<{
  compact: boolean;
  conversation: MessageInboxConversationViewModel;
}>) {
  const isUnread = Boolean(conversation.unreadCount);
  const artwork = conversationArtwork(conversation);
  const avatarSize = compact
    ? liqiComponents.messages.inbox.avatarCompact
    : liqiComponents.messages.inbox.avatar;
  const cardRadius = compact
    ? liqiComponents.messages.inbox.cardRadiusCompact
    : liqiComponents.messages.inbox.cardRadius;

  return (
    <Pressable
      accessibilityLabel={`Mở chat với ${conversation.name}`}
      accessibilityRole="button"
      onPress={() => openConversation(conversation.id)}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <LiqiCard
        backgroundColor={liqiComponentColors.messages.listCardSurface}
        backgroundSlot={
          artwork ? (
            <ImageBackground
              resizeMode="cover"
              source={artwork}
              style={StyleSheet.absoluteFill}
              testID={`messages-conversation-artwork-${conversation.id}`}
            >
              <LinearGradient
                colors={liqiComponentGradients.messages.cardScrim}
                end={{ x: 1, y: 0.5 }}
                locations={[0, 0.42, 0.76, 1]}
                start={{ x: 0, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </ImageBackground>
          ) : undefined
        }
        borderColor={liqiComponentColors.messages.listCardStroke}
        borderOpacity={isUnread ? 0.86 : 0.58}
        contentStyle={[
          styles.cardContent,
          {
            minHeight: compact
              ? liqiComponents.messages.inbox.cardMinHeightCompact
              : liqiComponents.messages.inbox.cardMinHeight,
          },
        ]}
        density="list"
        emphasis={isUnread ? 'medium' : 'low'}
        radius={cardRadius}
        surfaceTone="high"
        testID={`messages-conversation-card-${conversation.id}`}
        withHighlight={false}
      >
        <MessageAvatarStack
          avatars={conversation.participantAvatars}
          fallbackIcon={conversation.icon}
          online={conversation.isOnline}
          primaryAvatar={conversation.avatar}
          size={avatarSize}
        />

        <View style={styles.cardBody}>
          <View style={styles.cardTitleLine}>
            <Text
              maxFontSizeMultiplier={1}
              numberOfLines={1}
              style={[styles.cardTitle, isUnread && styles.cardTitleUnread]}
            >
              {conversation.name}
            </Text>
            <Ionicons
              color={relationshipColor(conversation)}
              name={relationshipIcon(conversation)}
              size={18}
            />
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
            <Ionicons
              color={
                conversation.isOnline
                  ? liqiColors.status.online
                  : liqiColors.accent.purple
              }
              name={conversation.isGroup ? 'people' : 'ellipse'}
              size={conversation.isGroup ? 14 : 8}
            />
            <Text numberOfLines={1} style={styles.metaText}>
              {conversation.isGroup && conversation.participantCount > 0
                ? `${conversation.participantCount} thành viên`
                : conversation.presenceLabel}
            </Text>
          </View>
        </View>

        <View style={styles.trailingColumn}>
          <Text style={[styles.cardTime, isUnread && styles.cardTimeUnread]}>
            {conversation.time}
          </Text>
          <ConversationAccessory conversation={conversation} />
        </View>
      </LiqiCard>
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

function relationshipIcon(
  conversation: MessageInboxConversationViewModel,
): keyof typeof Ionicons.glyphMap {
  if (conversation.relationship === 'team') return 'trophy';
  if (conversation.relationship === 'soulmate') return 'heart';
  if (conversation.sourceType === 'play_session') return 'game-controller';
  if (conversation.kind === 'system') return 'sparkles';
  return 'heart-outline';
}

function relationshipColor(conversation: MessageInboxConversationViewModel) {
  if (conversation.relationship === 'team') return liqiColors.accent.amber;
  if (conversation.relationship === 'soulmate') return liqiColors.accent.pink;
  return liqiColors.accent.purple;
}

function ConversationAccessory({
  conversation,
}: Readonly<{
  conversation: MessageInboxConversationViewModel;
}>) {
  if (conversation.unreadCount) {
    return (
      <View
        accessibilityLabel={`${conversation.unreadCount} tin nhắn chưa đọc`}
        accessible
        style={styles.unreadBadge}
      >
        <Text style={styles.unreadText}>{conversation.unreadCount}</Text>
      </View>
    );
  }
  if (conversation.isDraft) {
    return (
      <Ionicons
        accessibilityLabel="Có bản nháp"
        color={liqiColors.status.warning}
        name="create-outline"
        size={18}
      />
    );
  }
  if (conversation.latestDirection === 'outgoing') {
    return <DeliveryAccessory status={conversation.latestDeliveryStatus} />;
  }
  if (conversation.isMuted) {
    return (
      <Ionicons
        accessibilityLabel="Cuộc trò chuyện đã tắt thông báo"
        color={liqiColors.text.muted}
        name="notifications-off-outline"
        size={18}
      />
    );
  }
  if (conversation.isPinned) {
    return (
      <Ionicons
        accessibilityLabel="Cuộc trò chuyện đã ghim"
        color={liqiColors.accent.purpleSoft}
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
        color={liqiColors.status.danger}
        name="alert-circle-outline"
        size={18}
      />
    );
  }
  if (status === 'sending') {
    return (
      <ActivityIndicator
        accessibilityLabel="Tin nhắn đang gửi"
        color={liqiColors.text.muted}
        size="small"
      />
    );
  }
  if (status === 'queued') {
    return (
      <Ionicons
        accessibilityLabel="Tin nhắn đang chờ mạng"
        color={liqiColors.status.warning}
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
          ? liqiComponentColors.messages.deliveryRead
          : liqiColors.text.muted
      }
      name={status === 'sent' ? 'checkmark' : 'checkmark-done'}
      size={17}
    />
  );
}

function StartConversationCard({
  compact,
  onPress,
}: Readonly<{ compact: boolean; onPress: () => void }>) {
  return (
    <LiqiCard
      backgroundColor={liqiComponentColors.messages.promoSurface}
      backgroundSlot={
        <LinearGradient
          colors={liqiComponentGradients.messages.promo}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      }
      borderColor={liqiComponentColors.messages.listCardStroke}
      contentStyle={[
        styles.promoContent,
        compact && styles.promoContentCompact,
      ]}
      density="list"
      emphasis="medium"
      radius={liqiComponents.messages.inbox.cardRadiusCompact}
      style={styles.promoCard}
      withHighlight
    >
      <View style={styles.promoIcon}>
        <Ionicons
          color={liqiColors.text.onAccent}
          name="chatbubble-ellipses"
          size={25}
        />
      </View>
      <View style={styles.promoCopy}>
        <Text style={styles.promoTitle}>Bắt đầu trò chuyện</Text>
        <Text numberOfLines={2} style={styles.promoDescription}>
          Kết nối ngay với một người bạn đã sẵn sàng nhắn tin.
        </Text>
      </View>
      <LiqiButton
        accessibilityLabel="Bắt đầu trò chuyện"
        onPress={onPress}
        style={styles.promoButton}
        textStyle={styles.promoButtonText}
      >
        Bắt đầu
      </LiqiButton>
    </LiqiCard>
  );
}

function InboxState({
  actionLabel,
  description,
  icon,
  loading = false,
  onAction,
  title,
}: Readonly<{
  actionLabel?: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  onAction?: () => void;
  title: string;
}>) {
  return (
    <LiqiCard
      backgroundColor={liqiComponentColors.messages.mutedSurface}
      borderColor={liqiComponentColors.messages.listCardStroke}
      contentStyle={styles.stateCardContent}
      emphasis="none"
      radius={liqiComponents.messages.inbox.cardRadius}
      style={styles.stateCard}
      surfaceTone="high"
      withHighlight={false}
      withShadow={false}
    >
      {loading ? (
        <ActivityIndicator color={liqiColors.accent.purpleIcon} size="small" />
      ) : (
        <Ionicons color={liqiColors.accent.purpleIcon} name={icon} size={30} />
      )}
      <Text accessibilityLabel={title} style={styles.stateTitle}>
        {title}
      </Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {actionLabel && onAction ? (
        <LiqiButton
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={styles.stateAction}
          variant="secondary"
        >
          {actionLabel}
        </LiqiButton>
      ) : null}
    </LiqiCard>
  );
}

const styles = StyleSheet.create({
  cardBody: { flex: 1, gap: liqiSpacing.sm, minWidth: 0 },
  cardContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing.xl,
    paddingHorizontal: liqiSpacing.xl,
    paddingVertical: liqiSpacing.lg,
  },
  cardTime: {
    ...liqiTypography.caption,
    color: liqiComponentColors.messages.timestamp,
    fontWeight: '600',
  },
  cardTimeUnread: { color: liqiColors.text.primary },
  cardTitle: {
    ...liqiTypography.cardTitle,
    color: liqiColors.text.secondary,
    flexShrink: 1,
  },
  cardTitleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing.sm,
    minWidth: 0,
  },
  cardTitleUnread: { color: liqiColors.text.primary, fontWeight: '800' },
  content: {
    gap: liqiSpacing['3xl'],
    paddingBottom: liqiComponents.screen.bottomNavSpacer,
    paddingTop: liqiSpacing.lg,
  },
  contentCompact: { gap: liqiSpacing['2xl'] },
  conversationList: { gap: liqiSpacing.lg },
  filterChip: {
    minHeight: liqiComponents.messages.inbox.filterHeight,
    paddingHorizontal: liqiComponents.messages.inbox.filterPaddingHorizontal,
  },
  filterChipSelected: {
    shadowColor: liqiComponentColors.messages.filterSelectedShadow,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  filterChipText: { fontSize: 12.5, fontWeight: '700' },
  filterRail: {
    gap: liqiSpacing.md,
    paddingHorizontal: liqiSpacing.xs,
    paddingVertical: liqiSpacing.xs,
  },
  filterUnreadDot: {
    backgroundColor: liqiComponentColors.messages.filterUnreadDot,
    borderRadius: 4,
    height: 8,
    shadowColor: liqiComponentColors.messages.filterSelectedShadow,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 5,
    width: 8,
  },
  inboxControls: { gap: liqiSpacing.lg },
  metaLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing.sm,
  },
  metaText: {
    ...liqiTypography.caption,
    color: liqiColors.text.tertiary,
    flex: 1,
    fontWeight: '600',
  },
  pressed: {
    opacity: liqiOpacity.pressed,
    transform: [{ scale: liqiMotion.subtlePressScale }],
  },
  previewLine: {
    alignItems: 'baseline',
    flexDirection: 'row',
    minWidth: 0,
  },
  previewPrefix: {
    ...liqiTypography.bodyCompact,
    color: liqiColors.text.secondary,
    fontWeight: '700',
  },
  previewPrefixDraft: { color: liqiColors.status.warning },
  previewText: {
    ...liqiTypography.bodyCompact,
    color: liqiColors.text.tertiary,
    flex: 1,
  },
  previewTextUnread: { color: liqiColors.text.secondary, fontWeight: '600' },
  promoButton: { minWidth: 94 },
  promoButtonText: { fontSize: liqiTypography.buttonCompact.fontSize },
  promoCard: { marginTop: liqiSpacing.xs },
  promoContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing.xl,
    minHeight: liqiComponents.messages.inbox.promoMinHeight,
    padding: liqiSpacing.xl,
  },
  promoContentCompact: {
    gap: liqiSpacing.md,
    paddingHorizontal: liqiSpacing.lg,
  },
  promoCopy: { flex: 1, gap: liqiSpacing.xs, minWidth: 0 },
  promoDescription: {
    ...liqiTypography.caption,
    color: liqiColors.text.secondary,
  },
  promoIcon: {
    alignItems: 'center',
    backgroundColor: liqiColors.accent.purpleSoft,
    borderRadius: liqiRadius.xl,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  promoTitle: {
    ...liqiTypography.sectionTitle,
    color: liqiColors.text.primary,
  },
  searchBox: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing.md,
    minHeight: liqiComponents.messages.inbox.searchHeight,
    paddingHorizontal: liqiSpacing['2xl'],
  },
  searchInput: {
    ...liqiTypography.body,
    color: liqiColors.text.primary,
    flex: 1,
    paddingVertical: 0,
  },
  searchShell: { marginHorizontal: liqiSpacing.xs },
  section: { gap: liqiSpacing.md },
  sectionCount: {
    ...liqiTypography.caption,
    color: liqiColors.accent.purpleIcon,
    fontWeight: '800',
  },
  sectionHeading: { marginTop: 0, paddingHorizontal: liqiSpacing.xs },
  sections: { gap: liqiSpacing['4xl'] },
  staleBanner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing.md,
    paddingHorizontal: liqiSpacing.xl,
    paddingVertical: liqiSpacing.lg,
  },
  staleText: {
    ...liqiTypography.caption,
    color: liqiColors.text.secondary,
    flex: 1,
  },
  stateAction: { marginTop: liqiSpacing.sm },
  stateCard: { marginTop: liqiSpacing.md },
  stateCardContent: {
    alignItems: 'center',
    gap: liqiSpacing.md,
    justifyContent: 'center',
    minHeight: 190,
    paddingHorizontal: liqiSpacing['6xl'],
    paddingVertical: liqiSpacing['6xl'],
  },
  stateDescription: {
    ...liqiTypography.bodyCompact,
    color: liqiColors.text.tertiary,
    maxWidth: 280,
    textAlign: 'center',
  },
  stateTitle: {
    ...liqiTypography.sectionTitle,
    color: liqiColors.text.primary,
    textAlign: 'center',
  },
  trailingColumn: {
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    minWidth: 42,
    paddingVertical: liqiSpacing.xs,
  },
  trailingSpacer: { height: 18, width: 18 },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.messages.unread,
    borderColor: liqiColors.border.surfaceHighlight,
    borderRadius: liqiRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 24,
    paddingHorizontal: liqiSpacing.sm,
    paddingVertical: liqiSpacing.xs,
  },
  unreadText: {
    ...liqiTypography.caption,
    color: liqiColors.text.onAccent,
    fontWeight: '900',
  },
});
