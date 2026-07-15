import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { usePlaySessionServices } from '@/entities/play-session';
import { useAuth } from '@/shared/auth/auth-context';
import {
  PlaySessionIdSchema,
  type CancelSessionCommandV2,
  type OpenReadyCheckCommandV2,
  type ProposeSessionCompletionCommandV2,
  type RespondReadyCheckCommandV2,
  type ScheduleSessionCommandV2,
  type StartSessionCommandV2,
} from '@/shared/contracts/core-v2';
import { LiquidButton, LiquidCard } from '@/shared/components/liquid';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import {
  prepareCoreV2CommandMetadata,
  usePlaySessionCommandMutation,
  usePlaySessionDetail,
} from '../queries/play-session-queries';

export function PlaySessionDetailScreen() {
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const parsedId = PlaySessionIdSchema.safeParse(params.sessionId);
  const sessionId = parsedId.success ? parsedId.data : null;
  const detail = usePlaySessionDetail(sessionId);
  const { session: authSession } = useAuth();
  const { commandService } = usePlaySessionServices();
  const openReady = usePlaySessionCommandMutation<OpenReadyCheckCommandV2>(
    (actor, command) => commandService.openReadyCheck(actor, command),
  );
  const respond = usePlaySessionCommandMutation<RespondReadyCheckCommandV2>(
    (actor, command) => commandService.respondReadyCheck(actor, command),
  );
  const schedule = usePlaySessionCommandMutation<ScheduleSessionCommandV2>(
    (actor, command) => commandService.schedule(actor, command),
  );
  const start = usePlaySessionCommandMutation<StartSessionCommandV2>(
    (actor, command) => commandService.start(actor, command),
  );
  const complete =
    usePlaySessionCommandMutation<ProposeSessionCompletionCommandV2>(
      (actor, command) => commandService.proposeCompletion(actor, command),
    );
  const cancel = usePlaySessionCommandMutation<CancelSessionCommandV2>(
    (actor, command) => commandService.cancel(actor, command),
  );
  const snapshot = detail.data;
  const actorPlayerId = authSession?.principal?.playerId;
  const isOwner = snapshot?.ownerPlayerId === actorPlayerId;
  const activeMember = snapshot?.members.some(
    (member) => member.playerId === actorPlayerId && member.state === 'active',
  );
  const pendingError =
    openReady.error ??
    respond.error ??
    schedule.error ??
    start.error ??
    complete.error ??
    cancel.error;

  if (!sessionId) {
    return (
      <LiquidScreen title="Session không hợp lệ">
        <Text style={styles.error}>PlaySessionId không đúng contract.</Text>
      </LiquidScreen>
    );
  }
  if (detail.error && !snapshot) {
    return (
      <LiquidScreen title="Không thể tải Session">
        <Text accessibilityRole="alert" style={styles.error}>
          {detail.error.message}
        </Text>
        <LiquidButton onPress={() => void detail.refetch()} variant="ghost">
          Thử lại
        </LiquidButton>
      </LiquidScreen>
    );
  }
  if (detail.isLoading || !snapshot) {
    return (
      <LiquidScreen title="Đang tải Session">
        <ActivityIndicator color={liquidColors.text.primary} />
      </LiquidScreen>
    );
  }

  const commandMeta = () => prepareCoreV2CommandMetadata(snapshot.version);
  return (
    <LiquidScreen
      subtitle={`${snapshot.state.replaceAll('_', ' ')} · aggregate v${snapshot.version} · membership v${snapshot.membershipVersion}`}
      title={snapshot.title}
    >
      <LiquidCard variant="purple">
        <Text style={styles.heading}>Thành viên</Text>
        {snapshot.members.map((member) => (
          <View
            key={`${member.playerId}:${member.joinedAt}`}
            style={styles.memberRow}
          >
            <View style={styles.grow}>
              <Text style={styles.memberId}>{member.playerId}</Text>
              <Text style={styles.meta}>
                {member.role} · {member.state}
              </Text>
            </View>
            <LiquidButton
              onPress={() =>
                router.push(appRoutes.profile.playerDetail(member.playerId))
              }
              variant="ghost"
            >
              Hồ sơ
            </LiquidButton>
          </View>
        ))}
      </LiquidCard>

      <LiquidCard style={styles.card} variant="cyan">
        <Text style={styles.heading}>Communication</Text>
        <Text style={styles.meta}>
          {snapshot.communication.status} · membership v
          {snapshot.communication.membershipVersion}
        </Text>
        {snapshot.communication.conversationId ? (
          <LiquidButton
            onPress={() =>
              router.push(
                appRoutes.sessions.conversation(
                  snapshot.communication.conversationId!,
                ),
              )
            }
            style={styles.action}
            variant="rank"
          >
            Mở trò chuyện Session
          </LiquidButton>
        ) : null}
      </LiquidCard>

      <Text style={styles.heading}>Điều phối</Text>
      <View style={styles.actions}>
        {isOwner && ['recruiting', 'scheduled'].includes(snapshot.state) ? (
          <LiquidButton
            onPress={() =>
              schedule.mutate({
                ...commandMeta(),
                scheduledFor: new Date(Date.now() + 30 * 60_000).toISOString(),
                sessionId,
                timezone:
                  Intl.DateTimeFormat().resolvedOptions().timeZone ||
                  'Asia/Bangkok',
              })
            }
            variant="ghost"
          >
            Hẹn sau 30 phút
          </LiquidButton>
        ) : null}
        {isOwner && ['recruiting', 'scheduled'].includes(snapshot.state) ? (
          <LiquidButton
            onPress={() =>
              openReady.mutate({
                ...commandMeta(),
                deadlineAt: new Date(Date.now() + 5 * 60_000).toISOString(),
                sessionId,
              })
            }
          >
            Mở ready-check
          </LiquidButton>
        ) : null}
        {activeMember && snapshot.readyCheck?.state === 'open' ? (
          <>
            <LiquidButton
              onPress={() =>
                respond.mutate({
                  ...commandMeta(),
                  checkId: snapshot.readyCheck!.checkId,
                  response: 'ready',
                  sessionId,
                })
              }
              variant="rank"
            >
              Tôi sẵn sàng
            </LiquidButton>
            <LiquidButton
              onPress={() =>
                respond.mutate({
                  ...commandMeta(),
                  checkId: snapshot.readyCheck!.checkId,
                  response: 'not_ready',
                  sessionId,
                })
              }
              variant="ghost"
            >
              Chưa sẵn sàng
            </LiquidButton>
          </>
        ) : null}
        {isOwner && snapshot.state === 'scheduled' ? (
          <LiquidButton
            onPress={() => start.mutate({ ...commandMeta(), sessionId })}
          >
            Bắt đầu chơi
          </LiquidButton>
        ) : null}
        {activeMember &&
        ['in_progress', 'completion_pending'].includes(snapshot.state) ? (
          <>
            <LiquidButton
              onPress={() =>
                complete.mutate({
                  ...commandMeta(),
                  claim: 'completed',
                  reasonCode: null,
                  sessionId,
                })
              }
              variant="rank"
            >
              Xác nhận đã chơi xong
            </LiquidButton>
            <LiquidButton
              onPress={() =>
                complete.mutate({
                  ...commandMeta(),
                  claim: 'disputed',
                  reasonCode: 'outcome_disputed',
                  sessionId,
                })
              }
              variant="ghost"
            >
              Báo tranh chấp
            </LiquidButton>
          </>
        ) : null}
        {isOwner &&
        !['completed', 'cancelled', 'disputed'].includes(snapshot.state) ? (
          <LiquidButton
            onPress={() =>
              cancel.mutate({
                ...commandMeta(),
                reason: 'owner_cancelled',
                sessionId,
              })
            }
            variant="secondary"
          >
            Hủy Session
          </LiquidButton>
        ) : null}
      </View>
      {pendingError ? (
        <Text style={styles.error}>{pendingError.message}</Text>
      ) : null}
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: 12 },
  actions: { gap: 10, marginTop: 12 },
  card: { marginTop: 14 },
  error: { color: '#FF9CB5', marginTop: 12 },
  grow: { flex: 1 },
  heading: {
    ...liquidTypography.sectionTitle,
    color: liquidColors.text.primary,
    marginTop: 16,
  },
  memberId: {
    ...liquidTypography.cardTitle,
    color: liquidColors.text.primary,
  },
  memberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  meta: { ...liquidTypography.body, marginTop: 3 },
});
