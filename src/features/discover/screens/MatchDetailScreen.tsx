import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { useHomeMatchFactQuery } from '@/entities/home-match-facts';
import { MatchIdSchema } from '@/shared/contracts/core-v1';
import { LiquidButton, LiquidCard } from '@/shared/components/liquid';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';

export function MatchDetailScreen({ matchId }: { matchId?: string }) {
  const parsed = MatchIdSchema.safeParse(matchId);
  const query = useHomeMatchFactQuery(parsed.success ? parsed.data : undefined);

  if (!parsed.success) {
    return (
      <DestinationState
        title="Kết nối không hợp lệ"
        description="Liên kết này không còn đúng định dạng."
      />
    );
  }
  if (query.isLoading) {
    return (
      <DestinationState
        loading
        title="Đang mở kết nối"
        description="LIQI đang kiểm tra quyền truy cập mới nhất."
      />
    );
  }
  if (query.error) {
    return (
      <DestinationState
        title="Chưa thể mở kết nối"
        description="Kết nối đang gián đoạn. Hãy thử lại từ danh sách Khám phá."
        onRetry={() => void query.refetch()}
      />
    );
  }
  const match = query.data;
  if (!match) {
    return (
      <DestinationState
        title="Không tìm thấy kết nối"
        description="Kết nối có thể đã đóng hoặc không còn khả dụng với tài khoản này."
      />
    );
  }

  const opponent = match.opponent;
  return (
    <LiquidScreen
      contentContainerStyle={styles.screen}
      subtitle={matchStatusCopy(match.status)}
      title="Kết nối của bạn"
    >
      <LiquidCard
        contentStyle={styles.hero}
        radius={30}
        variant="purple"
        withInnerReflection
      >
        <View style={styles.avatarWrap}>
          {opponent.avatarUrl ? (
            <Image
              accessibilityLabel={`Ảnh đại diện ${opponent.displayName}`}
              source={{ uri: opponent.avatarUrl }}
              style={styles.avatar}
            />
          ) : (
            <Ionicons color="#D8C4FF" name="person" size={34} />
          )}
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{matchKindCopy(match.kind)}</Text>
          <Text accessibilityRole="header" style={styles.name}>
            {opponent.displayName}
          </Text>
          <Text style={styles.meta}>
            {[opponent.rank?.name, opponent.primaryRole?.name]
              .filter(Boolean)
              .join(' · ') || 'Người chơi LIQI'}
          </Text>
        </View>
      </LiquidCard>

      <LiquidCard
        contentStyle={styles.details}
        radius={24}
        variant="cyan"
        withShadow={false}
      >
        <DetailRow
          icon="sparkles-outline"
          label="Bắt đầu từ"
          value={matchSourceCopy(match.source)}
        />
        <DetailRow
          icon="calendar-outline"
          label="Kết nối lúc"
          value={formatDate(match.createdAt)}
        />
        <DetailRow
          icon="shield-checkmark-outline"
          label="Trạng thái"
          value={matchStatusCopy(match.status)}
        />
      </LiquidCard>

      <View style={styles.actions}>
        {match.canMessage && match.conversationId ? (
          <LiquidButton
            onPress={() =>
              router.push(appRoutes.messages.detail(match.conversationId!))
            }
            variant="primary"
          >
            Nhắn tin
          </LiquidButton>
        ) : null}
        <LiquidButton
          onPress={() =>
            router.push(appRoutes.profile.playerDetail(opponent.playerId))
          }
          variant="ghost"
        >
          Xem hồ sơ
        </LiquidButton>
      </View>
    </LiquidScreen>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons color="#CBB7FF" name={icon} size={18} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function DestinationState({
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
    <LiquidScreen
      contentContainerStyle={styles.stateScreen}
      title={title}
      withBottomNavPadding={false}
    >
      <LiquidCard contentStyle={styles.stateCard} radius={28} variant="purple">
        <Ionicons
          color="#CCB5FF"
          name={loading ? 'hourglass-outline' : 'link-outline'}
          size={34}
        />
        <Text style={styles.stateDescription}>{description}</Text>
        {onRetry ? (
          <LiquidButton onPress={onRetry} variant="ghost">
            Thử lại
          </LiquidButton>
        ) : null}
        <LiquidButton
          onPress={() => router.replace(appRoutes.discover.matches)}
          variant="secondary"
        >
          Về danh sách kết nối
        </LiquidButton>
      </LiquidCard>
    </LiquidScreen>
  );
}

function matchKindCopy(kind: string) {
  return (
    (
      {
        normal: 'CHƠI THOẢI MÁI',
        rank: 'LEO HẠNG',
        team_rank: 'LẬP ĐỘI',
        set_love: 'SET LOVE',
        soulmate: 'ĐỒNG ĐỘI HỢP GU',
      } as Record<string, string>
    )[kind] ?? 'KẾT NỐI MỚI'
  );
}
function matchSourceCopy(source: string) {
  return (
    (
      {
        mutual_like: 'Hai bạn cùng chọn nhau',
        set_join: 'Cùng tham gia một Set',
        invite_accept: 'Lời mời được chấp nhận',
      } as Record<string, string>
    )[source] ?? 'Khám phá LIQI'
  );
}
function matchStatusCopy(status: string) {
  return (
    (
      {
        conversation_pending: 'Đang chuẩn bị trò chuyện',
        conversation_ready: 'Có thể trò chuyện ngay',
        closed: 'Kết nối đã khép lại',
      } as Record<string, string>
    )[status] ?? 'Đã kết nối'
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
  avatar: { height: '100%', width: '100%' },
  avatarWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(136,92,225,0.18)',
    borderColor: 'rgba(212,190,255,0.22)',
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
    height: 68,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 68,
  },
  detailCopy: { flex: 1, gap: 3 },
  detailIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(106,79,179,0.13)',
    borderRadius: 12,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  detailLabel: {
    color: 'rgba(205,214,240,0.55)',
    fontSize: 10,
    fontWeight: '700',
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 55,
  },
  detailValue: { color: '#F0EDFF', fontSize: 13, fontWeight: '700' },
  details: { gap: 4, padding: 15 },
  eyebrow: {
    color: '#C9AEFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  hero: { alignItems: 'center', flexDirection: 'row', gap: 16, padding: 20 },
  heroCopy: { flex: 1, gap: 5 },
  meta: { color: 'rgba(219,226,248,0.62)', fontSize: 12 },
  name: {
    color: '#FAF8FF',
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  screen: { gap: 16 },
  stateCard: { alignItems: 'center', gap: 16, padding: 24 },
  stateDescription: {
    color: 'rgba(218,225,247,0.68)',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  stateScreen: { flexGrow: 1, justifyContent: 'center' },
});
