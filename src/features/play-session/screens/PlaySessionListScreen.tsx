import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
import type {
  AcceptSessionInviteCommandV2,
  DeclineSessionInviteCommandV2,
} from '@/shared/contracts/core-v2';
import {
  LiquidButton,
  LiquidCard,
  LiquidChip,
} from '@/shared/components/liquid';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';

import {
  prepareCoreV2CommandMetadata,
  useCurrentPlaySessions,
  usePlaySessionCommandMutation,
  usePlaySessionInvites,
} from '../queries/play-session-queries';

export function PlaySessionListScreen() {
  const current = useCurrentPlaySessions();
  const invites = usePlaySessionInvites();
  const { commandService } = usePlaySessionServices();
  const identityIds = [
    ...(invites.data?.map((invite) => invite.inviterPlayerId) ?? []),
    ...(current.data?.flatMap((session) =>
      session.members.map((member) => member.playerId),
    ) ?? []),
  ];
  const identities = usePlayerIdentities(identityIds);
  const identityById = new Map(
    (identities.data ?? []).map((identity) => [identity.playerId, identity]),
  );
  const accept = usePlaySessionCommandMutation<AcceptSessionInviteCommandV2>(
    (actor, command) => commandService.acceptInvite(actor, command),
  );
  const decline = usePlaySessionCommandMutation<DeclineSessionInviteCommandV2>(
    (actor, command) => commandService.declineInvite(actor, command),
  );
  const loading = current.isLoading || invites.isLoading;
  const error = current.error ?? invites.error ?? accept.error ?? decline.error;
  const busy = accept.isPending || decline.isPending;

  return (
    <LiquidScreen
      contentContainerStyle={styles.screen}
      subtitle="Lời mời, lịch chơi và đội đang hoạt động"
      title="Buổi chơi"
    >
      <View style={styles.heroActions}>
        <LiquidButton
          onPress={() => router.push(appRoutes.sessions.create)}
          variant="primary"
        >
          <Ionicons color="#FFFFFF" name="add" size={17} />
          <Text style={styles.buttonText}>Tạo buổi chơi</Text>
        </LiquidButton>
        <LiquidButton
          onPress={() => router.push(appRoutes.sets.hub)}
          variant="ghost"
        >
          Set của tôi
        </LiquidButton>
      </View>

      <SectionTitle icon="mail-unread-outline">Lời mời đang chờ</SectionTitle>
      {invites.data?.map((invite) => {
        const inviter = identityById.get(invite.inviterPlayerId);
        return (
          <LiquidCard
            contentStyle={styles.inviteCard}
            key={invite.inviteId}
            radius={24}
            variant="cyan"
          >
            <View style={styles.inviteHeading}>
              <View style={styles.avatar}>
                {inviter?.avatarUrl ? (
                  <Image
                    source={{ uri: inviter.avatarUrl }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Ionicons color="#BEE8F1" name="person" size={21} />
                )}
              </View>
              <View style={styles.grow}>
                <Text style={styles.title}>{invite.session.title}</Text>
                <Text style={styles.meta}>
                  {inviter?.displayName ?? 'Một người chơi'} mời bạn ·{' '}
                  {
                    invite.session.members.filter(
                      (member) => member.state === 'active',
                    ).length
                  }
                  /{invite.session.capacity} thành viên
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <LiquidButton
                disabled={busy}
                onPress={() =>
                  accept.mutate({
                    ...prepareCoreV2CommandMetadata(invite.session.version),
                    inviteId: invite.inviteId,
                    sessionId: invite.sessionId,
                  })
                }
                variant="rank"
              >
                {accept.isPending ? 'Đang tham gia…' : 'Tham gia'}
              </LiquidButton>
              <LiquidButton
                disabled={busy}
                onPress={() =>
                  decline.mutate({
                    ...prepareCoreV2CommandMetadata(invite.session.version),
                    inviteId: invite.inviteId,
                    sessionId: invite.sessionId,
                  })
                }
                variant="ghost"
              >
                Từ chối
              </LiquidButton>
              <LiquidButton
                onPress={() =>
                  router.push(appRoutes.sessions.detail(invite.sessionId))
                }
                variant="ghost"
              >
                Xem chi tiết
              </LiquidButton>
            </View>
          </LiquidCard>
        );
      })}
      {!invites.data?.length && !loading ? (
        <EmptyState icon="mail-open-outline">
          Bạn không có lời mời nào đang chờ.
        </EmptyState>
      ) : null}

      <SectionTitle icon="game-controller-outline">Đang hoạt động</SectionTitle>
      {current.data?.map((session) => {
        const activeMembers = session.members.filter(
          (member) => member.state === 'active',
        );
        return (
          <Pressable
            accessibilityLabel={`Mở ${session.title}`}
            accessibilityRole="button"
            key={session.sessionId}
            onPress={() =>
              router.push(appRoutes.sessions.detail(session.sessionId))
            }
            style={({ pressed }) => pressed && styles.pressed}
          >
            <LiquidCard
              contentStyle={styles.sessionCard}
              radius={24}
              variant="purple"
            >
              <View style={styles.sessionIcon}>
                <Ionicons color="#D9C6FF" name="game-controller" size={23} />
              </View>
              <View style={styles.grow}>
                <View style={styles.titleRow}>
                  <Text numberOfLines={1} style={styles.title}>
                    {session.title}
                  </Text>
                  <LiquidChip
                    density="tag"
                    variant={
                      session.state === 'in_progress' ? 'cyan' : 'purple'
                    }
                  >
                    {stateLabel(session.state)}
                  </LiquidChip>
                </View>
                <Text style={styles.meta}>
                  {activeMembers.length}/{session.capacity} thành viên ·{' '}
                  {scheduleLabel(session.scheduledFor)}
                </Text>
                <View style={styles.avatarStack}>
                  {activeMembers.slice(0, 5).map((member, index) => (
                    <MiniAvatar
                      identity={identityById.get(member.playerId)}
                      index={index}
                      key={member.playerId}
                    />
                  ))}
                </View>
              </View>
              <Ionicons
                color="rgba(220,227,247,0.40)"
                name="chevron-forward"
                size={18}
              />
            </LiquidCard>
          </Pressable>
        );
      })}
      {!current.data?.length && !loading ? (
        <EmptyState icon="calendar-clear-outline">
          Chưa có buổi chơi đang hoạt động.
        </EmptyState>
      ) : null}

      {loading ? <ActivityIndicator color="#D3C0FF" /> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          Dữ liệu vừa thay đổi hoặc kết nối đang gián đoạn. Hãy tải lại để kiểm
          tra.
        </Text>
      ) : null}
      {error ? (
        <LiquidButton
          onPress={() => {
            void current.refetch();
            void invites.refetch();
          }}
          variant="secondary"
        >
          Thử lại
        </LiquidButton>
      ) : null}
    </LiquidScreen>
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
    <View style={styles.section}>
      <Ionicons color="#CBB6FF" name={icon} size={17} />
      <Text style={styles.sectionText}>{children}</Text>
    </View>
  );
}
function EmptyState({
  children,
  icon,
}: {
  children: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons color="rgba(197,207,235,0.38)" name={icon} size={25} />
      <Text style={styles.emptyText}>{children}</Text>
    </View>
  );
}
function MiniAvatar({
  identity,
  index,
}: {
  identity?: { avatarUrl: string | null; displayName: string };
  index: number;
}) {
  return (
    <View style={[styles.miniAvatar, { marginLeft: index ? -8 : 0 }]}>
      {identity?.avatarUrl ? (
        <Image
          source={{ uri: identity.avatarUrl }}
          style={styles.avatarImage}
        />
      ) : (
        <Text style={styles.initial}>
          {identity?.displayName.slice(0, 1).toUpperCase() ?? index + 1}
        </Text>
      )}
    </View>
  );
}
function stateLabel(state: string) {
  return (
    (
      {
        completion_pending: 'Xác nhận kết quả',
        draft: 'Đang chuẩn bị',
        in_progress: 'Đang chơi',
        recruiting: 'Đang tuyển',
        scheduled: 'Đã lên lịch',
      } as Record<string, string>
    )[state] ?? 'Đang hoạt động'
  );
}
function scheduleLabel(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Bắt đầu khi đủ người';
}
const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(55,167,190,0.11)',
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 42,
  },
  avatarImage: { height: '100%', width: '100%' },
  avatarStack: { flexDirection: 'row', marginTop: 7 },
  buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  emptyText: {
    color: 'rgba(210,219,243,0.55)',
    fontSize: 12,
    textAlign: 'center',
  },
  error: {
    color: '#FFB9C5',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  grow: { flex: 1, minWidth: 0 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  initial: { color: '#E2D5FF', fontSize: 10, fontWeight: '800' },
  inviteCard: { gap: 13, padding: 15 },
  inviteHeading: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  meta: {
    color: 'rgba(208,218,242,0.56)',
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 4,
  },
  miniAvatar: {
    alignItems: 'center',
    backgroundColor: '#31284F',
    borderColor: '#111527',
    borderRadius: 14,
    borderWidth: 2,
    height: 29,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 29,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.993 }] },
  screen: { gap: 13 },
  section: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  sectionText: { color: '#F1ECFF', fontSize: 16, fontWeight: '800' },
  sessionCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    padding: 15,
  },
  sessionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(132,91,225,0.16)',
    borderRadius: 19,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  title: { color: '#F7F4FF', flexShrink: 1, fontSize: 15, fontWeight: '800' },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
});
