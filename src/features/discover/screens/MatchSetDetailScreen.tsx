import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  matchSetQueryKey,
  useMatchSetDetailQuery,
  useRequestSetJoinV1Mutation,
} from '@/entities/match-set';
import {
  playSessionQueryKeys,
  prepareCoreV2CommandMetadata,
  resolvePlaySessionActor,
  usePlaySessionServices,
} from '@/entities/play-session';
import { useAuth } from '@/shared/auth/auth-context';
import { SetIdSchema } from '@/shared/contracts/core-v1';
import { LiqiButton, LiqiCard } from '@/shared/components/liqi';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';

export function MatchSetDetailScreen({ setId }: { setId?: string }) {
  const parsed = SetIdSchema.safeParse(setId);
  const query = useMatchSetDetailQuery(
    parsed.success ? parsed.data : undefined,
  );
  const join = useRequestSetJoinV1Mutation();
  const { session } = useAuth();
  const { commandService } = usePlaySessionServices();
  const queryClient = useQueryClient();
  const createSession = useMutation({
    mutationFn: async () => {
      if (!session || !query.data) throw new Error('Set chưa sẵn sàng.');
      return commandService.createFromSet(resolvePlaySessionActor(session), {
        ...prepareCoreV2CommandMetadata(0),
        expectedSourceVersion: query.data.version,
        scheduledFor: null,
        setId: query.data.setId,
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok',
        title: query.data.title,
      });
    },
    onSuccess: async (receipt) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: matchSetQueryKey }),
        queryClient.invalidateQueries({
          queryKey: playSessionQueryKeys.current(
            session?.lifecycle?.playerId ?? 'anonymous',
          ),
        }),
      ]);
      router.replace(appRoutes.sessions.detail(receipt.aggregateId));
    },
    retry: false,
  });

  if (!parsed.success)
    return (
      <SetState
        title="Set không hợp lệ"
        description="Liên kết này không còn đúng định dạng."
      />
    );
  if (query.isLoading)
    return (
      <SetState
        title="Đang mở Set"
        description="LIQI đang tải trạng thái mới nhất của đội."
      />
    );
  if (query.error)
    return (
      <SetState
        title="Chưa thể mở Set"
        description="Set có thể đã đổi quyền truy cập hoặc kết nối đang gián đoạn."
        onRetry={() => void query.refetch()}
      />
    );
  const set = query.data;
  if (!set)
    return (
      <SetState
        title="Không tìm thấy Set"
        description="Set không còn tồn tại hoặc bạn không có quyền xem lịch sử của đội."
      />
    );

  const activeMembers = set.members.filter(
    (member) => member.state === 'active',
  );
  const viewerId = session?.principal?.playerId;
  const isOwner = viewerId === set.ownerPlayerId;
  const isMember = activeMembers.some((member) => member.playerId === viewerId);
  const canCreateSession =
    isOwner &&
    activeMembers.length >= 2 &&
    ['open', 'full'].includes(set.state);
  const canRequestJoin =
    !isMember && set.state === 'open' && activeMembers.length < set.capacity;

  return (
    <LiqiScreen
      contentContainerStyle={styles.screen}
      subtitle={setStateCopy(set.state)}
      title={set.title}
    >
      <LiqiCard
        contentStyle={styles.hero}
        radius={30}
        variant="purple"
        withHighlight
      >
        <View style={styles.heroIcon}>
          <Ionicons color="#D9C6FF" name="people" size={30} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{intentCopy(set.intentKind)}</Text>
          <Text style={styles.capacity}>
            {activeMembers.length}/{set.capacity} thành viên
          </Text>
          <Text style={styles.meta}>
            {isOwner
              ? 'Bạn đang quản lý Set này'
              : isMember
                ? 'Bạn đang tham gia Set này'
                : 'Set đang tìm thêm đồng đội'}
          </Text>
        </View>
      </LiqiCard>

      <Text style={styles.sectionTitle}>Thành viên</Text>
      <LiqiCard
        contentStyle={styles.members}
        radius={24}
        variant="cyan"
        withShadow={false}
      >
        {activeMembers.map((member, index) => (
          <View key={member.playerId} style={styles.memberRow}>
            <View style={styles.memberAvatar}>
              <Text style={styles.memberInitial}>{index + 1}</Text>
            </View>
            <View style={styles.memberCopy}>
              <Text style={styles.memberName}>
                {member.playerId === viewerId
                  ? 'Bạn'
                  : member.role === 'owner'
                    ? 'Chủ đội'
                    : `Đồng đội ${index + 1}`}
              </Text>
              <Text style={styles.memberMeta}>
                {member.role === 'owner' ? 'Điều phối đội' : 'Thành viên'}
              </Text>
            </View>
            {member.playerId !== viewerId ? (
              <LiqiButton
                onPress={() =>
                  router.push(appRoutes.profile.playerDetail(member.playerId))
                }
                variant="ghost"
              >
                Hồ sơ
              </LiqiButton>
            ) : null}
          </View>
        ))}
      </LiqiCard>

      <View style={styles.actions}>
        {canCreateSession ? (
          <LiqiButton
            disabled={createSession.isPending}
            onPress={() => createSession.mutate()}
            variant="primary"
          >
            {createSession.isPending
              ? 'Đang tạo phiên chơi…'
              : 'Tạo phiên chơi'}
          </LiqiButton>
        ) : null}
        {canRequestJoin ? (
          <LiqiButton
            disabled={join.isPending}
            onPress={() =>
              join.mutate({ expectedSetVersion: set.version, setId: set.setId })
            }
            variant="rank"
          >
            {join.isPending ? 'Đang gửi…' : 'Xin tham gia Set'}
          </LiqiButton>
        ) : null}
        <LiqiButton
          onPress={() => router.replace(appRoutes.discover.sets)}
          variant="ghost"
        >
          Xem các Set khác
        </LiqiButton>
      </View>
      {join.error || createSession.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          Dữ liệu Set vừa thay đổi hoặc thao tác chưa thể hoàn tất. Hãy kiểm tra
          lại.
        </Text>
      ) : null}
    </LiqiScreen>
  );
}

function SetState({
  description,
  onRetry,
  title,
}: {
  description: string;
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
        <Ionicons color="#CCB5FF" name="people-outline" size={34} />
        <Text style={styles.stateDescription}>{description}</Text>
        {onRetry ? (
          <LiqiButton onPress={onRetry} variant="ghost">
            Thử lại
          </LiqiButton>
        ) : null}
        <LiqiButton
          onPress={() => router.replace(appRoutes.discover.sets)}
          variant="secondary"
        >
          Về danh sách Set
        </LiqiButton>
      </LiqiCard>
    </LiqiScreen>
  );
}
function setStateCopy(state: string) {
  return (
    (
      {
        open: 'Đang tìm thêm đồng đội',
        full: 'Đội đã đủ người',
        closed: 'Set đã khép lại',
      } as Record<string, string>
    )[state] ?? 'Set của LIQI'
  );
}
function intentCopy(intent: string) {
  return (
    (
      {
        normal: 'CHƠI THOẢI MÁI',
        rank: 'LEO HẠNG',
        team_rank: 'LẬP ĐỘI',
        set_love: 'SET LOVE',
        soulmate: 'HỢP GU',
      } as Record<string, string>
    )[intent] ?? 'CÙNG CHƠI'
  );
}
const styles = StyleSheet.create({
  actions: { gap: 10 },
  capacity: { color: '#FAF8FF', fontSize: 22, fontWeight: '800' },
  error: {
    color: '#FFB9C5',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  eyebrow: {
    color: '#C9AEFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  hero: { alignItems: 'center', flexDirection: 'row', gap: 15, padding: 19 },
  heroCopy: { flex: 1, gap: 4 },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(132,91,225,0.17)',
    borderRadius: 25,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  memberAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(129,91,219,0.15)',
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  memberCopy: { flex: 1, gap: 3 },
  memberInitial: { color: '#DCCBFF', fontSize: 13, fontWeight: '800' },
  memberMeta: { color: 'rgba(207,216,242,0.54)', fontSize: 10 },
  memberName: { color: '#F4F1FF', fontSize: 13, fontWeight: '700' },
  memberRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(210,220,247,0.07)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 11,
    minHeight: 63,
    paddingVertical: 7,
  },
  members: { paddingHorizontal: 14, paddingVertical: 5 },
  meta: { color: 'rgba(216,224,246,0.60)', fontSize: 11 },
  screen: { gap: 15 },
  sectionTitle: {
    color: '#EEE9FF',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  stateCard: { alignItems: 'center', gap: 16, padding: 24 },
  stateDescription: {
    color: 'rgba(218,225,247,0.68)',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  stateScreen: { flexGrow: 1, justifyContent: 'center' },
});
