import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useMatchSetDiscoveryQuery,
  useRequestSetJoinV1Mutation,
} from '@/entities/match-set';
import type { SetDiscoveryCandidateV1 } from '@/shared/contracts/core-v1';

export function MatchSetDiscoveryScreen() {
  const router = useRouter();
  const query = useMatchSetDiscoveryQuery(20);
  const joinMutation = useRequestSetJoinV1Mutation();
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Quay lại"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons color="#F4F6FF" name="chevron-back" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>DISCOVER</Text>
          <Text style={styles.title}>Đội đang mở</Text>
        </View>
      </View>

      {query.isPending ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.secondary}>Đang tải đội phù hợp…</Text>
        </View>
      ) : query.isError ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Không thể tải đội</Text>
          <Text style={styles.secondary}>
            {query.error instanceof Error
              ? query.error.message
              : 'Vui lòng thử lại.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void query.refetch()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={items}
          keyExtractor={(item) => item.set.setId}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.errorTitle}>Chưa có đội phù hợp</Text>
              <Text style={styles.secondary}>
                Kết quả chỉ gồm đội authoritative đang mở và còn chỗ.
              </Text>
            </View>
          }
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) {
              void query.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <MatchSetCard
              candidate={item}
              isPending={
                joinMutation.isPending &&
                joinMutation.variables?.setId === item.set.setId
              }
              onJoin={() =>
                joinMutation.mutate({
                  expectedSetVersion: item.set.version,
                  setId: item.set.setId,
                })
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function MatchSetCard({
  candidate,
  isPending,
  onJoin,
}: {
  candidate: SetDiscoveryCandidateV1;
  isPending: boolean;
  onJoin: () => void;
}) {
  const set = candidate.set;
  const canJoin = candidate.capabilities.canRequestJoin && !isPending;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleWrap}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {set.title}
          </Text>
          <Text style={styles.secondary}>
            {set.memberPlayerIds.length}/{set.capacity} thành viên ·{' '}
            {intentLabel(set.intentKind)}
          </Text>
        </View>
        <View style={styles.stateBadge}>
          <Text style={styles.stateText}>{stateLabel(set.state)}</Text>
        </View>
      </View>

      <View style={styles.reasonRow}>
        {candidate.recommendationContext.reasonCodes.map((reason) => (
          <View key={reason} style={styles.reasonBadge}>
            <Text style={styles.reasonText}>{reasonLabel(reason)}</Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityLabel={`Xin vào ${set.title}`}
        accessibilityRole="button"
        disabled={!canJoin}
        onPress={onJoin}
        style={[styles.primaryButton, !canJoin && styles.disabledButton]}
      >
        <Text style={styles.primaryButtonText}>
          {isPending
            ? 'Đang gửi…'
            : candidate.capabilities.canRequestJoin
              ? 'Xin vào đội'
              : 'Đã gửi yêu cầu'}
        </Text>
      </Pressable>
    </View>
  );
}

function intentLabel(value: string) {
  return (
    {
      normal: 'Đánh thường',
      rank: 'Đấu hạng',
      set_love: 'Set Love',
      soulmate: 'Soulmate',
      team_rank: 'Team Rank',
    }[value] ?? value
  );
}

function stateLabel(value: string) {
  return { closed: 'Đã đóng', full: 'Đã đủ', open: 'Đang mở' }[value] ?? value;
}

function reasonLabel(value: string) {
  return (
    {
      intent_kind_overlap: 'Cùng mục tiêu',
      invite_pending: 'Có lời mời',
      join_request_pending: 'Đã xin vào',
      open_slot: 'Còn chỗ',
    }[value] ?? value
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(23, 28, 48, 0.96)',
    borderColor: 'rgba(163, 176, 255, 0.16)',
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
    padding: 18,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  cardTitle: { color: '#F7F8FF', fontSize: 18, fontWeight: '700' },
  cardTitleWrap: { flex: 1, gap: 5 },
  center: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 28,
  },
  disabledButton: { opacity: 0.48 },
  errorTitle: { color: '#F7F8FF', fontSize: 18, fontWeight: '700' },
  eyebrow: {
    color: 'rgba(181, 191, 255, 0.72)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerCopy: { gap: 2 },
  iconButton: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  list: { gap: 14, padding: 16, paddingBottom: 36 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#5E6CFF',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700' },
  reasonBadge: {
    backgroundColor: 'rgba(94, 108, 255, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonText: { color: 'rgba(218, 223, 255, 0.82)', fontSize: 12 },
  safeArea: { backgroundColor: '#0B0E19', flex: 1 },
  secondary: { color: 'rgba(223, 227, 245, 0.62)', lineHeight: 20 },
  stateBadge: {
    backgroundColor: 'rgba(75, 206, 151, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stateText: { color: '#75DEB0', fontSize: 12, fontWeight: '700' },
  title: { color: '#F7F8FF', fontSize: 22, fontWeight: '800' },
});
