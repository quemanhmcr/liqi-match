import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
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
  AppButton,
  AppScreen,
  AppText,
  appColors,
  appSpacing,
  isCompactViewport,
} from '@/shared/ui';
import { classifyApplicationError } from '@/shared/errors/application-error';

import { NotificationFilterBar } from '../components/NotificationFilterBar';
import { NotificationGroup } from '../components/NotificationGroup';
import { NotificationInboxHeader } from '../components/NotificationInboxHeader';
import {
  NotificationEmptyState,
  NotificationErrorState,
  NotificationLoadingState,
  NotificationStaleNotice,
} from '../components/NotificationInboxStates';
import {
  matchesNotificationFilter,
  notificationFilters,
  type NotificationFilterId,
} from '../model/notification-filters';
import {
  mapNotificationToViewModel,
  type NotificationDestination,
  type NotificationItem,
} from '../model/notification-view-model';
import { notificationsUi } from '../ui/notifications-ui';

export function NotificationsScreen() {
  const { width } = useWindowDimensions();
  const compact = isCompactViewport(width);
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
  const filteredNotifications = useMemo(
    () =>
      notifications.filter((item) =>
        matchesNotificationFilter(item, activeFilter),
      ),
    [activeFilter, notifications],
  );
  const groupedNotifications = groupNotifications(filteredNotifications);
  const activeFilterLabel =
    notificationFilters.find((filter) => filter.id === activeFilter)?.label ??
    'Tất cả';

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
      const destination = item.action?.destination;
      markNotificationRead(item.id);
      if (destination) navigateNotificationDestination(destination);
    },
    [markNotificationRead],
  );

  const hasResolvedFeed = Boolean(inboxQuery.data);
  const inboxFailure = classifyApplicationError(inboxQuery.error);
  const refreshing =
    hasResolvedFeed &&
    inboxQuery.isRefetching &&
    !inboxQuery.isFetchingNextPage;

  return (
    <AppScreen
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          colors={[appColors.accent.purpleIcon]}
          onRefresh={() => void inboxQuery.refetch()}
          progressBackgroundColor={notificationsUi.colors.refreshSurface}
          refreshing={refreshing}
          tintColor={appColors.accent.purpleIcon}
        />
      }
      scroll
      withBottomNavPadding={false}
      withHeader={false}
    >
      <NotificationInboxHeader compact={compact} onBack={navigateBack} />
      <NotificationFilterBar
        activeFilter={activeFilter}
        onSelect={(filter) => {
          selectionImpact();
          setActiveFilter(filter);
        }}
      />

      {inboxQuery.isError && hasResolvedFeed ? (
        <NotificationStaleNotice />
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
        <View style={styles.groups}>
          {groupedNotifications.map(([group, items]) => (
            <NotificationGroup
              compact={compact}
              items={items}
              key={group}
              label={group}
              onAction={handleNotificationAction}
            />
          ))}
        </View>
      ) : (
        <NotificationEmptyState filterLabel={activeFilterLabel} />
      )}

      {hasResolvedFeed && filteredNotifications.length ? (
        inboxQuery.hasNextPage ? (
          <AppButton
            accessibilityLabel={
              inboxQuery.isFetchNextPageError
                ? 'Thử tải thêm thông báo'
                : 'Tải thêm thông báo'
            }
            disabled={inboxQuery.isFetchingNextPage}
            emphasis="low"
            onPress={() => void inboxQuery.fetchNextPage()}
            style={styles.loadMore}
            variant="secondary"
            withShadow={false}
          >
            {inboxQuery.isFetchingNextPage
              ? 'Đang tải…'
              : inboxQuery.isFetchNextPageError
                ? 'Thử tải thêm'
                : 'Tải thêm'}
          </AppButton>
        ) : (
          <AppText style={styles.endText} tone="muted" variant="caption">
            Đã tải hết thông báo
          </AppText>
        )
      ) : null}
    </AppScreen>
  );
}

function navigateBack() {
  selectionImpact();
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.navigate(appRoutes.main.home);
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
    case 'session_feedback':
      router.push(appRoutes.sessions.feedback(destination.sessionId));
      return;
    case 'home':
      router.push(appRoutes.main.home);
      return;
  }
}

function groupNotifications(items: readonly NotificationItem[]) {
  const groups: [NotificationItem['group'], NotificationItem[]][] = [];
  for (const group of ['Hôm nay', 'Trước đó'] as const) {
    const groupItems = items.filter((item) => item.group === group);
    if (groupItems.length) groups.push([group, groupItems]);
  }
  return groups;
}

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: appSpacing['8xl'],
  },
  endText: {
    marginTop: appSpacing['5xl'],
    textAlign: 'center',
  },
  groups: { gap: notificationsUi.spacing.sectionGap },
  loadMore: {
    alignSelf: 'center',
    marginTop: appSpacing['6xl'],
    minWidth: 132,
  },
});
