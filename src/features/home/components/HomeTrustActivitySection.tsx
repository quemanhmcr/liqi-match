import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { usePlaySessionServices } from '@/entities/play-session';
import {
  createTrustMutationMetadataForSource,
  trustOutcomeQueryKeys,
  useDismissTrustActivity,
  useRepeatPlayRecommendations,
  useTrustActivityFeed,
  useTrustOutcomesServices,
} from '@/entities/trust-outcomes';
import { appRoutes } from '@/app-shell/navigation/routes';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  TrustActivityItemV2Schema,
  type TrustActivityItemV2,
} from '@/shared/contracts/core-v2';
import {
  LiquidButton,
  LiquidCard,
  LiquidSectionHeader,
} from '@/shared/components/liquid';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import { orchestrateRepeatSession } from '../services/repeat-session-orchestrator';

export function HomeTrustActivitySection({
  session,
}: {
  session: AuthSession;
}) {
  const activityQuery = useTrustActivityFeed(session, 6);
  const repeatRecommendationsQuery = useRepeatPlayRecommendations(session);
  const dismissMutation = useDismissTrustActivity(session);
  const trustServices = useTrustOutcomesServices();
  const { playSessionCommandService } = usePlaySessionServices();
  const queryClient = useQueryClient();
  const [createdSession, setCreatedSession] = useState<Readonly<{
    activityDismissed: boolean;
    activityItemId: string;
    sessionId: string;
  }> | null>(null);
  const [actionError, setActionError] = useState(false);
  const items = useMemo(() => {
    const allowedRepeatIds = new Set(
      (repeatRecommendationsQuery.data ?? []).map(
        (item) => item.activityItemId,
      ),
    );
    return (activityQuery.data ?? []).flatMap((item) => {
      const parsed = TrustActivityItemV2Schema.safeParse(item);
      if (!parsed.success) return [];
      if (
        parsed.data.kind === 'repeat_play_recommendation' &&
        (!repeatRecommendationsQuery.isSuccess ||
          !allowedRepeatIds.has(parsed.data.activityItemId))
      ) {
        return [];
      }
      if (parsed.data.activityItemId === createdSession?.activityItemId)
        return [];
      return [parsed.data];
    });
  }, [
    activityQuery.data,
    createdSession?.activityItemId,
    repeatRecommendationsQuery.data,
    repeatRecommendationsQuery.isSuccess,
  ]);

  const repeatMutation = useMutation({
    mutationFn: (activity: TrustActivityItemV2) =>
      orchestrateRepeatSession({
        activity,
        activityFeedRepository: trustServices.activityFeedRepository,
        authSession: session,
        playSessionCommandService,
        repeatPlayRecommendationProvider:
          trustServices.repeatPlayRecommendationProvider,
      }),
    onError: () => setActionError(true),
    onSuccess: async (result, activity) => {
      setActionError(false);
      setCreatedSession({
        activityDismissed: result.activityDismissed,
        activityItemId: activity.activityItemId,
        sessionId: result.playSession.session.sessionId,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trustOutcomeQueryKeys.activity(session.user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: trustOutcomeQueryKeys.recommendations(session.user.id),
        }),
      ]);
    },
  });

  if (!activityQuery.isLoading && !items.length && !createdSession) {
    return null;
  }

  return (
    <View style={styles.section}>
      <LiquidSectionHeader title="Hoạt động của bạn" />
      <Text style={styles.sectionSubtitle}>Từ session và trust facts thật</Text>

      {createdSession ? (
        <LiquidCard density="compact" style={styles.successCard}>
          <View style={styles.iconCircle}>
            <Ionicons color="#67E8FF" name="checkmark-done" size={20} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>Đã tạo session chơi lại</Text>
            <Text style={styles.body}>
              {createdSession.activityDismissed
                ? 'Lời mời đã được gửi. Mở Messages để tiếp tục phối hợp.'
                : 'Session đã được tạo. Activity cũ sẽ được đồng bộ lại; không cần tạo thêm session.'}
            </Text>
          </View>
          <LiquidButton
            onPress={() => router.push(appRoutes.main.messages)}
            variant="secondary"
          >
            Messages
          </LiquidButton>
        </LiquidCard>
      ) : null}

      {activityQuery.isLoading ? (
        <LiquidCard density="compact" style={styles.loadingCard}>
          <ActivityIndicator color="#67E8FF" />
          <Text style={styles.body}>Đang đồng bộ hoạt động...</Text>
        </LiquidCard>
      ) : null}

      {items.map((item) => (
        <ActivityCard
          actionPending={repeatMutation.isPending || dismissMutation.isPending}
          item={item}
          key={item.activityItemId}
          onAction={() => {
            void Haptics.selectionAsync().catch(() => undefined);
            if (item.kind === 'feedback_prompt') {
              router.push(appRoutes.trust.feedback(item.payload.sessionId));
              return;
            }
            if (item.kind === 'reputation_progress') {
              const playerId = session.principal?.playerId;
              if (playerId) router.push(appRoutes.profile.detail(playerId));
              return;
            }
            repeatMutation.mutate(item);
          }}
          onDismiss={() => {
            void Haptics.selectionAsync().catch(() => undefined);
            dismissMutation.mutate({
              ...createTrustMutationMetadataForSource(
                item.version,
                'dismiss-activity',
                item.activityItemId,
              ),
              activityItemId: item.activityItemId,
            });
          }}
        />
      ))}

      {activityQuery.isError ? (
        <LiquidCard density="compact" style={styles.errorCard}>
          <Text style={styles.errorText}>
            Chưa tải được hoạt động authoritative.
          </Text>
          <LiquidButton
            onPress={() => void activityQuery.refetch()}
            variant="secondary"
          >
            Tải lại
          </LiquidButton>
        </LiquidCard>
      ) : null}

      {actionError ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          Không thể tạo session. Dữ liệu không bị nhân đôi; hãy thử lại.
        </Text>
      ) : null}
    </View>
  );
}

function ActivityCard({
  actionPending,
  item,
  onAction,
  onDismiss,
}: {
  actionPending: boolean;
  item: TrustActivityItemV2;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const presentation = present(item);
  return (
    <LiquidCard density="compact" style={styles.card}>
      <View style={styles.iconCircle}>
        <Ionicons
          color={presentation.color}
          name={presentation.icon}
          size={20}
        />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{presentation.title}</Text>
        <Text style={styles.body}>{presentation.body}</Text>
        <View style={styles.actions}>
          <LiquidButton disabled={actionPending} onPress={onAction}>
            {presentation.action}
          </LiquidButton>
          <LiquidButton
            disabled={actionPending}
            onPress={onDismiss}
            variant="secondary"
          >
            Ẩn
          </LiquidButton>
        </View>
      </View>
    </LiquidCard>
  );
}

function present(item: TrustActivityItemV2): {
  action: string;
  body: string;
  color: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
} {
  switch (item.kind) {
    case 'feedback_prompt':
      return {
        action: 'Phản hồi',
        body: 'Xác nhận tham gia và ghi nhận đồng đội sau session.',
        color: '#67E8FF',
        icon: 'checkmark-done-outline',
        title: 'Hoàn tất phản hồi buổi chơi',
      };
    case 'reputation_progress':
      return {
        action: 'Xem hồ sơ',
        body: `Trust profile đã cập nhật ở phiên bản ${item.payload.projectionVersion}.`,
        color: '#BCA8FF',
        icon: 'shield-checkmark-outline',
        title: 'Thành tích đã xác minh mới',
      };
    case 'repeat_play_recommendation':
      return {
        action: 'Tạo session',
        body: `Bạn đã hoàn tất ${item.payload.completedSessionCount} buổi chơi cùng đồng đội này.`,
        color: '#FFD56A',
        icon: 'people-outline',
        title: 'Chơi lại cùng đồng đội',
      };
  }
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  body: { color: liquidColors.text.secondary, fontSize: 12, lineHeight: 17 },
  card: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  copy: { flex: 1, gap: 3 },
  errorCard: { alignItems: 'center', gap: 10 },
  errorText: { color: '#FFB4A9', fontSize: 12, lineHeight: 18 },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  loadingCard: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  section: { gap: 10 },
  sectionSubtitle: {
    color: liquidColors.text.secondary,
    fontSize: 12,
    lineHeight: 17,
  },
  successCard: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  title: { color: liquidColors.text.primary, fontSize: 14, fontWeight: '800' },
});
