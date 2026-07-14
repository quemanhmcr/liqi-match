import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type TextProps,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  useAssetResolver,
  usePreloadAssetSurface,
} from '@/entities/media-asset';
import {
  useMarkNotificationInboxSeen,
  useMarkNotificationRead,
  useNotificationInboxFeed,
} from '@/entities/notifications';
import { useAuth } from '@/shared/auth/auth-context';
import {
  LiquidButton,
  LiquidCard,
  LiquidChip,
  LiquidGlassSurface,
  LiquidOrbButton,
} from '@/shared/components/liquid';
import type { EdgeGlowSegment } from '@/shared/components/liquid';
import {
  classifyApplicationError,
  type ApplicationErrorKind,
} from '@/shared/errors/application-error';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import { NotificationResolvedImage } from '../components/NotificationResolvedImage';
import {
  notificationFilters,
  type NotificationFilterId,
} from '../model/notification-filters';
import {
  mapNotificationToViewModel,
  type NotificationDestination,
  type NotificationItem,
  type NotificationResolvedMedia,
  type NotificationTone,
} from '../model/notification-view-model';

type GradientColors = readonly [string, string, ...string[]];
type IconName = keyof typeof Ionicons.glyphMap;

type NotificationToneSpec = {
  actionGradient: readonly [string, string];
  background: string;
  border: string;
  glow: readonly EdgeGlowSegment[];
  halo: string;
  icon: string;
  text: string;
};

const pinkGlowSegments = [
  {
    bloomOpacity: 0.18,
    bloomWidth: 5.2,
    blur: 12,
    color: 'rgba(255,104,174,0.66)',
    end: 0.08,
    id: 'notification-pink-top-left',
    lineOpacity: 0.42,
    lineWidth: 0.76,
    start: 0,
  },
  {
    bloomOpacity: 0.2,
    bloomWidth: 5.4,
    blur: 12,
    color: 'rgba(255,128,190,0.78)',
    end: 0.5,
    id: 'notification-pink-right',
    lineOpacity: 0.42,
    lineWidth: 0.78,
    start: 0.39,
  },
] as const satisfies readonly EdgeGlowSegment[];

const purpleGlowSegments = [
  {
    bloomOpacity: 0.13,
    bloomWidth: 4.8,
    blur: 11,
    color: 'rgba(188,111,255,0.62)',
    end: 0.075,
    id: 'notification-purple-top-left',
    lineOpacity: 0.32,
    lineWidth: 0.72,
    start: 0,
  },
  {
    bloomOpacity: 0.16,
    bloomWidth: 5.1,
    blur: 12,
    color: 'rgba(131,132,255,0.56)',
    end: 0.52,
    id: 'notification-purple-right',
    lineOpacity: 0.34,
    lineWidth: 0.74,
    start: 0.405,
  },
] as const satisfies readonly EdgeGlowSegment[];

const blueGlowSegments = [
  {
    bloomOpacity: 0.11,
    bloomWidth: 4.6,
    blur: 11,
    color: 'rgba(105,156,255,0.52)',
    end: 0.072,
    id: 'notification-blue-top-left',
    lineOpacity: 0.28,
    lineWidth: 0.72,
    start: 0,
  },
  {
    bloomOpacity: 0.14,
    bloomWidth: 5,
    blur: 12,
    color: 'rgba(120,157,255,0.60)',
    end: 0.515,
    id: 'notification-blue-right',
    lineOpacity: 0.3,
    lineWidth: 0.74,
    start: 0.402,
  },
] as const satisfies readonly EdgeGlowSegment[];

const cyanGlowSegments = [
  {
    bloomOpacity: 0.1,
    bloomWidth: 4.4,
    blur: 11,
    color: 'rgba(68,211,255,0.48)',
    end: 0.07,
    id: 'notification-cyan-top-left',
    lineOpacity: 0.26,
    lineWidth: 0.7,
    start: 0,
  },
  {
    bloomOpacity: 0.17,
    bloomWidth: 5.2,
    blur: 12,
    color: 'rgba(80,227,255,0.68)',
    end: 0.51,
    id: 'notification-cyan-right',
    lineOpacity: 0.34,
    lineWidth: 0.76,
    start: 0.4,
  },
] as const satisfies readonly EdgeGlowSegment[];

const toneSpecs: Record<NotificationTone, NotificationToneSpec> = {
  blue: {
    actionGradient: ['rgba(45,61,120,0.82)', 'rgba(94,108,190,0.74)'],
    background: 'rgba(9,15,35,0.50)',
    border: 'rgba(126,159,255,0.15)',
    glow: blueGlowSegments,
    halo: 'rgba(82,126,255,0.08)',
    icon: '#AFC2FF',
    text: '#C8D4FF',
  },
  cyan: {
    actionGradient: ['rgba(13,72,98,0.92)', 'rgba(35,172,210,0.82)'],
    background: 'rgba(7,20,35,0.50)',
    border: 'rgba(84,222,255,0.14)',
    glow: cyanGlowSegments,
    halo: 'rgba(64,215,255,0.07)',
    icon: '#55E7FF',
    text: '#B7F2FF',
  },
  pink: {
    actionGradient: ['rgba(128,42,92,0.84)', 'rgba(188,78,133,0.76)'],
    background: 'rgba(28,10,31,0.46)',
    border: 'rgba(255,119,184,0.14)',
    glow: pinkGlowSegments,
    halo: 'rgba(255,92,168,0.09)',
    icon: '#FF7BBC',
    text: '#FFACD6',
  },
  purple: {
    actionGradient: ['rgba(88,58,178,0.84)', 'rgba(84,98,190,0.76)'],
    background: 'rgba(18,12,36,0.48)',
    border: 'rgba(183,122,255,0.13)',
    glow: purpleGlowSegments,
    halo: 'rgba(156,90,255,0.09)',
    icon: '#C891FF',
    text: '#E0C5FF',
  },
};

function NotificationText(props: TextProps) {
  return <RNText maxFontSizeMultiplier={1} {...props} />;
}

export function NotificationsScreen() {
  const { session } = useAuth();
  const assetResolver = useAssetResolver();
  usePreloadAssetSurface('notifications');
  const [activeFilter, setActiveFilter] = useState<NotificationFilterId>('all');
  const acknowledgedWatermarkRef = useRef<string | null>(null);
  const inboxQuery = useNotificationInboxFeed(session);
  const { mutate: markInboxSeen } = useMarkNotificationInboxSeen(session);
  const { mutate: markNotificationRead } = useMarkNotificationRead(session);
  const inboxPages = inboxQuery.data?.pages;
  const firstPage = inboxPages?.[0];
  const unseenCount = firstPage?.unseenCount ?? 0;
  const latestWatermark = firstPage?.latestWatermark ?? null;
  const latestWatermarkKey = latestWatermark
    ? `${latestWatermark.occurredAt}:${latestWatermark.id}`
    : null;

  const notifications = useMemo(
    () =>
      (inboxPages ?? []).flatMap((page) =>
        page.items.map((notification) =>
          mapNotificationToViewModel(notification, { assetResolver }),
        ),
      ),
    [assetResolver, inboxPages],
  );
  const filteredNotifications = notifications.filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'unread') return !item.isSeen;
    return item.category === activeFilter;
  });
  const groupedNotifications = groupNotifications(filteredNotifications);

  useEffect(() => {
    acknowledgedWatermarkRef.current = null;
  }, [session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      if (!latestWatermark || !latestWatermarkKey || unseenCount === 0) return;
      if (acknowledgedWatermarkRef.current === latestWatermarkKey) return;

      acknowledgedWatermarkRef.current = latestWatermarkKey;
      markInboxSeen(latestWatermark, {
        onError: () => {
          acknowledgedWatermarkRef.current = null;
        },
      });
    }, [markInboxSeen, latestWatermark, latestWatermarkKey, unseenCount]),
  );

  const handleNotificationAction = useCallback(
    (item: NotificationItem) => {
      markNotificationRead(item.id);
      const destination = item.action?.destination;
      if (destination) navigateNotificationDestination(destination);
    },
    [markNotificationRead],
  );

  const hasResolvedFeed = Boolean(inboxQuery.data);
  const inboxFailure = classifyApplicationError(inboxQuery.error);

  return (
    <LiquidScreen
      contentContainerStyle={styles.content}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <NotificationTopBar />
      <NotificationSummaryCard
        error={inboxQuery.isError && !hasResolvedFeed}
        loading={inboxQuery.isPending && !hasResolvedFeed}
        unreadCount={unseenCount}
      />
      <NotificationFilterBar
        activeFilter={activeFilter}
        onSelect={(filter) => {
          selectionImpact();
          setActiveFilter(filter);
        }}
        unreadCount={unseenCount}
      />
      {inboxQuery.isError && hasResolvedFeed ? (
        <View
          accessibilityLabel="Thông báo đang hiển thị dữ liệu cũ"
          style={styles.staleBanner}
        >
          <Ionicons color="#FFB86B" name="information-circle" size={16} />
          <NotificationText style={styles.staleText}>
            Không thể làm mới. Đang hiển thị thông báo đã tải gần nhất.
          </NotificationText>
        </View>
      ) : null}
      {inboxQuery.isPending && !hasResolvedFeed ? (
        <NotificationLoadingState />
      ) : inboxQuery.isError && !hasResolvedFeed ? (
        <NotificationErrorState
          kind={inboxFailure.kind}
          onRetry={
            inboxFailure.retryable ? () => void inboxQuery.refetch() : undefined
          }
        />
      ) : groupedNotifications.length ? (
        groupedNotifications.map(([group, items]) => (
          <View
            key={group}
            style={[
              styles.groupBlock,
              group === 'Hôm nay' && styles.groupBlockToday,
            ]}
          >
            <NotificationText style={styles.groupTitle}>
              {group}
            </NotificationText>
            <View style={styles.timelineList}>
              {items.map((item) => (
                <NotificationCard
                  item={item}
                  key={item.id}
                  onAction={() => handleNotificationAction(item)}
                />
              ))}
            </View>
          </View>
        ))
      ) : (
        <NotificationEmptyState />
      )}
      {hasResolvedFeed ? (
        inboxQuery.hasNextPage ? (
          <LiquidButton
            accessibilityLabel={
              inboxQuery.isFetchNextPageError
                ? 'Thử tải thêm thông báo'
                : 'Tải thêm thông báo'
            }
            contentStyle={styles.loadMoreButtonContent}
            disabled={inboxQuery.isFetchingNextPage}
            glowIntensity="low"
            onPress={() => void inboxQuery.fetchNextPage()}
            radius={17}
            style={styles.loadMoreButton}
            textStyle={styles.actionButtonText}
            variant="secondary"
            withShadow={false}
          >
            {inboxQuery.isFetchingNextPage
              ? 'Đang tải…'
              : inboxQuery.isFetchNextPageError
                ? 'Thử tải thêm'
                : 'Tải thêm'}
          </LiquidButton>
        ) : (
          <NotificationText style={styles.endText}>
            Đã tải hết thông báo
          </NotificationText>
        )
      ) : null}
    </LiquidScreen>
  );
}

function NotificationTopBar() {
  return (
    <View style={styles.topBar}>
      <LiquidOrbButton
        accessibilityLabel="Quay lại"
        glassIntensity="low"
        glowIntensity="low"
        onPress={() => {
          selectionImpact();
          if (router.canGoBack()) {
            router.back();
            return;
          }
          router.navigate(appRoutes.main.home);
        }}
        size={36}
      >
        <Ionicons
          color={liquidColors.text.primary}
          name="chevron-back"
          size={15}
        />
      </LiquidOrbButton>
      <NotificationText numberOfLines={1} style={styles.screenTitle}>
        Thông báo
      </NotificationText>
      <View style={styles.topBarSpacer} />
    </View>
  );
}

function NotificationSummaryCard({
  error,
  loading,
  unreadCount,
}: {
  error: boolean;
  loading: boolean;
  unreadCount: number;
}) {
  const title = loading
    ? 'Đang đồng bộ thông báo'
    : error
      ? 'Chưa thể tải thông báo'
      : unreadCount
        ? `${unreadCount} thông báo mới`
        : 'Không còn thông báo mới';
  const subtitle = loading
    ? 'Dữ liệu mới nhất đang được chuẩn bị.'
    : error
      ? 'Kết nối chưa ổn định, hãy thử lại.'
      : unreadCount
        ? 'Đừng bỏ lỡ những cập nhật quan trọng.'
        : 'Bạn đã xử lý xong các cập nhật gần nhất.';

  return (
    <LiquidCard
      baseStrokeOpacity={0.08}
      baseStrokeWidth={0.42}
      contentStyle={styles.summaryContent}
      density="large"
      frameColors={[
        'rgba(255,113,181,0.16)',
        'rgba(255,255,255,0.050)',
        'rgba(115,121,255,0.08)',
      ]}
      glassIntensity="low"
      glowIntensity="low"
      glowPreset={pinkGlowSegments}
      radius={26}
      style={styles.summaryCard}
      surfaceBackground="rgba(18,12,32,0.38)"
    >
      <View style={styles.summaryIconOuter}>
        <LinearGradient
          colors={['rgba(255,104,174,0.22)', 'rgba(136,68,255,0.08)']}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons color="#F7A6CC" name="notifications" size={18} />
      </View>
      <View style={styles.summaryTextBlock}>
        <NotificationText style={styles.summaryTitle}>{title}</NotificationText>
        <NotificationText style={styles.summarySubtitle}>
          {subtitle}
        </NotificationText>
      </View>
      <Ionicons
        color="rgba(225,214,255,0.48)"
        name="chevron-forward"
        size={15}
      />
    </LiquidCard>
  );
}

function NotificationFilterBar({
  activeFilter,
  onSelect,
  unreadCount,
}: {
  activeFilter: NotificationFilterId;
  onSelect: (filter: NotificationFilterId) => void;
  unreadCount: number;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.filtersContent}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filters}
    >
      {notificationFilters.map((filter) => {
        const selected = filter.id === activeFilter;
        const showBadge = filter.id === 'unread' && unreadCount > 0;
        return (
          <LiquidChip
            accessibilityLabel={`Lọc ${filter.label}`}
            accessibilityState={{ selected }}
            contentStyle={[
              styles.filterChip,
              selected && styles.filterChipSelected,
            ]}
            density="compact"
            key={filter.id}
            onPress={() => onSelect(filter.id)}
            selected={selected}
            style={styles.filterChipHost}
            variant={selected ? 'selected' : 'default'}
            withSheen
          >
            <View style={styles.filterChipContent}>
              <NotificationText
                style={[
                  styles.filterLabel,
                  selected && styles.filterLabelSelected,
                ]}
              >
                {filter.label}
              </NotificationText>
              {showBadge ? (
                <View style={styles.filterBadge}>
                  <NotificationText style={styles.filterBadgeText}>
                    {unreadCount}
                  </NotificationText>
                </View>
              ) : null}
            </View>
          </LiquidChip>
        );
      })}
    </ScrollView>
  );
}

function NotificationCard({
  item,
  onAction,
}: {
  item: NotificationItem;
  onAction: () => void;
}) {
  const tone = toneSpecs[item.visual.tone];
  const isDetailed = isDetailedNotification(item);
  const isCompact = !isDetailed;
  const isSystem = item.category === 'system';

  return (
    <View style={styles.timelineRow}>
      {item.group === 'Hôm nay' ? <View style={styles.timelineDot} /> : null}
      <LiquidCard
        baseStrokeColor={tone.border}
        baseStrokeOpacity={0.075}
        baseStrokeWidth={0.42}
        contentStyle={[
          styles.cardContent,
          isCompact && styles.cardContentCompact,
          isSystem && styles.cardContentSystem,
        ]}
        density="list"
        frameColors={cardFrameColors(tone)}
        glassIntensity="low"
        glowIntensity="low"
        glowPreset={tone.glow}
        radius={isCompact ? 16 : 18}
        style={[styles.notificationCard, item.isSeen && styles.readCard]}
        surfaceBackground={tone.background}
        withInnerReflection
      >
        <View style={[styles.cardHalo, { backgroundColor: tone.halo }]} />
        <NotificationVisual compact={isCompact} visual={item.visual} />
        <View style={styles.cardTextColumn}>
          <NotificationMessage item={item} />
          <NotificationText style={styles.timeText}>
            {item.timeLabel}
          </NotificationText>
        </View>
        <NotificationAccessory
          compact={isCompact}
          item={item}
          onAction={onAction}
        />
        <Ionicons
          color="rgba(217,224,255,0.48)"
          name="chevron-forward"
          size={13}
          style={styles.chevron}
        />
      </LiquidCard>
    </View>
  );
}

function isDetailedNotification(item: NotificationItem) {
  return (
    item.visual.kind === 'avatar' &&
    Boolean(item.action) &&
    item.messageParts.length > 1
  );
}

function NotificationMessage({ item }: { item: NotificationItem }) {
  const [firstPart, secondPart] = item.messageParts;
  const hasTitle = item.title.length > 0;
  const highlightSecondLine = secondPart?.startsWith('“');

  return (
    <View style={styles.messageBlock}>
      <NotificationText
        numberOfLines={item.category === 'system' ? 2 : 1}
        style={styles.messageLine}
      >
        {hasTitle ? (
          <NotificationText
            style={[
              styles.messageStrong,
              item.category === 'system' && styles.systemTitle,
            ]}
          >
            {item.title}
          </NotificationText>
        ) : null}
        {hasTitle ? ' ' : null}
        {!hasTitle ? (
          <NotificationText style={styles.messageStrong}>
            {firstPart}
          </NotificationText>
        ) : (
          firstPart
        )}
      </NotificationText>
      {secondPart ? (
        <NotificationText
          numberOfLines={1}
          style={[
            styles.messageLine,
            highlightSecondLine && styles.messageHighlight,
          ]}
        >
          {secondPart}
        </NotificationText>
      ) : null}
    </View>
  );
}

function NotificationVisual({
  compact,
  visual,
}: {
  compact: boolean;
  visual: NotificationItem['visual'];
}) {
  const tone = toneSpecs[visual.tone];
  const symbolSize = compact ? 36 : 44;
  const symbolIconSize = compact ? 18 : 22;

  if (visual.kind === 'avatar') {
    return (
      <View style={[styles.avatarHost, compact && styles.avatarHostCompact]}>
        <LinearGradient
          colors={[tone.icon, 'rgba(255,255,255,0.08)']}
          style={[styles.avatarFrame, compact && styles.avatarFrameCompact]}
        >
          <NotificationResolvedImage
            media={visual.media}
            style={[styles.avatarImage, compact && styles.avatarImageCompact]}
          />
        </LinearGradient>
        {visual.badgeIcon ? (
          <View
            style={[
              styles.avatarBadge,
              compact && styles.avatarBadgeCompact,
              { borderColor: tone.border },
            ]}
          >
            <Ionicons
              color={tone.icon}
              name={visual.badgeIcon as IconName}
              size={compact ? 8 : 9}
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <LiquidGlassSurface
      baseStrokeColor={tone.border}
      baseStrokeOpacity={0.08}
      contentStyle={styles.symbolContent}
      frameColors={[tone.border, 'rgba(255,255,255,0.016)']}
      glassIntensity="low"
      glowIntensity="low"
      glowPreset={tone.glow}
      height={symbolSize}
      radius={symbolSize / 2}
      surfaceBackground="rgba(9,12,28,0.52)"
      variant="button"
      width={symbolSize}
      withShadow={false}
    >
      <Ionicons
        color={tone.icon}
        name={visual.icon as IconName}
        size={symbolIconSize}
      />
    </LiquidGlassSurface>
  );
}

function NotificationAccessory({
  compact,
  item,
  onAction,
}: {
  compact: boolean;
  item: NotificationItem;
  onAction: () => void;
}) {
  if (item.action) {
    const tone = toneSpecs[item.action.tone];
    return (
      <LiquidButton
        accessibilityLabel={[item.action.label, item.title]
          .filter(Boolean)
          .join(' ')}
        contentStyle={[
          styles.actionButtonContent,
          compact && styles.actionButtonContentCompact,
        ]}
        glowIntensity="low"
        glowPreset={tone.glow}
        gradientColors={tone.actionGradient}
        onPress={() => {
          selectionImpact();
          onAction();
        }}
        radius={compact ? 15 : 18}
        style={[styles.actionButton, compact && styles.actionButtonCompact]}
        textStyle={styles.actionButtonText}
        variant="primary"
        withShadow={false}
      >
        {item.action.label}
      </LiquidButton>
    );
  }

  if (item.previewAvatars?.length) {
    return <PreviewAvatarStack avatars={item.previewAvatars} />;
  }

  if (item.reward) {
    const tone = toneSpecs[item.reward.tone];
    return (
      <View
        style={[
          styles.rewardPill,
          item.reward.label && styles.rewardPillLabeled,
          { borderColor: tone.border },
        ]}
      >
        <LinearGradient
          colors={[tone.halo, 'rgba(255,255,255,0.035)']}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons
          color={tone.icon}
          name={item.reward.icon as IconName}
          size={item.reward.label ? 14 : 16}
        />
        {item.reward.label ? (
          <NotificationText style={styles.rewardLabel}>
            {item.reward.label}
          </NotificationText>
        ) : null}
      </View>
    );
  }

  return null;
}

function PreviewAvatarStack({
  avatars,
}: {
  avatars: readonly NotificationResolvedMedia[];
}) {
  return (
    <View style={styles.previewStack}>
      {avatars.map((avatar, index) => (
        <NotificationResolvedImage
          key={index}
          media={avatar}
          style={[
            styles.previewAvatar,
            index > 0 && styles.previewAvatarOverlap,
          ]}
        />
      ))}
    </View>
  );
}

function navigateNotificationDestination(destination: NotificationDestination) {
  switch (destination.kind) {
    case 'conversation':
      router.push(appRoutes.messages.detail(destination.conversationId));
      return;
    case 'match':
      router.push(appRoutes.discover.matchDetail(destination.matchId));
      return;
    case 'profile':
      router.push(appRoutes.profile.playerDetail(destination.playerId));
      return;
    case 'set':
      router.push(appRoutes.discover.setDetail(destination.setId));
      return;
  }
}

function NotificationLoadingState() {
  return (
    <LiquidCard
      contentStyle={styles.emptyContent}
      density="large"
      glowIntensity="low"
      radius={24}
      style={styles.emptyCard}
      withInnerReflection={false}
    >
      <Ionicons
        color="rgba(220,226,255,0.70)"
        name="cloud-download-outline"
        size={28}
      />
      <NotificationText style={styles.emptyTitle}>
        Đang tải thông báo
      </NotificationText>
      <NotificationText style={styles.emptyBody}>
        LiQi đang đồng bộ inbox mới nhất của bạn.
      </NotificationText>
    </LiquidCard>
  );
}

function NotificationErrorState({
  kind,
  onRetry,
}: {
  kind: ApplicationErrorKind;
  onRetry?: () => void;
}) {
  const description =
    kind === 'offline'
      ? 'Thiết bị đang offline. Kết nối lại để tải thông báo.'
      : onRetry
        ? 'Dữ liệu tạm thời chưa sẵn sàng. Hãy thử lại.'
        : 'Yêu cầu thông báo không thể hoàn tất.';
  return (
    <LiquidCard
      contentStyle={styles.emptyContent}
      density="large"
      glowIntensity="low"
      radius={24}
      style={styles.emptyCard}
      withInnerReflection={false}
    >
      <Ionicons
        color="rgba(255,184,107,0.82)"
        name="cloud-offline-outline"
        size={28}
      />
      <NotificationText style={styles.emptyTitle}>
        Không tải được thông báo
      </NotificationText>
      <NotificationText style={styles.emptyBody}>
        {description}
      </NotificationText>
      {onRetry ? (
        <LiquidButton
          accessibilityLabel="Thử tải lại thông báo"
          contentStyle={styles.retryButtonContent}
          onPress={onRetry}
          radius={16}
          style={styles.retryButton}
          textStyle={styles.actionButtonText}
          variant="secondary"
          withShadow={false}
        >
          Thử lại
        </LiquidButton>
      ) : null}
    </LiquidCard>
  );
}

function NotificationEmptyState() {
  return (
    <LiquidCard
      contentStyle={styles.emptyContent}
      density="large"
      glowIntensity="low"
      radius={24}
      style={styles.emptyCard}
      withInnerReflection={false}
    >
      <Ionicons
        color="rgba(220,226,255,0.70)"
        name="checkmark-done-outline"
        size={28}
      />
      <NotificationText style={styles.emptyTitle}>
        Không có thông báo trong mục này
      </NotificationText>
      <NotificationText style={styles.emptyBody}>
        Các cập nhật mới sẽ xuất hiện ở đây.
      </NotificationText>
    </LiquidCard>
  );
}

function groupNotifications(items: readonly NotificationItem[]) {
  const groups: [NotificationItem['group'], NotificationItem[]][] = [];
  for (const group of ['Hôm nay', 'Trước đó'] as const) {
    const groupItems = items.filter((item) => item.group === group);
    if (groupItems.length) groups.push([group, groupItems]);
  }
  return groups;
}

function cardFrameColors(tone: NotificationToneSpec): GradientColors {
  return [tone.border, 'rgba(255,255,255,0.028)', 'rgba(255,255,255,0.004)'];
}

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
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
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  staleText: {
    color: 'rgba(255,226,190,0.78)',
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  actionButton: {
    minWidth: 56,
  },
  actionButtonContent: {
    minHeight: 28,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  actionButtonCompact: {
    minWidth: 50,
  },
  actionButtonContentCompact: {
    minHeight: 24,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  actionButtonText: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  avatarBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,18,42,0.92)',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 1,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: -1,
    width: 16,
  },
  avatarBadgeCompact: {
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  avatarFrame: {
    borderRadius: 21,
    height: 42,
    padding: 2,
    width: 42,
  },
  avatarFrameCompact: {
    borderRadius: 18,
    height: 36,
    width: 36,
  },
  avatarHost: {
    height: 44,
    marginRight: 6,
    overflow: 'visible',
    width: 44,
  },
  avatarHostCompact: {
    height: 38,
    marginRight: 5,
    width: 38,
  },
  avatarImage: {
    borderRadius: 19,
    height: 38,
    width: 38,
  },
  avatarImageCompact: {
    borderRadius: 16,
    height: 32,
    width: 32,
  },
  cardContent: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 62,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 6,
  },
  cardContentCompact: {
    minHeight: 52,
    paddingVertical: 4,
  },
  cardContentSystem: {
    minHeight: 46,
    paddingVertical: 3,
  },
  cardHalo: {
    borderRadius: 140,
    height: 72,
    opacity: 0.09,
    position: 'absolute',
    right: -52,
    top: -30,
    width: 112,
  },
  cardTextColumn: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  chevron: {
    marginLeft: 1,
    opacity: 0.48,
    zIndex: 3,
  },
  content: {
    paddingBottom: 26,
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  emptyBody: {
    color: liquidColors.text.muted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  emptyCard: {
    marginTop: 18,
  },
  emptyContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyTitle: {
    color: liquidColors.text.primary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  endText: {
    color: 'rgba(207,214,244,0.42)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },
  filterBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(211,74,120,0.84)',
    borderRadius: 6,
    height: 11,
    justifyContent: 'center',
    minWidth: 11,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -5,
    top: -7,
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '700',
  },
  filterChip: {
    backgroundColor: 'rgba(13,19,38,0.58)',
    borderColor: 'rgba(111,132,191,0.14)',
    minHeight: 28,
    minWidth: 0,
    paddingHorizontal: 7,
  },
  filterChipContent: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  filterChipHost: {
    overflow: 'visible',
  },
  filterChipSelected: {
    backgroundColor: 'rgba(72,68,156,0.20)',
    borderColor: 'rgba(178,190,255,0.18)',
  },
  filterLabel: {
    color: 'rgba(203,214,241,0.70)',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: -0.06,
  },
  filterLabelSelected: {
    color: 'rgba(255,255,255,0.95)',
  },
  filters: {
    marginHorizontal: -14,
    marginTop: 14,
    overflow: 'visible',
  },
  filtersContent: {
    gap: 5,
    overflow: 'visible',
    paddingHorizontal: 14,
    paddingTop: 5,
  },
  groupBlock: {
    marginTop: 12,
  },
  groupBlockToday: {
    marginTop: 8,
  },
  loadMoreButton: {
    alignSelf: 'center',
    marginTop: 20,
    minWidth: 112,
  },
  loadMoreButtonContent: {
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  groupTitle: {
    color: 'rgba(220,226,248,0.52)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.22,
    marginBottom: 9,
  },
  messageBlock: {
    gap: 2,
  },
  messageHighlight: {
    color: '#F89AC8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  messageLine: {
    color: 'rgba(224,229,250,0.70)',
    fontSize: 11.5,
    fontWeight: '400',
    letterSpacing: -0.04,
    lineHeight: 15,
  },
  messageStrong: {
    color: liquidColors.text.primary,
    fontWeight: '600',
  },
  systemTitle: {
    color: 'rgba(238,242,255,0.82)',
    fontSize: 10.5,
    fontWeight: '600',
  },
  notificationCard: {
    flex: 1,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  previewAvatar: {
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    width: 24,
  },
  previewAvatarOverlap: {
    marginLeft: -7,
  },
  previewStack: {
    flexDirection: 'row',
    marginLeft: 6,
    zIndex: 3,
  },
  readCard: {
    opacity: 0.86,
  },
  retryButton: {
    marginTop: 14,
    minWidth: 84,
  },
  retryButtonContent: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  rewardLabel: {
    color: 'rgba(245,248,255,0.76)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: -2,
  },
  rewardPill: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    marginLeft: 5,
    minWidth: 34,
    overflow: 'hidden',
    paddingHorizontal: 7,
    zIndex: 3,
  },
  rewardPillLabeled: {
    borderRadius: 10,
    height: 27,
    marginLeft: 4,
    minWidth: 30,
    paddingHorizontal: 5,
  },
  screenTitle: {
    color: liquidColors.text.primary,
    bottom: 0,
    fontSize: 16,
    fontWeight: '600',
    left: 104,
    letterSpacing: -0.35,
    position: 'absolute',
    right: 104,
    textAlign: 'center',
    top: 0,
    textAlignVertical: 'center',
  },
  summaryCard: {
    marginTop: 16,
  },
  summaryContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 60,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  summaryIconOuter: {
    alignItems: 'center',
    borderColor: 'rgba(255,126,188,0.18)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 36,
  },
  summarySubtitle: {
    color: 'rgba(218,224,246,0.58)',
    fontSize: 10.5,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 14,
    marginTop: 5,
  },
  summaryTextBlock: {
    flex: 1,
  },
  summaryTitle: {
    ...liquidTypography.cardTitle,
    color: liquidColors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  symbolContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  timeText: {
    color: 'rgba(207,214,244,0.56)',
    fontSize: 9.5,
    fontWeight: '400',
    marginTop: 2,
  },
  timelineDot: {
    backgroundColor: 'rgba(239,82,132,0.78)',
    borderColor: 'rgba(255,165,206,0.34)',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    height: 8,
    left: -4,
    position: 'absolute',
    top: 18,
    width: 8,
    zIndex: 10,
  },
  timelineList: {
    borderLeftColor: 'rgba(255,93,154,0.09)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    gap: 9,
  },
  timelineRow: {
    marginLeft: 0,
    overflow: 'visible',
    paddingLeft: 0,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    position: 'relative',
  },
  topBarSpacer: { height: 36, width: 36 },
});
