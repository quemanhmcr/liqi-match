import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  isMatchIntentActive,
  matchIntentFiltersForMood,
  moodForMatchIntent,
  useActivateMatchIntentMutation,
  useCurrentMatchIntentQuery,
  usePauseMatchIntentMutation,
} from '@/entities/match-intent';
import { usePreloadAssetSurface } from '@/entities/media-asset';
import { useNotificationInboxSummary } from '@/entities/notifications';
import {
  playSessionQueryKeys,
  prepareCoreV2CommandMetadata,
  resolvePlaySessionActor,
  simulationMatchIdToMatchId,
  usePlaySessionServices,
} from '@/entities/play-session';
import { useAuth } from '@/shared/auth/auth-context';
import {
  AppButton,
  AppScreen,
  isCompactViewport,
  appColors,
} from '@/shared/ui';
import { MatchIdSchema } from '@/shared/contracts/core-v1';
import { classifyApplicationError } from '@/shared/errors/application-error';

import { HomeTrustActivitySection } from '../components/HomeTrustActivitySection';
import { homeReadyModes, type HomeReadyMode } from '../home-dashboard-service';
import { useHomeRepository } from '../runtime/HomeRepositoryProvider';
import {
  HomeContextCards,
  HomeDashboardHeader,
  HomeMatchHero,
  HomeModePicker,
  HomeRecentActivity,
} from './home-dashboard-reference-sections';
import { homeDashboardStyles as styles } from './home-dashboard.styles';
import { homeUi } from '../ui/home-ui';

const defaultMode: HomeReadyMode = homeReadyModes.find(
  (mode) => mode.id === 'soulmate',
) ?? {
  accent: homeUi.gradients.modes.soulmate[0],
  description: 'Tìm người hợp vibe và đồng hành lâu dài.',
  id: 'soulmate',
  label: 'Tri kỉ',
};

export default function HomeDashboardScreen() {
  usePreloadAssetSurface('home');
  const { width: viewportWidth } = useWindowDimensions();
  const compactLayout = isCompactViewport(viewportWidth);
  const { session } = useAuth();
  const homeRepository = useHomeRepository();
  const {
    commandService: playSessionCommandService,
    repository: playSessionRepository,
  } = usePlaySessionServices();
  const queryClient = useQueryClient();

  const currentPlaySessionsQuery = useQuery({
    enabled: Boolean(session?.principal?.playerId && session.lifecycle),
    queryFn: async () =>
      playSessionRepository.listCurrent(resolvePlaySessionActor(session)),
    queryKey: playSessionQueryKeys.current(
      session?.lifecycle?.playerId ?? 'anonymous',
    ),
  });
  const createSessionFromMatch = useMutation({
    mutationFn: async ({
      command,
    }: {
      command: Parameters<typeof playSessionCommandService.createFromMatch>[1];
    }) =>
      playSessionCommandService.createFromMatch(
        resolvePlaySessionActor(session),
        command,
      ),
    onSuccess: async (receipt) => {
      await queryClient.invalidateQueries({
        queryKey: playSessionQueryKeys.current(
          session?.lifecycle?.playerId ?? 'anonymous',
        ),
      });
      router.push(appRoutes.sessions.detail(receipt.aggregateId));
    },
    retry: false,
  });

  const notificationSummaryQuery = useNotificationInboxSummary(session);
  const hasUnreadNotifications =
    (notificationSummaryQuery.data?.unseenCount ?? 0) > 0;
  const currentMatchIntentQuery = useCurrentMatchIntentQuery();
  const activateMatchIntent = useActivateMatchIntentMutation();
  const pauseMatchIntent = usePauseMatchIntentMutation();
  const currentMatchIntent = currentMatchIntentQuery.data ?? null;
  const readyEnabled = isMatchIntentActive(currentMatchIntent);
  const [selectedModeOverride, setSelectedModeOverride] = useState<
    HomeReadyMode['id'] | null
  >(null);
  const selectedModeId =
    selectedModeOverride ??
    moodForMatchIntent(currentMatchIntent) ??
    'soulmate';

  const dashboardQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return homeRepository.getDashboard(session);
    },
    queryKey: ['home-dashboard', session?.user.id],
  });

  const dashboard = dashboardQuery.data;
  const dashboardFailure = classifyApplicationError(dashboardQuery.error);
  const selectedMode = useMemo(
    () =>
      homeReadyModes.find((mode) => mode.id === selectedModeId) ?? defaultMode,
    [selectedModeId],
  );
  const readinessPending =
    activateMatchIntent.isPending || pauseMatchIntent.isPending;
  const readinessError =
    activateMatchIntent.error ??
    pauseMatchIntent.error ??
    currentMatchIntentQuery.error;

  const selectMode = (modeId: HomeReadyMode['id']) => {
    if (readinessPending) return;
    selectionImpact();
    setSelectedModeOverride(modeId);
    if (!readyEnabled || !currentMatchIntent) return;
    activateMatchIntent.mutate(
      {
        expectedVersion: currentMatchIntent.version,
        filters: matchIntentFiltersForMood(modeId),
      },
      {
        onError: () => {
          setSelectedModeOverride(null);
          void currentMatchIntentQuery.refetch();
        },
        onSuccess: () => setSelectedModeOverride(null),
      },
    );
  };

  const toggleReady = () => {
    if (readinessPending) return;
    impactLight();
    if (readyEnabled && currentMatchIntent) {
      pauseMatchIntent.mutate(
        { expectedVersion: currentMatchIntent.version },
        { onError: () => void currentMatchIntentQuery.refetch() },
      );
      return;
    }
    activateMatchIntent.mutate(
      {
        ...(currentMatchIntent
          ? { expectedVersion: currentMatchIntent.version }
          : {}),
        filters: matchIntentFiltersForMood(selectedModeId),
      },
      {
        onError: () => {
          setSelectedModeOverride(null);
          void currentMatchIntentQuery.refetch();
        },
        onSuccess: () => setSelectedModeOverride(null),
      },
    );
  };

  if (!session) {
    return (
      <HomeDashboardQueryState
        description="Phiên đăng nhập không còn hợp lệ."
        title="Không thể mở Trang chủ"
      />
    );
  }

  if (!dashboard) {
    return (
      <HomeDashboardQueryState
        description={
          !dashboardQuery.error
            ? 'Đang đồng bộ hồ sơ và các kết nối của bạn.'
            : dashboardFailure.kind === 'offline'
              ? 'Thiết bị đang offline. Kết nối lại để tải Trang chủ.'
              : dashboardFailure.retryable
                ? 'Dữ liệu Trang chủ tạm thời chưa sẵn sàng. Hãy thử lại.'
                : 'Yêu cầu Trang chủ không thể hoàn tất. Ứng dụng không dùng preview để che lỗi này.'
        }
        loading={!dashboardQuery.error}
        onRetry={
          dashboardFailure.retryable
            ? () => void dashboardQuery.refetch()
            : undefined
        }
        title={
          dashboardQuery.error
            ? 'Không thể tải Trang chủ'
            : 'Đang tải Trang chủ'
        }
      />
    );
  }

  const primaryMatch = dashboard.matchedSets[0];
  const currentPlaySession = currentPlaySessionsQuery.data?.[0] ?? null;

  const openPrimaryMatchProfile = () => {
    if (!primaryMatch) return;
    selectionImpact();
    const identity = primaryMatch.playerId ?? primaryMatch.profileId;
    if (!identity) return;
    router.push(
      primaryMatch.playerId
        ? appRoutes.profile.playerDetail(primaryMatch.playerId)
        : appRoutes.profile.detail(identity),
    );
  };

  const openRoom = () => {
    selectionImpact();
    if (primaryMatch?.conversationId) {
      router.push(appRoutes.messages.detail(primaryMatch.conversationId));
      return;
    }
    if (primaryMatch) {
      router.push(
        appRoutes.discover.matchDetail(canonicalMatchId(primaryMatch.id)),
      );
      return;
    }
    router.push(appRoutes.main.messages);
  };

  const openOrCreateUpcomingSession = () => {
    impactLight();
    if (currentPlaySession) {
      router.push(appRoutes.sessions.detail(currentPlaySession.sessionId));
      return;
    }
    if (!primaryMatch) {
      router.push(appRoutes.sessions.entry);
      return;
    }
    createSessionFromMatch.mutate({
      command: {
        ...prepareCoreV2CommandMetadata(0),
        capacity: 2,
        matchId: canonicalMatchId(primaryMatch.id),
        scheduledFor: null,
        timezone: resolvedTimezone(),
        title: `Phòng với ${primaryMatch.name}`,
      },
    });
  };

  return (
    <AppScreen
      contentContainerStyle={[
        styles.scrollContent,
        compactLayout && styles.scrollContentCompact,
      ]}
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            void Promise.all([
              dashboardQuery.refetch(),
              currentMatchIntentQuery.refetch(),
              currentPlaySessionsQuery.refetch(),
            ]);
          }}
          refreshing={
            dashboardQuery.isFetching ||
            currentMatchIntentQuery.isFetching ||
            currentPlaySessionsQuery.isFetching
          }
          tintColor={appColors.accent.purple}
        />
      }
      withBottomNavPadding={false}
      withHeader={false}
    >
      <HomeDashboardHeader
        compact={compactLayout}
        hasUnreadNotifications={hasUnreadNotifications}
        onGiftPress={() => {
          selectionImpact();
          router.push(appRoutes.profile.reputation);
        }}
        onNotificationsPress={() => {
          selectionImpact();
          router.push(appRoutes.notifications);
        }}
        profile={dashboard.currentProfile}
        readyEnabled={readyEnabled}
      />

      {dashboardQuery.isError ? (
        <View style={styles.previewBanner}>
          <Ionicons
            color={appColors.status.warning}
            name="information-circle"
            size={16}
          />
          <Text maxFontSizeMultiplier={1} style={styles.previewText}>
            Không thể làm mới. Đang hiển thị dữ liệu đã tải gần nhất.
          </Text>
        </View>
      ) : null}

      <HomeMatchHero
        activeMatchCount={dashboard.matchedSets.length}
        compact={compactLayout}
        onToggleReady={toggleReady}
        pending={readinessPending}
        readyEnabled={readyEnabled}
        selectedMode={selectedMode}
      />

      <HomeModePicker
        compact={compactLayout}
        modes={homeReadyModes}
        onSelect={selectMode}
        pending={readinessPending}
        selectedModeId={selectedModeId}
      />

      {readinessError ? (
        <Text
          accessibilityRole="alert"
          maxFontSizeMultiplier={1}
          style={styles.readinessError}
        >
          Trạng thái ghép vừa thay đổi hoặc chưa thể đồng bộ. Hãy kiểm tra lại.
        </Text>
      ) : null}

      <HomeContextCards
        compact={compactLayout}
        creatingSession={createSessionFromMatch.isPending}
        currentSession={currentPlaySession}
        loadingSession={currentPlaySessionsQuery.isLoading}
        onOpenMatchProfile={openPrimaryMatchProfile}
        onOpenRoom={openRoom}
        onUpcomingAction={openOrCreateUpcomingSession}
        primaryMatch={primaryMatch}
        selectedMode={selectedMode}
      />

      {createSessionFromMatch.error ? (
        <Text
          accessibilityRole="alert"
          maxFontSizeMultiplier={1}
          style={styles.readinessError}
        >
          Chưa thể tạo phòng. Lệnh không bị nhân đôi; hãy thử lại.
        </Text>
      ) : null}

      <HomeRecentActivity
        compact={compactLayout}
        onViewAll={() => {
          selectionImpact();
          router.push(appRoutes.sessions.entry);
        }}
      />

      <HomeTrustActivitySection session={session} />
    </AppScreen>
  );
}

function HomeDashboardQueryState({
  description,
  loading = false,
  onRetry,
  title,
}: {
  description: string;
  loading?: boolean;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <AppScreen
      contentContainerStyle={styles.queryStateScreen}
      withBottomNavPadding={false}
      withHeader={false}
    >
      {loading ? (
        <ActivityIndicator color={appColors.accent.purple} size="large" />
      ) : null}
      <Text maxFontSizeMultiplier={1} style={styles.queryStateTitle}>
        {title}
      </Text>
      <Text maxFontSizeMultiplier={1} style={styles.queryStateDescription}>
        {description}
      </Text>
      {!loading && onRetry ? (
        <AppButton accessibilityLabel="Thử tải lại Trang chủ" onPress={onRetry}>
          Thử lại
        </AppButton>
      ) : null}
    </AppScreen>
  );
}

function canonicalMatchId(value: string) {
  const parsed = MatchIdSchema.safeParse(value);
  return parsed.success ? parsed.data : simulationMatchIdToMatchId(value);
}

function resolvedTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok';
}

function impactLight() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
}

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}
