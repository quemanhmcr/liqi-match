import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { usePlayerIdentities } from '@/entities/player-identity';
import { usePlaySessionServices } from '@/entities/play-session';
import { FriendPlayerPickerModal } from '@/entities/social-relationship/ui';
import { useAuth } from '@/shared/auth/auth-context';
import type { PlayerId } from '@/shared/contracts/core-v1';
import {
  PlaySessionIdSchema,
  type AssignSessionRoleCommandV2,
  type CancelSessionCommandV2,
  type InviteToSessionCommandV2,
  type LeaveSessionCommandV2,
  type OpenReadyCheckCommandV2,
  type ProposeSessionCompletionCommandV2,
  type RemoveSessionMemberCommandV2,
  type RespondReadyCheckCommandV2,
  type ScheduleSessionCommandV2,
  type StartSessionCommandV2,
} from '@/shared/contracts/core-v2';
import { LiqiButton, LiqiCard, LiqiChip } from '@/shared/components/liqi';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';

import {
  prepareCoreV2CommandMetadata,
  usePlaySessionCommandMutation,
  usePlaySessionDetail,
} from '../queries/play-session-queries';

const roleChoices = ['top', 'jungle', 'mid', 'marksman', 'support'] as const;

export function PlaySessionDetailScreen() {
  const params = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const rawSessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;
  const parsedId = PlaySessionIdSchema.safeParse(rawSessionId);
  const sessionId = parsedId.success ? parsedId.data : null;
  const detail = usePlaySessionDetail(sessionId);
  const { session: authSession } = useAuth();
  const { commandService } = usePlaySessionServices();
  const [invitePickerVisible, setInvitePickerVisible] = useState(false);
  const [selectedInvitees, setSelectedInvitees] = useState<readonly PlayerId[]>(
    [],
  );
  const [readyMinutes, setReadyMinutes] = useState(10);
  const snapshot = detail.data;
  const identities = usePlayerIdentities(
    snapshot?.members.map((member) => member.playerId) ?? [],
  );
  const identityById = new Map(
    (identities.data ?? []).map((identity) => [identity.playerId, identity]),
  );

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
  const invite = usePlaySessionCommandMutation<InviteToSessionCommandV2>(
    (actor, command) => commandService.invite(actor, command),
    {
      onSuccess: () => {
        setSelectedInvitees([]);
        setInvitePickerVisible(false);
      },
    },
  );
  const leave = usePlaySessionCommandMutation<LeaveSessionCommandV2>(
    (actor, command) => commandService.leave(actor, command),
    { onSuccess: () => router.replace(appRoutes.sessions.list) },
  );
  const remove = usePlaySessionCommandMutation<RemoveSessionMemberCommandV2>(
    (actor, command) => commandService.removeMember(actor, command),
  );
  const assignRole = usePlaySessionCommandMutation<AssignSessionRoleCommandV2>(
    (actor, command) => commandService.assignRole(actor, command),
  );

  if (!sessionId)
    return (
      <SessionState
        title="Buổi chơi không hợp lệ"
        description="Liên kết này không còn đúng định dạng."
      />
    );
  if (detail.error && !snapshot)
    return (
      <SessionState
        title="Chưa thể mở buổi chơi"
        description="Quyền truy cập có thể đã thay đổi hoặc kết nối đang gián đoạn."
        onRetry={() => void detail.refetch()}
      />
    );
  if (detail.isLoading || !snapshot)
    return (
      <SessionState
        loading
        title="Đang mở buổi chơi"
        description="LIQI đang đồng bộ thành viên và trạng thái mới nhất."
      />
    );

  const actorPlayerId = authSession?.principal?.playerId;
  const isOwner = snapshot.ownerPlayerId === actorPlayerId;
  const activeMembers = snapshot.members.filter(
    (member) => member.state === 'active',
  );
  const activeMember = activeMembers.some(
    (member) => member.playerId === actorPlayerId,
  );
  const canManageMembers = isOwner && snapshot.state === 'recruiting';
  const canInvite =
    canManageMembers && activeMembers.length < snapshot.capacity;
  const commandMeta = () => prepareCoreV2CommandMetadata(snapshot.version);
  const pendingError =
    openReady.error ??
    respond.error ??
    schedule.error ??
    start.error ??
    complete.error ??
    cancel.error ??
    invite.error ??
    leave.error ??
    remove.error ??
    assignRole.error;
  const busy =
    openReady.isPending ||
    respond.isPending ||
    schedule.isPending ||
    start.isPending ||
    complete.isPending ||
    cancel.isPending ||
    invite.isPending ||
    leave.isPending ||
    remove.isPending ||
    assignRole.isPending;

  const sendInvites = async (playerIds: readonly PlayerId[]) => {
    let version = snapshot.version;
    for (const playerId of playerIds) {
      const receipt = await commandService.invite(
        {
          lifecycle: authSession!.lifecycle!,
          principal: authSession!.principal!,
        },
        {
          ...prepareCoreV2CommandMetadata(version),
          sessionId,
          targetPlayerId: playerId,
        },
      );
      version = receipt.aggregateVersion;
    }
    setSelectedInvitees([]);
    setInvitePickerVisible(false);
    await detail.refetch();
  };

  return (
    <LiqiScreen
      contentContainerStyle={styles.screen}
      subtitle={sessionStateLabel(snapshot.state)}
      title={snapshot.title}
    >
      <LiqiCard
        contentStyle={styles.hero}
        radius={28}
        variant="purple"
        withHighlight
      >
        <View style={styles.heroIcon}>
          <Ionicons color="#D9C6FF" name="game-controller" size={28} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>
            {activeMembers.length}/{snapshot.capacity} thành viên
          </Text>
          <Text style={styles.heroMeta}>
            {scheduleLabel(snapshot.scheduledFor)} ·{' '}
            {sourceLabel(snapshot.source.kind)}
          </Text>
        </View>
        {canInvite ? (
          <LiqiButton
            onPress={() => setInvitePickerVisible(true)}
            variant="ghost"
          >
            Mời bạn
          </LiqiButton>
        ) : null}
      </LiqiCard>

      {snapshot.communication.conversationId ? (
        <Pressable
          accessibilityLabel="Mở trò chuyện của buổi chơi"
          accessibilityRole="button"
          onPress={() =>
            router.push(
              appRoutes.messages.detail(snapshot.communication.conversationId!),
            )
          }
          style={({ pressed }) => pressed && styles.pressed}
        >
          <LiqiCard
            contentStyle={styles.chatCard}
            density="compact"
            radius={22}
            variant="cyan"
            withShadow={false}
          >
            <View style={styles.chatIcon}>
              <Ionicons color="#9DE4F4" name="chatbubbles-outline" size={20} />
            </View>
            <View style={styles.grow}>
              <Text style={styles.cardTitle}>Trò chuyện cả đội</Text>
              <Text style={styles.cardMeta}>
                Tin nhắn, ảnh, trạng thái đã nhận và đã xem
              </Text>
            </View>
            <Ionicons
              color="rgba(217,226,247,0.42)"
              name="chevron-forward"
              size={18}
            />
          </LiqiCard>
        </Pressable>
      ) : (
        <LiqiCard
          contentStyle={styles.note}
          density="compact"
          radius={20}
          variant="cyan"
          withShadow={false}
        >
          <Ionicons color="#9DE4F4" name="hourglass-outline" size={18} />
          <Text style={styles.noteText}>
            Trò chuyện nhóm đang được chuẩn bị và sẽ xuất hiện khi thành viên đã
            đồng bộ.
          </Text>
        </LiqiCard>
      )}

      <SectionTitle icon="people-outline">Thành viên</SectionTitle>
      <LiqiCard
        contentStyle={styles.membersCard}
        radius={25}
        variant="purple"
        withShadow={false}
      >
        {activeMembers.map((member, index) => {
          const identity = identityById.get(member.playerId);
          const roleAssignment = snapshot.roleAssignments.find(
            (assignment) => assignment.playerId === member.playerId,
          );
          const self = member.playerId === actorPlayerId;
          return (
            <View key={member.playerId} style={styles.memberBlock}>
              <View style={styles.memberRow}>
                <View style={styles.avatar}>
                  {identity?.avatarUrl ? (
                    <Image
                      source={{ uri: identity.avatarUrl }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <Text style={styles.initial}>
                      {identity?.displayName.slice(0, 1).toUpperCase() ??
                        index + 1}
                    </Text>
                  )}
                </View>
                <Pressable
                  accessibilityLabel={`Mở hồ sơ ${identity?.displayName ?? 'người chơi'}`}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push(appRoutes.profile.playerDetail(member.playerId))
                  }
                  style={styles.memberCopy}
                >
                  <Text numberOfLines={1} style={styles.memberName}>
                    {self
                      ? 'Bạn'
                      : (identity?.displayName ?? `Đồng đội ${index + 1}`)}
                  </Text>
                  <Text style={styles.memberMeta}>
                    {member.role === 'owner'
                      ? 'Chủ đội'
                      : roleLabel(roleAssignment?.roleSlug)}
                  </Text>
                </Pressable>
                {canManageMembers && !self && member.role !== 'owner' ? (
                  <LiqiButton
                    disabled={busy}
                    onPress={() =>
                      remove.mutate({
                        ...commandMeta(),
                        memberPlayerId: member.playerId,
                        reasonCode: 'owner_removed',
                        sessionId,
                      })
                    }
                    variant="ghost"
                  >
                    Mời rời đội
                  </LiqiButton>
                ) : null}
              </View>
              {isOwner &&
              ['recruiting', 'scheduled'].includes(snapshot.state) ? (
                <View style={styles.roleRow}>
                  {roleChoices.map((role) => (
                    <LiqiChip
                      key={role}
                      onPress={() =>
                        assignRole.mutate({
                          ...commandMeta(),
                          memberPlayerId: member.playerId,
                          roleSlug: role,
                          sessionId,
                        })
                      }
                      selected={roleAssignment?.roleSlug === role}
                      variant="purple"
                    >
                      {roleLabel(role)}
                    </LiqiChip>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </LiqiCard>

      {isOwner && ['recruiting', 'scheduled'].includes(snapshot.state) ? (
        <>
          <SectionTitle icon="calendar-outline">Lịch chơi</SectionTitle>
          <View style={styles.wrapRow}>
            {(
              [
                [30, 'Sau 30 phút'],
                [120, 'Sau 2 giờ'],
                [1440, 'Tối mai'],
              ] as const
            ).map(([minutes, label]) => (
              <LiqiButton
                disabled={busy}
                key={minutes}
                onPress={() =>
                  schedule.mutate({
                    ...commandMeta(),
                    scheduledFor: scheduleAfter(minutes),
                    sessionId,
                    timezone: resolvedTimezone(),
                  })
                }
                variant="ghost"
              >
                {label}
              </LiqiButton>
            ))}
          </View>

          <SectionTitle icon="checkmark-done-outline">
            Kiểm tra sẵn sàng
          </SectionTitle>
          <View style={styles.wrapRow}>
            {[5, 10, 15].map((minutes) => (
              <LiqiChip
                key={minutes}
                onPress={() => setReadyMinutes(minutes)}
                selected={readyMinutes === minutes}
                variant="cyan"
              >
                {minutes} phút
              </LiqiChip>
            ))}
          </View>
          <LiqiButton
            disabled={busy}
            onPress={() =>
              openReady.mutate({
                ...commandMeta(),
                deadlineAt: new Date(
                  Date.now() + readyMinutes * 60_000,
                ).toISOString(),
                sessionId,
              })
            }
          >
            Mở kiểm tra sẵn sàng
          </LiqiButton>
        </>
      ) : null}

      {activeMember && snapshot.readyCheck?.state === 'open' ? (
        <LiqiCard contentStyle={styles.readyCard} radius={24} variant="cyan">
          <View style={styles.readyCopy}>
            <Text style={styles.cardTitle}>Bạn đã sẵn sàng?</Text>
            <Text style={styles.cardMeta}>
              Phản hồi trước {formatTime(snapshot.readyCheck.deadlineAt)}
            </Text>
          </View>
          <View style={styles.wrapRow}>
            <LiqiButton
              disabled={busy}
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
            </LiqiButton>
            <LiqiButton
              disabled={busy}
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
            </LiqiButton>
          </View>
        </LiqiCard>
      ) : null}

      <SectionTitle icon="flash-outline">Hành động</SectionTitle>
      <View style={styles.actions}>
        {isOwner && snapshot.state === 'scheduled' ? (
          <LiqiButton
            disabled={busy}
            onPress={() => start.mutate({ ...commandMeta(), sessionId })}
          >
            Bắt đầu chơi
          </LiqiButton>
        ) : null}
        {activeMember &&
        ['in_progress', 'completion_pending'].includes(snapshot.state) ? (
          <>
            <LiqiButton
              disabled={busy}
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
            </LiqiButton>
            <LiqiButton
              disabled={busy}
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
              Báo kết quả chưa đúng
            </LiqiButton>
          </>
        ) : null}
        {['completed', 'disputed'].includes(snapshot.state) ? (
          <LiqiButton
            onPress={() => router.push(appRoutes.sessions.feedback(sessionId))}
            variant="primary"
          >
            Gửi đánh giá đồng đội
          </LiqiButton>
        ) : null}
        {activeMember &&
        !isOwner &&
        ['recruiting', 'scheduled'].includes(snapshot.state) ? (
          <LiqiButton
            disabled={busy}
            onPress={() => leave.mutate({ ...commandMeta(), sessionId })}
            variant="ghost"
          >
            Rời buổi chơi
          </LiqiButton>
        ) : null}
        {isOwner &&
        !['completed', 'cancelled', 'disputed'].includes(snapshot.state) ? (
          <LiqiButton
            disabled={busy}
            onPress={() =>
              cancel.mutate({
                ...commandMeta(),
                reason: 'owner_cancelled',
                sessionId,
              })
            }
            variant="secondary"
          >
            Huỷ buổi chơi
          </LiqiButton>
        ) : null}
      </View>

      {pendingError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          Dữ liệu vừa thay đổi hoặc thao tác chưa thể hoàn tất. Hãy kiểm tra
          trạng thái mới nhất.
        </Text>
      ) : null}

      <FriendPlayerPickerModal
        excludedPlayerIds={snapshot.members.map((member) => member.playerId)}
        maxSelected={Math.max(1, snapshot.capacity - activeMembers.length)}
        onClose={() => setInvitePickerVisible(false)}
        onConfirm={(playerIds) => {
          void sendInvites(playerIds);
        }}
        purpose="session"
        selectedPlayerIds={selectedInvitees}
        setSelectedPlayerIds={setSelectedInvitees}
        title="Mời thêm vào đội"
        visible={invitePickerVisible}
      />
    </LiqiScreen>
  );
}

function SessionState({
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
    <LiqiScreen
      contentContainerStyle={styles.stateScreen}
      title={title}
      withBottomNavPadding={false}
    >
      <LiqiCard contentStyle={styles.stateCard} radius={28} variant="purple">
        {loading ? (
          <ActivityIndicator color="#D3C0FF" />
        ) : (
          <Ionicons color="#D3C0FF" name="game-controller-outline" size={32} />
        )}
        <Text style={styles.stateText}>{description}</Text>
        {onRetry ? (
          <LiqiButton onPress={onRetry} variant="ghost">
            Thử lại
          </LiqiButton>
        ) : null}
        <LiqiButton
          onPress={() => router.replace(appRoutes.sessions.list)}
          variant="secondary"
        >
          Về danh sách buổi chơi
        </LiqiButton>
      </LiqiCard>
    </LiqiScreen>
  );
}
function SectionTitle({
  children,
  icon,
}: {
  children: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons color="#CBB6FF" name={icon} size={17} />
      <Text style={styles.sectionText}>{children}</Text>
    </View>
  );
}
function sessionStateLabel(value: string) {
  return (
    (
      {
        cancelled: 'Buổi chơi đã huỷ',
        completed: 'Đã hoàn tất',
        completion_pending: 'Đang xác nhận kết quả',
        disputed: 'Kết quả đang được xem xét',
        draft: 'Đang chuẩn bị',
        in_progress: 'Đang chơi',
        recruiting: 'Đang tìm thêm đồng đội',
        scheduled: 'Đã lên lịch',
      } as Record<string, string>
    )[value] ?? 'Buổi chơi'
  );
}
function sourceLabel(value: string) {
  return (
    (
      {
        manual: 'Tạo trực tiếp',
        match: 'Từ một kết nối',
        repeat_play: 'Chơi lại cùng đội',
        set: 'Từ Match Set',
      } as Record<string, string>
    )[value] ?? 'LIQI'
  );
}
function roleLabel(value?: string) {
  return (
    (
      {
        jungle: 'Đi rừng',
        marksman: 'Xạ thủ',
        mid: 'Đường giữa',
        support: 'Hỗ trợ',
        top: 'Đường trên',
      } as Record<string, string>
    )[value ?? ''] ?? 'Chưa chọn vai trò'
  );
}
function scheduleLabel(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Bắt đầu khi cả đội sẵn sàng';
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
function resolvedTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok';
}
function scheduleAfter(minutes: number) {
  const date = new Date();
  if (minutes === 1440) {
    date.setDate(date.getDate() + 1);
    date.setHours(20, 0, 0, 0);
  } else date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(130,91,220,0.17)',
    borderRadius: 19,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  avatarImage: { height: '100%', width: '100%' },
  cardMeta: { color: 'rgba(208,218,242,0.56)', fontSize: 10.5, lineHeight: 15 },
  cardTitle: { color: '#F4F1FF', fontSize: 14, fontWeight: '800' },
  chatCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    padding: 13,
  },
  chatIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(54,167,190,0.11)',
    borderRadius: 15,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  error: {
    color: '#FFB9C5',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  grow: { flex: 1 },
  hero: { alignItems: 'center', flexDirection: 'row', gap: 14, padding: 17 },
  heroCopy: { flex: 1, gap: 4 },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(132,91,225,0.17)',
    borderRadius: 23,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  heroMeta: { color: 'rgba(211,220,244,0.58)', fontSize: 10.5, lineHeight: 15 },
  heroTitle: { color: '#FAF8FF', fontSize: 18, fontWeight: '800' },
  initial: { color: '#E2D5FF', fontSize: 13, fontWeight: '800' },
  memberBlock: {
    borderBottomColor: 'rgba(211,221,246,0.07)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingVertical: 10,
  },
  memberCopy: { flex: 1, gap: 3, minWidth: 0 },
  memberMeta: { color: 'rgba(207,217,241,0.54)', fontSize: 10.5 },
  memberName: { color: '#F6F3FF', fontSize: 13.5, fontWeight: '800' },
  memberRow: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  membersCard: { paddingHorizontal: 14, paddingVertical: 3 },
  note: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    padding: 13,
  },
  noteText: {
    color: 'rgba(214,224,245,0.64)',
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
  },
  pressed: { opacity: 0.74, transform: [{ scale: 0.994 }] },
  readyCard: { gap: 12, padding: 16 },
  readyCopy: { gap: 4 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 55 },
  screen: { gap: 14 },
  sectionText: { color: '#F2EDFF', fontSize: 15.5, fontWeight: '800' },
  sectionTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 5,
  },
  stateCard: { alignItems: 'center', gap: 16, padding: 24 },
  stateScreen: { flexGrow: 1, justifyContent: 'center' },
  stateText: {
    color: 'rgba(218,225,247,0.68)',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
