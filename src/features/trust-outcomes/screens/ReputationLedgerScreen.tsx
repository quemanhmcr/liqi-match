import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { usePlayerIdentities } from '@/entities/player-identity';
import {
  usePlayerTrustProjection,
  useReputationLedger,
} from '@/entities/trust-outcomes';
import { useAuth } from '@/shared/auth/auth-context';
import {
  LiquidButton,
  LiquidCard,
  LiquidChip,
  LiquidOrbButton,
} from '@/shared/components/liquid';
import type { ReputationLedgerEntryV2 } from '@/shared/contracts/core-v2';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

export function ReputationLedgerScreen({ playerId }: { playerId?: string }) {
  const { session } = useAuth();
  const resolvedPlayerId =
    playerId ?? session?.principal?.playerId ?? undefined;
  const projectionQuery = usePlayerTrustProjection(session, resolvedPlayerId);
  const ledgerQuery = useReputationLedger(session, resolvedPlayerId);
  const identityQuery = usePlayerIdentities(
    resolvedPlayerId ? [resolvedPlayerId] : [],
  );
  const identity = identityQuery.data?.[0];
  const projection = projectionQuery.data;

  return (
    <LiquidScreen
      contentContainerStyle={styles.content}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <View style={styles.header}>
        <LiquidOrbButton
          accessibilityLabel="Quay lại"
          onPress={() => router.back()}
          size={42}
        >
          <Ionicons
            color={liquidColors.text.primary}
            name="chevron-back"
            size={20}
          />
        </LiquidOrbButton>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>TRUST LEDGER V2</Text>
          <Text style={styles.title}>Lịch sử uy tín</Text>
        </View>
        <View style={styles.spacer} />
      </View>

      {projection ? (
        <LiquidCard density="regular" style={styles.summary} variant="purple">
          <View style={styles.shield}>
            <Ionicons color="#67E8FF" name="shield-checkmark" size={27} />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>
              {identity?.displayName ?? 'Hồ sơ người chơi'}
            </Text>
            <Text style={styles.body}>
              {projection.completedSessions} session hoàn tất ·{' '}
              {formatBps(projection.completionReliabilityBps)} độ tin cậy
            </Text>
            <View style={styles.metrics}>
              <LiquidChip density="compact" variant="cyan">
                {projection.positiveEndorsements} lời khen
              </LiquidChip>
              <LiquidChip density="compact" variant="purple">
                {projection.repeatTeammateCount} đồng đội chơi lại
              </LiquidChip>
              {projection.noShowCount ? (
                <LiquidChip density="compact" variant="orange">
                  {projection.noShowCount} vắng mặt
                </LiquidChip>
              ) : null}
            </View>
          </View>
        </LiquidCard>
      ) : null}

      <LiquidCard density="compact" style={styles.explainer}>
        <Ionicons
          color="rgba(178,235,255,0.72)"
          name="information-circle-outline"
          size={19}
        />
        <Text style={styles.explainerText}>
          Ledger là các fact bất biến từ session, endorsement, repeat-play và
          moderation. UI không tự tính hoặc sửa các điểm này.
        </Text>
      </LiquidCard>

      {ledgerQuery.isPending || projectionQuery.isPending ? (
        <StateCard loading title="Đang đọc trust ledger..." />
      ) : ledgerQuery.isError || projectionQuery.isError ? (
        <StateCard
          onRetry={() =>
            void Promise.all([ledgerQuery.refetch(), projectionQuery.refetch()])
          }
          title="Bạn không có quyền xem hoặc ledger chưa sẵn sàng."
        />
      ) : !ledgerQuery.data?.length ? (
        <StateCard
          icon="shield-outline"
          title="Chưa có trust fact nào được ghi nhận."
        />
      ) : (
        <View style={styles.list}>
          {ledgerQuery.data.map((entry) => (
            <LedgerRow entry={entry} key={entry.entryId} />
          ))}
        </View>
      )}
    </LiquidScreen>
  );
}

function LedgerRow({ entry }: { entry: ReputationLedgerEntryV2 }) {
  const presentation = present(entry);
  return (
    <LiquidCard density="list" style={styles.entryCard}>
      <View
        style={[
          styles.entryIcon,
          presentation.negative && styles.entryIconWarning,
        ]}
      >
        <Ionicons
          color={presentation.negative ? '#FFCB8D' : '#8FEFFF'}
          name={presentation.icon}
          size={19}
        />
      </View>
      <View style={styles.entryCopy}>
        <Text style={styles.entryTitle}>{presentation.title}</Text>
        <Text style={styles.entryMeta}>
          {formatDate(entry.createdAt)} · {presentation.source}
        </Text>
      </View>
      <Text
        style={[styles.delta, presentation.negative && styles.deltaNegative]}
      >
        {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
      </Text>
    </LiquidCard>
  );
}

function present(entry: ReputationLedgerEntryV2): {
  icon: keyof typeof Ionicons.glyphMap;
  negative: boolean;
  source: string;
  title: string;
} {
  const labels = {
    completed_sessions: 'Hoàn tất buổi chơi',
    confirmed_moderation_actions: 'Kết quả kiểm duyệt đã xác nhận',
    no_show_count: 'Vắng mặt đã xác minh',
    positive_endorsements: 'Nhận lời khen từ đồng đội',
    repeat_teammate_count: 'Đồng đội tiếp tục chơi lại',
  } as const;
  const icons = {
    completed_sessions: 'checkmark-done-outline',
    confirmed_moderation_actions: 'shield-outline',
    no_show_count: 'time-outline',
    positive_endorsements: 'heart-outline',
    repeat_teammate_count: 'repeat-outline',
  } as const;
  const sources = {
    endorsement: 'Endorsement',
    moderation_action: 'Moderation',
    participation_confirmation: 'Session outcome',
    repeat_teammate: 'Repeat-play',
  } as const;
  return {
    icon: icons[entry.dimension],
    negative:
      entry.delta < 0 ||
      entry.dimension === 'no_show_count' ||
      entry.dimension === 'confirmed_moderation_actions',
    source: sources[entry.sourceType],
    title: labels[entry.dimension],
  };
}

function StateCard({
  icon = 'cloud-outline',
  loading = false,
  onRetry,
  title,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <LiquidCard density="regular" style={styles.stateCard}>
      {loading ? (
        <ActivityIndicator color="#67E8FF" />
      ) : (
        <Ionicons color="rgba(178,235,255,0.74)" name={icon} size={24} />
      )}
      <Text style={styles.body}>{title}</Text>
      {onRetry ? (
        <LiquidButton onPress={onRetry} variant="secondary">
          Tải lại
        </LiquidButton>
      ) : null}
    </LiquidCard>
  );
}

function formatBps(value: number) {
  return `${Math.round(value / 100)}%`;
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  body: { color: liquidColors.text.secondary, fontSize: 12.5, lineHeight: 18 },
  content: { gap: 13, paddingBottom: 36, paddingHorizontal: 16, paddingTop: 8 },
  delta: { color: '#95F3FF', fontSize: 16, fontWeight: '900' },
  deltaNegative: { color: '#FFCB8D' },
  entryCard: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  entryCopy: { flex: 1, minWidth: 0 },
  entryIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.08)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  entryIconWarning: { backgroundColor: 'rgba(255,184,107,0.09)' },
  entryMeta: { color: liquidColors.text.muted, fontSize: 11, marginTop: 3 },
  entryTitle: {
    color: liquidColors.text.primary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  explainer: { alignItems: 'flex-start', flexDirection: 'row', gap: 9 },
  explainerText: {
    color: liquidColors.text.muted,
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
  },
  eyebrow: {
    color: 'rgba(103,232,255,0.66)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 52 },
  headerCopy: { alignItems: 'center', flex: 1, gap: 3 },
  list: { gap: 9 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 },
  shield: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.10)',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  spacer: { height: 42, width: 42 },
  stateCard: {
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
    minHeight: 150,
  },
  summary: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  summaryCopy: { flex: 1, gap: 2 },
  summaryTitle: {
    color: liquidColors.text.primary,
    fontSize: 17,
    fontWeight: '900',
  },
  title: { color: liquidColors.text.primary, fontSize: 17, fontWeight: '900' },
});
