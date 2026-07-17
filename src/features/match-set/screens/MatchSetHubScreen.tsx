import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  useMatchSetCommandMutation,
  useMatchSetDashboardQuery,
} from '@/entities/match-set';
import { usePlayerIdentities } from '@/entities/player-identity';
import { useAuth } from '@/shared/auth/auth-context';
import { prepareCoreV2CommandMetadata } from '@/shared/core-v2';
import {
  LiquidButton,
  LiquidCard,
  LiquidChip,
} from '@/shared/components/liquid';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';

export function MatchSetHubScreen() {
  const { session } = useAuth();
  const dashboard = useMatchSetDashboardQuery();
  const data = dashboard.data;
  const identityIds = [
    ...(data?.sets.flatMap((set) =>
      set.members.map((member) => member.playerId),
    ) ?? []),
    ...(data?.incomingInvites.map((item) => item.inviterPlayerId) ?? []),
    ...(data?.incomingJoinRequests.map((item) => item.requesterPlayerId) ?? []),
  ];
  const identities = usePlayerIdentities(identityIds);
  const identityById = new Map(
    (identities.data ?? []).map((identity) => [identity.playerId, identity]),
  );
  const viewerPlayerId = session?.principal?.playerId;

  const acceptInvite = useMatchSetCommandMutation(
    (
      repository,
      currentSession,
      item: NonNullable<typeof data>['incomingInvites'][number],
    ) =>
      repository.acceptInvite(currentSession, {
        ...prepareCoreV2CommandMetadata(item.set.version, {
          idempotencyScope: 'set-invite',
        }),
        inviteId: item.inviteId,
        setId: item.set.setId,
      }),
  );
  const declineInvite = useMatchSetCommandMutation(
    (
      repository,
      currentSession,
      item: NonNullable<typeof data>['incomingInvites'][number],
    ) =>
      repository.declineInvite(currentSession, {
        ...prepareCoreV2CommandMetadata(item.set.version, {
          idempotencyScope: 'set-invite',
        }),
        inviteId: item.inviteId,
        setId: item.set.setId,
      }),
  );
  const acceptRequest = useMatchSetCommandMutation(
    (
      repository,
      currentSession,
      item: NonNullable<typeof data>['incomingJoinRequests'][number],
    ) =>
      repository.acceptJoinRequest(currentSession, {
        ...prepareCoreV2CommandMetadata(item.set.version, {
          idempotencyScope: 'set-join',
        }),
        joinRequestId: item.joinRequestId,
        setId: item.set.setId,
      }),
  );
  const rejectRequest = useMatchSetCommandMutation(
    (
      repository,
      currentSession,
      item: NonNullable<typeof data>['incomingJoinRequests'][number],
    ) =>
      repository.rejectJoinRequest(currentSession, {
        ...prepareCoreV2CommandMetadata(item.set.version, {
          idempotencyScope: 'set-join',
        }),
        joinRequestId: item.joinRequestId,
        setId: item.set.setId,
      }),
  );
  const cancelRequest = useMatchSetCommandMutation(
    (
      repository,
      currentSession,
      item: NonNullable<typeof data>['outgoingJoinRequests'][number],
    ) =>
      repository.cancelJoinRequest(currentSession, {
        ...prepareCoreV2CommandMetadata(item.set.version, {
          idempotencyScope: 'set-join',
        }),
        joinRequestId: item.joinRequestId,
        setId: item.set.setId,
      }),
  );

  const pending =
    (data?.incomingInvites.length ?? 0) +
    (data?.incomingJoinRequests.length ?? 0) +
    (data?.outgoingJoinRequests.length ?? 0);

  return (
    <LiquidScreen
      contentContainerStyle={styles.screen}
      subtitle="Đội, lời mời và yêu cầu tham gia ở cùng một nơi"
      title="Set của bạn"
      withBottomNavPadding={false}
    >
      <View style={styles.heroActions}>
        <LiquidButton
          onPress={() => router.push(appRoutes.sets.create)}
          variant="primary"
        >
          <Ionicons color="#FFFFFF" name="add" size={17} />
          <Text style={styles.buttonText}>Tạo Set</Text>
        </LiquidButton>
        <LiquidButton
          onPress={() => router.push(appRoutes.discover.sets)}
          variant="ghost"
        >
          Khám phá Set
        </LiquidButton>
      </View>

      {pending ? (
        <LiquidCard
          contentStyle={styles.notice}
          density="compact"
          radius={20}
          variant="purple"
          withShadow={false}
        >
          <Ionicons color="#D5C0FF" name="mail-unread-outline" size={20} />
          <Text style={styles.noticeText}>
            {pending} mục đang chờ bạn xử lý
          </Text>
        </LiquidCard>
      ) : null}

      <SectionTitle icon="people-outline" title="Đội của tôi" />
      {dashboard.isLoading ? <StateCopy>Đang đồng bộ Set…</StateCopy> : null}
      {data?.sets.map((set) => {
        const activeMembers = set.members.filter(
          (member) => member.state === 'active',
        );
        const owner = set.ownerPlayerId === viewerPlayerId;
        return (
          <Pressable
            accessibilityLabel={`Mở Set ${set.title}`}
            accessibilityRole="button"
            key={set.setId}
            onPress={() => router.push(appRoutes.sets.detail(set.setId))}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <LiquidCard
              contentStyle={styles.setCard}
              density="list"
              radius={23}
              variant={owner ? 'purple' : 'cyan'}
            >
              <View style={styles.setCopy}>
                <View style={styles.titleRow}>
                  <Text numberOfLines={1} style={styles.setTitle}>
                    {set.title}
                  </Text>
                  <LiquidChip density="tag" variant={owner ? 'purple' : 'cyan'}>
                    {owner ? 'Bạn quản lý' : 'Thành viên'}
                  </LiquidChip>
                </View>
                <Text style={styles.setMeta}>
                  {activeMembers.length}/{set.capacity} thành viên ·{' '}
                  {intentLabel(set.intentKind)}
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
                color="rgba(222,229,248,0.42)"
                name="chevron-forward"
                size={18}
              />
            </LiquidCard>
          </Pressable>
        );
      })}
      {!dashboard.isLoading && !data?.sets.length ? (
        <StateCopy>Bạn chưa tạo hoặc tham gia Set nào.</StateCopy>
      ) : null}

      {data?.incomingInvites.length ? (
        <SectionTitle icon="mail-outline" title="Lời mời vào Set" />
      ) : null}
      {data?.incomingInvites.map((item) => {
        const inviter = identityById.get(item.inviterPlayerId);
        return (
          <InboxCard
            description={`${inviter?.displayName ?? 'Một người chơi'} mời bạn vào đội`}
            key={item.inviteId}
            title={item.set.title}
          >
            <LiquidButton
              disabled={acceptInvite.isPending || declineInvite.isPending}
              onPress={() => acceptInvite.mutate(item)}
            >
              Tham gia
            </LiquidButton>
            <LiquidButton
              disabled={acceptInvite.isPending || declineInvite.isPending}
              onPress={() => declineInvite.mutate(item)}
              variant="ghost"
            >
              Từ chối
            </LiquidButton>
          </InboxCard>
        );
      })}

      {data?.incomingJoinRequests.length ? (
        <SectionTitle icon="person-add-outline" title="Yêu cầu vào đội" />
      ) : null}
      {data?.incomingJoinRequests.map((item) => {
        const requester = identityById.get(item.requesterPlayerId);
        return (
          <InboxCard
            description={`${requester?.displayName ?? 'Một người chơi'} muốn tham gia`}
            key={item.joinRequestId}
            onProfile={() =>
              router.push(
                appRoutes.profile.playerDetail(item.requesterPlayerId),
              )
            }
            title={item.set.title}
          >
            <LiquidButton
              disabled={acceptRequest.isPending || rejectRequest.isPending}
              onPress={() => acceptRequest.mutate(item)}
            >
              Chấp nhận
            </LiquidButton>
            <LiquidButton
              disabled={acceptRequest.isPending || rejectRequest.isPending}
              onPress={() => rejectRequest.mutate(item)}
              variant="ghost"
            >
              Từ chối
            </LiquidButton>
          </InboxCard>
        );
      })}

      {data?.outgoingJoinRequests.length ? (
        <SectionTitle icon="paper-plane-outline" title="Đã gửi yêu cầu" />
      ) : null}
      {data?.outgoingJoinRequests.map((item) => (
        <InboxCard
          description="Đang chờ chủ đội phản hồi"
          key={item.joinRequestId}
          title={item.set.title}
        >
          <LiquidButton
            disabled={cancelRequest.isPending}
            onPress={() => cancelRequest.mutate(item)}
            variant="ghost"
          >
            Huỷ yêu cầu
          </LiquidButton>
        </InboxCard>
      ))}

      {dashboard.error ||
      acceptInvite.error ||
      declineInvite.error ||
      acceptRequest.error ||
      rejectRequest.error ||
      cancelRequest.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          Dữ liệu vừa thay đổi hoặc thao tác chưa thể hoàn tất. Hãy tải lại để
          kiểm tra trạng thái mới nhất.
        </Text>
      ) : null}
      {dashboard.error ? (
        <LiquidButton
          onPress={() => void dashboard.refetch()}
          variant="secondary"
        >
          Thử lại
        </LiquidButton>
      ) : null}
    </LiquidScreen>
  );
}

function SectionTitle({
  icon,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons color="#CDB9FF" name={icon} size={17} />
      <Text style={styles.sectionTitleText}>{title}</Text>
    </View>
  );
}
function InboxCard({
  children,
  description,
  onProfile,
  title,
}: {
  children: React.ReactNode;
  description: string;
  onProfile?: () => void;
  title: string;
}) {
  return (
    <LiquidCard
      contentStyle={styles.inboxCard}
      density="compact"
      radius={22}
      variant="cyan"
      withShadow={false}
    >
      <View style={styles.inboxCopy}>
        <Text style={styles.inboxTitle}>{title}</Text>
        <Text style={styles.inboxDescription}>{description}</Text>
        {onProfile ? (
          <Pressable accessibilityRole="button" onPress={onProfile}>
            <Text style={styles.profileLink}>Xem hồ sơ</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.inboxActions}>{children}</View>
    </LiquidCard>
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
    <View style={[styles.miniAvatar, { marginLeft: index ? -9 : 0 }]}>
      {identity?.avatarUrl ? (
        <Image
          source={{ uri: identity.avatarUrl }}
          style={styles.miniAvatarImage}
        />
      ) : (
        <Text style={styles.miniInitial}>
          {identity?.displayName.slice(0, 1).toUpperCase() ?? index + 1}
        </Text>
      )}
    </View>
  );
}
function StateCopy({ children }: { children: React.ReactNode }) {
  return <Text style={styles.stateCopy}>{children}</Text>;
}
function intentLabel(value: string) {
  return (
    (
      {
        normal: 'Chơi thoải mái',
        rank: 'Leo hạng',
        set_love: 'Set Love',
        soulmate: 'Hợp gu',
        team_rank: 'Lập đội',
      } as Record<string, string>
    )[value] ?? 'Cùng chơi'
  );
}
const styles = StyleSheet.create({
  avatarStack: { flexDirection: 'row', marginTop: 5 },
  buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  error: {
    color: '#FFB9C5',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  inboxActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inboxCard: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14,
  },
  inboxCopy: { flex: 1, gap: 4, minWidth: 190 },
  inboxDescription: {
    color: 'rgba(211,220,243,0.58)',
    fontSize: 11.5,
    lineHeight: 16,
  },
  inboxTitle: { color: '#F5F2FF', fontSize: 14, fontWeight: '800' },
  miniAvatar: {
    alignItems: 'center',
    backgroundColor: '#31284F',
    borderColor: '#111527',
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 30,
  },
  miniAvatarImage: { height: '100%', width: '100%' },
  miniInitial: { color: '#E2D5FF', fontSize: 10, fontWeight: '800' },
  notice: { alignItems: 'center', flexDirection: 'row', gap: 10, padding: 12 },
  noticeText: { color: '#E9E2FF', flex: 1, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.992 }] },
  profileLink: {
    color: '#BFA1FF',
    fontSize: 10.5,
    fontWeight: '800',
    marginTop: 2,
  },
  screen: { gap: 14 },
  sectionTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
  },
  sectionTitleText: { color: '#F1ECFF', fontSize: 16, fontWeight: '800' },
  setCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 15,
  },
  setCopy: { flex: 1, gap: 5 },
  setMeta: { color: 'rgba(211,220,243,0.58)', fontSize: 11 },
  setTitle: { color: '#F8F6FF', flex: 1, fontSize: 16, fontWeight: '800' },
  stateCopy: {
    color: 'rgba(211,220,243,0.58)',
    fontSize: 12.5,
    lineHeight: 18,
    paddingVertical: 8,
    textAlign: 'center',
  },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
});
