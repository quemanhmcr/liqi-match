import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  useAssetResolver,
  usePreloadAssetSurface,
} from '@/entities/media-asset';
import {
  LiquidCard,
  LiquidChip,
  LiquidGlassSurface,
  LiquidOrbButton,
} from '@/shared/components/liquid';
import { classifyApplicationError } from '@/shared/errors/application-error';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';
import {
  ctaPurpleCyanGlowSegments,
  matchedPurpleGlowSegments,
  rankCyanGlowSegments,
  teamOrangeGlowSegments,
  type LiquidGlowPreset,
} from '@/shared/theme/liquid-glow.presets';

import { MessageResolvedImage } from '../components/MessageResolvedImage';
import type { MessageInboxFilter } from '../contracts/messages-contracts';
import { loadChatDraftIndex } from '../model/chat-draft-store';
import type { ChatDeliveryStatus } from '../model/chat-message';
import {
  presentInboxConversation,
  type MessageConversationTone,
  type MessageInboxConversationViewModel,
} from '../model/message-surface-presenters';
import { useChatRuntimeStore } from '../model/chat-runtime-store';
import { useMessagesInboxQuery } from '../queries/messages-queries';
import { useMessagesServices } from '../runtime/MessagesServicesProvider';
import type { ChatRepository } from '../services/chat-repository';

const inboxFilters: readonly {
  id: MessageInboxFilter;
  label: string;
}[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'friends', label: 'Bạn bè' },
  { id: 'teams', label: 'Team' },
  { id: 'soulmates', label: 'Tri kỉ' },
];

type ToneStyle = {
  accent: string;
  border: string;
  chipVariant: 'cyan' | 'orange' | 'purple';
  glowPreset: LiquidGlowPreset;
  iconBg: string;
};

const toneStyles: Record<MessageConversationTone, ToneStyle> = {
  cyan: {
    accent: '#58D8F4',
    border: 'rgba(78,220,255,0.15)',
    chipVariant: 'cyan',
    glowPreset: rankCyanGlowSegments,
    iconBg: 'rgba(35,196,255,0.09)',
  },
  muted: {
    accent: 'rgba(213,221,246,0.54)',
    border: 'rgba(220,226,255,0.08)',
    chipVariant: 'purple',
    glowPreset: matchedPurpleGlowSegments,
    iconBg: 'rgba(255,255,255,0.045)',
  },
  orange: {
    accent: '#FFB264',
    border: 'rgba(255,150,74,0.18)',
    chipVariant: 'orange',
    glowPreset: teamOrangeGlowSegments,
    iconBg: 'rgba(255,145,74,0.11)',
  },
  purple: {
    accent: '#D6BBFA',
    border: 'rgba(188,112,255,0.19)',
    chipVariant: 'purple',
    glowPreset: matchedPurpleGlowSegments,
    iconBg: 'rgba(170,92,255,0.09)',
  },
};

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

export function MessagesScreen(props: MessagesScreenProps = {}) {
  const services = useMessagesServices();
  const assetResolver = useAssetResolver();
  usePreloadAssetSurface('messages');
  const clock = props.clock ?? systemMessagesClock;
  const repository = props.repository ?? services.repository;
  const [query, setQuery] = useState('');
  const [selectedFilter, setSelectedFilter] =
    useState<MessageInboxFilter>('all');
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
  const summaryText = isLoading
    ? 'Đang đồng bộ hộp thư'
    : unreadCount > 0
      ? `${unreadCount} cuộc trò chuyện chưa đọc`
      : `${activeSnapshot?.totalCount ?? 0} cuộc trò chuyện`;

  return (
    <LiquidScreen
      contentContainerStyle={styles.content}
      scroll
      withHeader={false}
    >
      <View pointerEvents="none" style={styles.ambientPurple} />
      <View pointerEvents="none" style={styles.ambientCyan} />

      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text maxFontSizeMultiplier={1} style={styles.title}>
            Tin nhắn
          </Text>
          <Text maxFontSizeMultiplier={1} style={styles.summaryText}>
            {summaryText}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <LiquidOrbButton
            accessibilityLabel="Tạo cuộc trò chuyện"
            glowIntensity="low"
            glowPreset={ctaPurpleCyanGlowSegments}
            onPress={lightImpact}
            size={38}
          >
            <Ionicons color="#FFFFFF" name="create-outline" size={18} />
          </LiquidOrbButton>
          <LiquidOrbButton
            accessibilityLabel="Tuỳ chọn tin nhắn"
            glowIntensity="low"
            onPress={selectionImpact}
            size={38}
          >
            <Ionicons
              color="rgba(248,250,255,0.86)"
              name="ellipsis-horizontal"
              size={20}
            />
          </LiquidOrbButton>
        </View>
      </View>

      <LiquidGlassSurface
        baseStrokeOpacity={0.06}
        baseStrokeWidth={0.6}
        blurIntensity={24}
        contentStyle={styles.searchBox}
        glowIntensity="none"
        radius={24}
        style={styles.searchShell}
        surfaceBackground="rgba(7,11,25,0.64)"
        variant="nav"
        withInnerReflection={false}
        withShadow={false}
      >
        <Ionicons color="rgba(202,213,243,0.48)" name="search" size={20} />
        <TextInput
          accessibilityLabel="Tìm kiếm cuộc trò chuyện"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          maxLength={120}
          onChangeText={setQuery}
          placeholder="Tìm người hoặc trò chuyện..."
          placeholderTextColor="rgba(205,216,245,0.42)"
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
              color="rgba(209,219,245,0.56)"
              name="close-circle"
              size={18}
            />
          </Pressable>
        ) : null}
      </LiquidGlassSurface>

      <View
        accessibilityLabel="Bộ lọc cuộc trò chuyện"
        style={styles.filterRail}
      >
        {inboxFilters.map((filter) => {
          const selected = selectedFilter === filter.id;
          const label =
            filter.id === 'unread' && unreadCount > 0
              ? `${filter.label} ${unreadCount}`
              : filter.label;
          return (
            <LiquidChip
              accessibilityLabel={`Lọc ${filter.label}`}
              accessibilityState={{ selected }}
              density="compact"
              key={filter.id}
              onPress={() => {
                selectionImpact();
                setSelectedFilter(filter.id);
              }}
              selected={selected}
              style={styles.filterChip}
              textStyle={styles.filterChipText}
              variant={selected ? 'selected' : 'default'}
              withSheen={selected}
            >
              {label}
            </LiquidChip>
          );
        })}
      </View>

      {inboxQuery.isError && hasResolvedInbox ? (
        <View
          accessibilityLabel="Hộp thư đang hiển thị dữ liệu cũ"
          style={styles.staleBanner}
        >
          <Ionicons color="#FFB86B" name="information-circle" size={16} />
          <Text style={styles.staleText}>
            Không thể làm mới. Đang hiển thị cuộc trò chuyện đã tải gần nhất.
          </Text>
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
            conversations={actionable}
            icon="sparkles-outline"
            label="Cần bạn xử lý"
          />
          <ConversationSection
            conversations={pinned}
            icon="bookmark-outline"
            label="Đã ghim"
          />
          <ConversationSection
            conversations={recent}
            icon="time-outline"
            label="Gần đây"
          />
        </View>
      )}
    </LiquidScreen>
  );
}

function ConversationSection({
  conversations,
  icon,
  label,
}: {
  conversations: readonly MessageInboxConversationViewModel[];
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  if (conversations.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons color="rgba(204,185,244,0.56)" name={icon} size={12} />
        <Text maxFontSizeMultiplier={1} style={styles.sectionLabel}>
          {label}
        </Text>
        <Text maxFontSizeMultiplier={1} style={styles.sectionCount}>
          {conversations.length}
        </Text>
      </View>
      <View style={styles.conversationList}>
        {conversations.map((conversation, index) => (
          <ConversationRow
            conversation={conversation}
            featured={label === 'Cần bạn xử lý' && index === 0}
            key={conversation.id}
          />
        ))}
      </View>
    </View>
  );
}

function ConversationRow({
  conversation,
  featured = false,
}: {
  conversation: MessageInboxConversationViewModel;
  featured?: boolean;
}) {
  const tone = toneStyles[conversation.tone];
  const isUnread = Boolean(conversation.unreadCount);
  const content = (
    <View style={[styles.rowContent, featured && styles.rowContentFeatured]}>
      <ConversationAvatar
        conversation={conversation}
        size={featured ? 54 : 50}
      />
      <View style={styles.rowBody}>
        <View style={styles.identityLine}>
          <Text
            maxFontSizeMultiplier={1}
            numberOfLines={1}
            style={[styles.rowName, isUnread && styles.rowNameUnread]}
          >
            {conversation.name}
          </Text>
          <RelationshipTag conversation={conversation} />
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
              maxFontSizeMultiplier={1}
              style={[
                styles.previewPrefix,
                conversation.isDraft && styles.previewPrefixDraft,
              ]}
            >
              {conversation.previewPrefix}{' '}
            </Text>
          ) : null}
          <Text
            maxFontSizeMultiplier={1}
            numberOfLines={featured ? 2 : 1}
            style={[styles.previewText, isUnread && styles.previewTextUnread]}
          >
            {conversation.lastMessage}
          </Text>
        </View>
        {featured ? (
          <View style={styles.contextLine}>
            <View
              style={[
                styles.contextDot,
                {
                  backgroundColor: conversation.isOnline
                    ? '#20DA9A'
                    : 'rgba(205,214,240,0.34)',
                },
              ]}
            />
            <Text numberOfLines={1} style={styles.contextText}>
              {conversation.presenceLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.trailingColumn}>
        <Text
          maxFontSizeMultiplier={1}
          style={[styles.rowTime, isUnread && styles.rowTimeUnread]}
        >
          {conversation.time}
        </Text>
        <ConversationAccessory conversation={conversation} />
      </View>
    </View>
  );

  return (
    <Pressable
      accessibilityLabel={`Mở chat với ${conversation.name}`}
      accessibilityRole="button"
      onPress={() => openConversation(conversation.id)}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {featured ? (
        <LiquidCard
          backgroundSlot={
            <LinearGradient
              colors={[
                conversation.tone === 'orange'
                  ? 'rgba(255,142,74,0.08)'
                  : 'rgba(151,82,255,0.08)',
                'rgba(35,113,170,0.025)',
                'transparent',
              ]}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
            />
          }
          baseStrokeColor={tone.border}
          baseStrokeOpacity={0.18}
          baseStrokeWidth={0.7}
          blurIntensity={28}
          contentStyle={styles.featuredSurface}
          density="list"
          glowIntensity="low"
          glowPreset={tone.glowPreset}
          radius={24}
          style={styles.featuredCard}
          surfaceBackground="rgba(9,12,28,0.7)"
          variant={tone.chipVariant}
          withInnerReflection={false}
          withShadow
        >
          {content}
        </LiquidCard>
      ) : (
        content
      )}
    </Pressable>
  );
}

function RelationshipTag({
  conversation,
}: {
  conversation: MessageInboxConversationViewModel;
}) {
  if (conversation.relationship === 'friend') return null;
  const tone = toneStyles[conversation.tone];
  return (
    <View
      style={[
        styles.relationshipTag,
        { backgroundColor: tone.iconBg, borderColor: tone.border },
      ]}
    >
      <Text style={[styles.relationshipText, { color: tone.accent }]}>
        {conversation.relationshipLabel}
      </Text>
    </View>
  );
}

function ConversationAvatar({
  conversation,
  size,
}: {
  conversation: MessageInboxConversationViewModel;
  size: number;
}) {
  const tone = toneStyles[conversation.tone];
  const dotSize = Math.max(10, Math.round(size * 0.2));

  return (
    <View
      style={[
        styles.avatarFrame,
        { borderColor: tone.border, height: size, width: size },
      ]}
    >
      {conversation.avatar ? (
        <MessageResolvedImage
          media={conversation.avatar}
          style={styles.avatarImage}
        />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: tone.iconBg }]}>
          <Ionicons
            color={tone.accent}
            name={conversation.icon ?? 'chatbubble-ellipses-outline'}
            size={Math.round(size * 0.42)}
          />
        </View>
      )}
      {conversation.isOnline ? (
        <View style={[styles.onlineDot, { height: dotSize, width: dotSize }]} />
      ) : null}
      {conversation.isGroup ? (
        <View style={styles.groupBadge}>
          <Ionicons color="rgba(239,243,255,0.86)" name="people" size={11} />
        </View>
      ) : null}
    </View>
  );
}

function ConversationAccessory({
  conversation,
}: {
  conversation: MessageInboxConversationViewModel;
}) {
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
        color="rgba(255,177,102,0.86)"
        name="create-outline"
        size={17}
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
        color="rgba(218,226,246,0.46)"
        name="notifications-off-outline"
        size={17}
      />
    );
  }
  if (conversation.isPinned) {
    return (
      <Ionicons
        accessibilityLabel="Cuộc trò chuyện đã ghim"
        color="rgba(205,184,255,0.58)"
        name="bookmark"
        size={15}
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
        color="rgba(255,139,150,0.9)"
        name="alert-circle-outline"
        size={18}
      />
    );
  }
  if (status === 'sending') {
    return (
      <ActivityIndicator
        accessibilityLabel="Tin nhắn đang gửi"
        color="rgba(202,211,239,0.5)"
        size="small"
      />
    );
  }
  if (status === 'queued') {
    return (
      <Ionicons
        accessibilityLabel="Tin nhắn đang chờ mạng"
        color="rgba(255,190,112,0.86)"
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
        status === 'read' ? 'rgba(111,151,255,0.86)' : 'rgba(218,226,246,0.45)'
      }
      name={status === 'sent' ? 'checkmark' : 'checkmark-done'}
      size={17}
    />
  );
}

function InboxState({
  actionLabel,
  description,
  icon,
  loading = false,
  onAction,
  title,
}: {
  actionLabel?: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  onAction?: () => void;
  title: string;
}) {
  return (
    <LiquidCard
      baseStrokeOpacity={0.1}
      blurIntensity={22}
      contentStyle={styles.stateCardContent}
      glowIntensity="none"
      radius={24}
      style={styles.stateCard}
      surfaceBackground="rgba(8,12,27,0.55)"
      variant="purple"
      withInnerReflection={false}
      withShadow={false}
    >
      {loading ? (
        <ActivityIndicator color="rgba(206,184,255,0.82)" size="small" />
      ) : (
        <Ionicons color="rgba(206,184,255,0.76)" name={icon} size={28} />
      )}
      <Text accessibilityLabel={title} style={styles.stateTitle}>
        {title}
      </Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.stateAction,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.stateActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </LiquidCard>
  );
}

const styles = StyleSheet.create({
  staleBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,184,107,0.09)',
    borderColor: 'rgba(255,184,107,0.18)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  staleText: {
    color: 'rgba(255,226,190,0.78)',
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
  },
  ambientCyan: {
    backgroundColor: 'rgba(38,207,255,0.028)',
    borderRadius: 999,
    height: 190,
    position: 'absolute',
    right: -140,
    top: 184,
    width: 190,
  },
  ambientPurple: {
    backgroundColor: 'rgba(151,82,255,0.05)',
    borderRadius: 999,
    height: 230,
    left: -160,
    position: 'absolute',
    top: -70,
    width: 230,
  },
  avatarFallback: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarFrame: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 2,
    position: 'relative',
  },
  avatarImage: {
    borderRadius: 999,
    height: '100%',
    opacity: 0.92,
    width: '100%',
  },
  content: { paddingBottom: 184, paddingTop: 2 },
  contextDot: { borderRadius: 999, height: 6, width: 6 },
  contextLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 1,
  },
  contextText: {
    color: 'rgba(195,205,232,0.44)',
    flex: 1,
    fontSize: 10.5,
    fontWeight: '600',
  },
  conversationList: {
    borderTopColor: 'rgba(210,224,255,0.05)',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  featuredCard: { marginBottom: 4, marginTop: 2 },
  featuredSurface: { padding: 0 },
  filterChip: { minHeight: 29, paddingHorizontal: 9 },
  filterChipText: { fontSize: 11.5, fontWeight: '700' },
  filterRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
  },
  groupBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(24,29,47,0.96)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: -2,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: -4,
    width: 18,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerCopy: { flex: 1, gap: 3 },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  identityLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  onlineDot: {
    backgroundColor: '#20DA9A',
    borderColor: 'rgba(6,10,22,0.98)',
    borderRadius: 999,
    borderWidth: 1.5,
    bottom: 1,
    position: 'absolute',
    right: 1,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.988 }] },
  previewLine: {
    alignItems: 'baseline',
    flexDirection: 'row',
    minWidth: 0,
  },
  previewPrefix: {
    color: 'rgba(235,240,255,0.62)',
    fontSize: 12.4,
    fontWeight: '700',
  },
  previewPrefixDraft: { color: 'rgba(255,177,102,0.9)' },
  previewText: {
    color: 'rgba(207,216,241,0.48)',
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
  },
  previewTextUnread: {
    color: 'rgba(234,239,255,0.74)',
    fontWeight: '600',
  },
  relationshipTag: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  relationshipText: { fontSize: 9.5, fontWeight: '800' },
  rowBody: { flex: 1, gap: 5, minWidth: 0 },
  rowContent: {
    alignItems: 'center',
    borderBottomColor: 'rgba(210,224,255,0.05)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 11,
    minHeight: 70,
    paddingHorizontal: 3,
    paddingVertical: 10,
  },
  rowContentFeatured: {
    borderBottomWidth: 0,
    minHeight: 86,
    paddingHorizontal: 11,
    paddingVertical: 12,
  },
  rowName: {
    color: 'rgba(239,243,255,0.7)',
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.15,
  },
  rowNameUnread: { color: 'rgba(250,251,255,0.98)' },
  rowTime: {
    color: 'rgba(199,209,236,0.38)',
    fontSize: 11.5,
    fontWeight: '600',
  },
  rowTimeUnread: { color: 'rgba(216,195,255,0.82)' },
  searchBox: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  searchInput: {
    color: 'rgba(242,245,255,0.9)',
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  searchShell: { marginTop: 16 },
  section: { gap: 5 },
  sectionCount: {
    color: 'rgba(197,208,235,0.32)',
    fontSize: 10.5,
    fontWeight: '700',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    color: 'rgba(211,194,246,0.54)',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.15,
    textTransform: 'uppercase',
  },
  sections: { gap: 20, marginTop: 18 },
  stateAction: {
    backgroundColor: 'rgba(150,91,235,0.2)',
    borderColor: 'rgba(200,164,255,0.2)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  stateActionText: {
    color: 'rgba(238,229,255,0.9)',
    fontSize: 12,
    fontWeight: '800',
  },
  stateCard: { marginTop: 22 },
  stateCardContent: {
    alignItems: 'center',
    gap: 8,
    minHeight: 190,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 26,
  },
  stateDescription: {
    color: 'rgba(201,211,238,0.48)',
    fontSize: 12.5,
    lineHeight: 18,
    maxWidth: 270,
    textAlign: 'center',
  },
  stateTitle: {
    color: 'rgba(244,246,255,0.9)',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  summaryText: {
    color: 'rgba(199,209,236,0.46)',
    fontSize: 11.5,
    fontWeight: '600',
  },
  title: {
    color: liquidColors.text.primary,
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: -0.58,
  },
  trailingColumn: {
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    minWidth: 42,
    paddingVertical: 2,
  },
  trailingSpacer: { height: 18, width: 18 },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: '#8B49D5',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 21,
    paddingHorizontal: 6,
    paddingVertical: 3,
    shadowColor: '#A85CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  unreadText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
});
