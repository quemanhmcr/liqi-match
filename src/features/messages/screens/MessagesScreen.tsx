import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  AppButton,
  AppCard,
  AppChip,
  AppIdentityHeader,
  AppSectionHeader,
  AppSurface,
  AppScreen,
  isCompactViewport,
  appColors,
  appRadii,
  appSpacing,
  appTypography,
} from '@/shared/ui';
import type { PlayerId } from '@/shared/contracts/core-v1';
import { classifyApplicationError } from '@/shared/errors/application-error';

import { ConversationCard } from '../components/ConversationCard';
import type {
  MessageConversationSummary,
  MessageInboxFilter,
} from '../contracts/messages-contracts';
import { loadChatDraftIndex } from '../model/chat-draft-store';
import { isMessageInboxAttentionStateActionable } from '../model/message-inbox-attention';
import { resolveMessageInboxComposePlacement } from '../model/message-inbox-compose';
import {
  presentInboxConversation,
  type MessageInboxConversationViewModel,
} from '../model/message-surface-presenters';
import { useChatRuntimeStore } from '../model/chat-runtime-store';
import { useMessagesInboxQuery } from '../queries/messages-queries';
import { useMessagesServices } from '../runtime/MessagesServicesProvider';
import type { ChatRepository } from '../services/chat-repository';
import { messagesUi } from '../ui/messages-ui';

const inboxFilters: readonly {
  id: MessageInboxFilter;
  label: string;
}[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'direct', label: 'Cá nhân' },
  { id: 'group', label: 'Nhóm' },
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
  const compactLayout = isCompactViewport(viewportWidth);
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
    .filter((conversation) =>
      isMessageInboxAttentionStateActionable(conversation.attentionState),
    )
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
  const composePlacement = resolveMessageInboxComposePlacement({
    filter: selectedFilter,
    inboxReady: hasResolvedInbox && !inboxQuery.isError,
    query: canonicalQuery,
    resultCount: activeSnapshot?.totalCount,
  });
  const promotesComposeInEmptyState = composePlacement === 'empty-state';
  const openComposePicker = () => {
    lightImpact();
    setQuery('');
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
    <AppScreen
      contentContainerStyle={[
        styles.content,
        compactLayout && styles.contentCompact,
      ]}
      scroll
      withHeader={false}
    >
      <AppIdentityHeader
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
            color={appColors.accent.purpleIcon}
            name="sparkles"
            size={compactLayout ? 22 : 24}
          />
        }
      />

      <View style={styles.inboxControls}>
        {searchVisible ? (
          <AppSurface
            backgroundColor={messagesUi.colors.composerInput}
            borderColor={messagesUi.colors.composerStroke}
            contentStyle={styles.searchBox}
            emphasis="none"
            radius={appRadii.pill}
            style={styles.searchShell}
            variant="nav"
            withHighlight={false}
            withShadow={false}
          >
            <Ionicons
              color={appColors.text.muted}
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
              placeholderTextColor={appColors.text.muted}
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
                  color={appColors.text.tertiary}
                  name="close-circle"
                  size={19}
                />
              </Pressable>
            ) : null}
          </AppSurface>
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
              <AppChip
                accessibilityLabel={`Lọc ${filter.label}`}
                accessibilityState={{ selected }}
                density="compact"
                key={filter.id}
                onPress={() => {
                  selectionImpact();
                  setSelectedFilter(filter.id);
                }}
                selected={selected}
                selectedGradient={messagesUi.gradients.filterSelected}
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
              </AppChip>
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
          <AppSurface
            backgroundColor={appColors.background.deep}
            borderColor={appColors.status.warning}
            borderOpacity={0.22}
            contentStyle={styles.staleBanner}
            emphasis="none"
            radius={appRadii.lg}
            variant="card"
            withShadow={false}
          >
            <Ionicons
              color={appColors.status.warning}
              name="information-circle"
              size={17}
            />
            <Text style={styles.staleText}>
              Không thể làm mới. Đang hiển thị cuộc trò chuyện đã tải gần nhất.
            </Text>
          </AppSurface>
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
          actionLabel={
            promotesComposeInEmptyState ? 'Bắt đầu trò chuyện' : undefined
          }
          description={
            promotesComposeInEmptyState
              ? 'Chọn một người bạn đã sẵn sàng nhắn tin để bắt đầu.'
              : canonicalQuery
                ? `Không có kết quả cho “${canonicalQuery}”.`
                : 'Bộ lọc này chưa có cuộc trò chuyện phù hợp.'
          }
          icon={
            promotesComposeInEmptyState
              ? 'chatbubble-ellipses-outline'
              : 'search-outline'
          }
          onAction={promotesComposeInEmptyState ? openComposePicker : undefined}
          title={
            promotesComposeInEmptyState
              ? 'Chưa có cuộc trò chuyện'
              : 'Không tìm thấy cuộc trò chuyện'
          }
        />
      ) : (
        <View style={styles.sections}>
          <ConversationSection
            compact={compactLayout}
            conversations={actionable}
            label="Cần bạn xử lý"
            onOpenConversation={openConversation}
          />
          <ConversationSection
            compact={compactLayout}
            conversations={pinned}
            label="Đã ghim"
            onOpenConversation={openConversation}
          />
          <ConversationSection
            compact={compactLayout}
            conversations={recent}
            label="Gần đây"
            onOpenConversation={openConversation}
          />
        </View>
      )}

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
    </AppScreen>
  );
}

function ConversationSection({
  compact,
  conversations,
  label,
  onOpenConversation,
}: Readonly<{
  compact: boolean;
  conversations: readonly MessageInboxConversationViewModel[];
  label: string;
  onOpenConversation: (conversationId: string) => void;
}>) {
  if (conversations.length === 0) return null;

  return (
    <View style={styles.section}>
      <AppSectionHeader
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
            onPress={onOpenConversation}
          />
        ))}
      </View>
    </View>
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
    <AppCard
      backgroundColor={messagesUi.colors.mutedSurface}
      borderColor={messagesUi.colors.listCardStroke}
      contentStyle={styles.stateCardContent}
      emphasis="none"
      radius={messagesUi.metrics.inbox.cardRadius}
      style={styles.stateCard}
      surfaceTone="high"
      withHighlight={false}
      withShadow={false}
    >
      {loading ? (
        <ActivityIndicator color={appColors.accent.purpleIcon} size="small" />
      ) : (
        <Ionicons color={appColors.accent.purpleIcon} name={icon} size={30} />
      )}
      <Text accessibilityLabel={title} style={styles.stateTitle}>
        {title}
      </Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {actionLabel && onAction ? (
        <AppButton
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={styles.stateAction}
          variant="secondary"
        >
          {actionLabel}
        </AppButton>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: appSpacing['3xl'],
    paddingTop: appSpacing.lg,
  },
  contentCompact: { gap: appSpacing['2xl'] },
  conversationList: { gap: appSpacing.lg },
  filterChip: {
    minHeight: messagesUi.metrics.inbox.filterHeight,
    paddingHorizontal: messagesUi.metrics.inbox.filterPaddingHorizontal,
  },
  filterChipSelected: {
    shadowColor: messagesUi.colors.filterSelectedShadow,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  filterChipText: { fontSize: 12.5, fontWeight: '700' },
  filterRail: {
    gap: appSpacing.md,
    paddingHorizontal: appSpacing.xs,
    paddingVertical: appSpacing.xs,
  },
  filterUnreadDot: {
    backgroundColor: messagesUi.colors.filterUnreadDot,
    borderRadius: 4,
    height: 8,
    shadowColor: messagesUi.colors.filterSelectedShadow,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 5,
    width: 8,
  },
  inboxControls: { gap: appSpacing.lg },
  searchBox: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.md,
    minHeight: messagesUi.metrics.inbox.searchHeight,
    paddingHorizontal: appSpacing['2xl'],
  },
  searchInput: {
    ...appTypography.body,
    color: appColors.text.primary,
    flex: 1,
    paddingVertical: 0,
  },
  searchShell: { marginHorizontal: appSpacing.xs },
  section: { gap: appSpacing.md },
  sectionCount: {
    ...appTypography.caption,
    color: appColors.accent.purpleIcon,
    fontWeight: '800',
  },
  sectionHeading: { marginTop: 0, paddingHorizontal: appSpacing.xs },
  sections: { gap: appSpacing['4xl'] },
  staleBanner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.md,
    paddingHorizontal: appSpacing.xl,
    paddingVertical: appSpacing.lg,
  },
  staleText: {
    ...appTypography.caption,
    color: appColors.text.secondary,
    flex: 1,
  },
  stateAction: { marginTop: appSpacing.sm },
  stateCard: { marginTop: appSpacing.md },
  stateCardContent: {
    alignItems: 'center',
    gap: appSpacing.md,
    justifyContent: 'center',
    minHeight: 190,
    paddingHorizontal: appSpacing['6xl'],
    paddingVertical: appSpacing['6xl'],
  },
  stateDescription: {
    ...appTypography.bodyCompact,
    color: appColors.text.tertiary,
    maxWidth: 280,
    textAlign: 'center',
  },
  stateTitle: {
    ...appTypography.sectionTitle,
    color: appColors.text.primary,
    textAlign: 'center',
  },
});
