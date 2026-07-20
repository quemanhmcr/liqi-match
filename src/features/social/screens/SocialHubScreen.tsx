import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { usePlayerIdentities } from '@/entities/player-identity';
import {
  socialRelationshipsQueryKey,
  useSocialRelationshipsQuery,
  useSocialCommandCoordinator,
} from '@/entities/social-relationship';
import { useAuth } from '@/shared/auth/auth-context';
import {
  LiqiButton,
  LiqiCard,
  LiqiChip,
  LiqiOrbButton,
} from '@/shared/components/liqi';
import type { SocialRelationshipSnapshotV2 } from '@/shared/contracts/core-v2';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';
import { liqiColors } from '@/shared/theme/liqi-design-system';

type HubFilter = 'friends' | 'incoming' | 'outgoing';
type SocialAction =
  | { kind: 'accept'; relationship: SocialRelationshipSnapshotV2 }
  | { kind: 'cancel'; relationship: SocialRelationshipSnapshotV2 }
  | { kind: 'decline'; relationship: SocialRelationshipSnapshotV2 }
  | { kind: 'mute'; relationship: SocialRelationshipSnapshotV2 }
  | { kind: 'remove'; relationship: SocialRelationshipSnapshotV2 }
  | { kind: 'unmute'; relationship: SocialRelationshipSnapshotV2 };

const filters: readonly Readonly<{ key: HubFilter; label: string }>[] = [
  { key: 'friends', label: 'Bạn bè' },
  { key: 'incoming', label: 'Đang chờ bạn' },
  { key: 'outgoing', label: 'Đã gửi' },
];

export function SocialHubScreen() {
  const { session } = useAuth();
  const coordinator = useSocialCommandCoordinator();
  const queryClient = useQueryClient();
  const relationshipsQuery = useSocialRelationshipsQuery(100);
  const [filter, setFilter] = useState<HubFilter>('friends');
  const relationships = useMemo(
    () => relationshipsQuery.data?.items ?? [],
    [relationshipsQuery.data?.items],
  );
  const identitiesQuery = usePlayerIdentities(
    relationships.map((item) => item.targetPlayerId),
  );
  const identities = useMemo(
    () =>
      new Map(
        (identitiesQuery.data ?? []).map((identity) => [
          identity.playerId,
          identity,
        ]),
      ),
    [identitiesQuery.data],
  );
  const counts = useMemo(
    () => ({
      friends: relationships.filter(
        (item) => item.friendship.label === 'friend',
      ).length,
      incoming: relationships.filter(
        (item) => item.friendship.label === 'pending_incoming',
      ).length,
      outgoing: relationships.filter(
        (item) => item.friendship.label === 'pending_outgoing',
      ).length,
    }),
    [relationships],
  );
  const visible = relationships.filter((relationship) => {
    if (filter === 'friends') return relationship.friendship.label === 'friend';
    if (filter === 'incoming') {
      return relationship.friendship.label === 'pending_incoming';
    }
    return relationship.friendship.label === 'pending_outgoing';
  });

  const actionMutation = useMutation({
    mutationFn: async (action: SocialAction) => {
      if (!session || !coordinator) {
        throw new Error('Danh sách kết nối chưa sẵn sàng.');
      }
      const relationship = action.relationship;
      if (
        action.kind === 'accept' ||
        action.kind === 'decline' ||
        action.kind === 'cancel'
      ) {
        const friendshipRequestId = relationship.friendship.requestId;
        const expectedRequestVersion = relationship.friendship.requestVersion;
        if (!friendshipRequestId || expectedRequestVersion === null) {
          throw new Error('Lời mời không còn ở trạng thái có thể xử lý.');
        }
        const shared = {
          expectedRelationshipVersion: relationship.version,
          expectedRequestVersion,
          friendshipRequestId,
          session,
        };
        if (action.kind === 'accept')
          return coordinator.acceptFriendship(shared);
        if (action.kind === 'decline')
          return coordinator.declineFriendship(shared);
        return coordinator.cancelFriendship(shared);
      }
      if (action.kind === 'remove') {
        return coordinator.removeFriendship({
          expectedRelationshipVersion: relationship.version,
          session,
          targetPlayerId: relationship.targetPlayerId,
        });
      }
      if (action.kind === 'mute') {
        return coordinator.mutePlayer({
          expectedRelationshipVersion: relationship.version,
          session,
          targetPlayerId: relationship.targetPlayerId,
        });
      }
      return coordinator.unmutePlayer({
        expectedRelationshipVersion: relationship.version,
        session,
        targetPlayerId: relationship.targetPlayerId,
      });
    },
    onError: (error) => {
      Alert.alert(
        'Chưa cập nhật được quan hệ',
        error instanceof Error
          ? error.message
          : 'Dữ liệu có thể đã thay đổi. Hãy tải lại và thử lại.',
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: socialRelationshipsQueryKey,
        }),
        queryClient.invalidateQueries({ queryKey: ['social-relationship'] }),
        queryClient.invalidateQueries({ queryKey: ['discover'] }),
      ]);
    },
  });

  const confirmRemove = (
    relationship: SocialRelationshipSnapshotV2,
    name: string,
  ) => {
    Alert.alert(
      `Xoá ${name} khỏi bạn bè?`,
      'Quyền nhắn tin hoặc mời vào buổi chơi có thể thay đổi ngay.',
      [
        { style: 'cancel', text: 'Giữ lại' },
        {
          onPress: () =>
            actionMutation.mutate({ kind: 'remove', relationship }),
          style: 'destructive',
          text: 'Xoá bạn',
        },
      ],
    );
  };

  return (
    <LiqiScreen
      contentContainerStyle={styles.content}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <View style={styles.header}>
        <LiqiOrbButton
          accessibilityLabel="Quay lại"
          onPress={() => router.back()}
          size={42}
        >
          <Ionicons
            color={liqiColors.text.primary}
            name="chevron-back"
            size={20}
          />
        </LiqiOrbButton>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>KẾT NỐI</Text>
          <Text style={styles.title}>Bạn bè & lời mời</Text>
        </View>
        <LiqiOrbButton
          accessibilityLabel="Cài đặt quyền riêng tư"
          onPress={() => router.push(appRoutes.profile.settings)}
          size={42}
        >
          <Ionicons
            color={liqiColors.text.primary}
            name="shield-checkmark-outline"
            size={18}
          />
        </LiqiOrbButton>
      </View>

      <LiqiCard density="regular" style={styles.heroCard} variant="purple">
        <View style={styles.heroIcon}>
          <Ionicons color="#BFEFFF" name="people" size={25} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Mọi kết nối đều rõ ràng</Text>
          <Text style={styles.body}>
            Lời mời, bạn bè, thông báo và quyền tương tác luôn cập nhật theo lựa
            chọn mới nhất của bạn.
          </Text>
        </View>
      </LiqiCard>

      <View style={styles.filters}>
        {filters.map((item) => (
          <LiqiChip
            accessibilityLabel={`${item.label}, ${counts[item.key]} mục`}
            density="compact"
            key={item.key}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => undefined);
              setFilter(item.key);
            }}
            selected={filter === item.key}
            variant={filter === item.key ? 'cyan' : 'default'}
          >
            {item.label} · {counts[item.key]}
          </LiqiChip>
        ))}
      </View>

      {relationshipsQuery.isPending ? (
        <StateCard loading title="Đang đồng bộ quan hệ..." />
      ) : relationshipsQuery.isError ? (
        <StateCard
          onRetry={() => void relationshipsQuery.refetch()}
          title="Chưa tải được Social Hub"
        />
      ) : visible.length === 0 ? (
        <StateCard
          icon={filter === 'friends' ? 'people-outline' : 'mail-open-outline'}
          title={emptyLabel(filter)}
        />
      ) : (
        <View style={styles.list}>
          {visible.map((relationship) => {
            const identity = identities.get(relationship.targetPlayerId);
            const displayName = identity?.displayName ?? 'Người chơi Liqi';
            const busy =
              actionMutation.isPending &&
              actionMutation.variables?.relationship.relationshipId ===
                relationship.relationshipId;
            return (
              <LiqiCard
                density="list"
                key={relationship.relationshipId}
                style={styles.personCard}
              >
                <Pressable
                  accessibilityLabel={`Mở hồ sơ ${displayName}`}
                  accessibilityRole="button"
                  disabled={!relationship.capabilities.canViewProfile}
                  onPress={() =>
                    router.push(
                      appRoutes.profile.playerDetail(
                        relationship.targetPlayerId,
                      ),
                    )
                  }
                  style={({ pressed }) => [
                    styles.identityRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <Avatar
                    name={displayName}
                    uri={identity?.avatarUrl ?? undefined}
                  />
                  <View style={styles.personCopy}>
                    <Text numberOfLines={1} style={styles.personName}>
                      {displayName}
                    </Text>
                    <Text numberOfLines={1} style={styles.personMeta}>
                      {identity?.rank?.name ??
                        identity?.primaryRole?.name ??
                        relationshipLabel(relationship)}
                    </Text>
                  </View>
                  {relationship.mute.viewerMutedTarget ? (
                    <LiqiChip density="compact" variant="orange">
                      Đã ẩn
                    </LiqiChip>
                  ) : null}
                  {relationship.capabilities.canViewProfile ? (
                    <Ionicons
                      color="rgba(225,232,255,0.34)"
                      name="chevron-forward"
                      size={17}
                    />
                  ) : null}
                </Pressable>
                <View style={styles.actions}>
                  {relationship.capabilities.canAcceptFriendship ? (
                    <LiqiButton
                      disabled={busy}
                      onPress={() =>
                        actionMutation.mutate({ kind: 'accept', relationship })
                      }
                    >
                      Chấp nhận
                    </LiqiButton>
                  ) : null}
                  {relationship.capabilities.canDeclineFriendship ? (
                    <LiqiButton
                      disabled={busy}
                      onPress={() =>
                        actionMutation.mutate({ kind: 'decline', relationship })
                      }
                      variant="secondary"
                    >
                      Từ chối
                    </LiqiButton>
                  ) : null}
                  {relationship.capabilities.canCancelFriendship ? (
                    <LiqiButton
                      disabled={busy}
                      onPress={() =>
                        actionMutation.mutate({ kind: 'cancel', relationship })
                      }
                      variant="secondary"
                    >
                      Thu hồi
                    </LiqiButton>
                  ) : null}
                  {relationship.capabilities.canMute ? (
                    <LiqiButton
                      disabled={busy}
                      onPress={() =>
                        actionMutation.mutate({ kind: 'mute', relationship })
                      }
                      variant="secondary"
                    >
                      Ẩn thông báo
                    </LiqiButton>
                  ) : null}
                  {relationship.capabilities.canUnmute ? (
                    <LiqiButton
                      disabled={busy}
                      onPress={() =>
                        actionMutation.mutate({ kind: 'unmute', relationship })
                      }
                      variant="secondary"
                    >
                      Bỏ ẩn
                    </LiqiButton>
                  ) : null}
                  {relationship.capabilities.canRemoveFriendship ? (
                    <LiqiButton
                      disabled={busy}
                      onPress={() => confirmRemove(relationship, displayName)}
                      variant="ghost"
                    >
                      Xoá bạn
                    </LiqiButton>
                  ) : null}
                  {busy ? (
                    <ActivityIndicator color="#67E8FF" size="small" />
                  ) : null}
                </View>
              </LiqiCard>
            );
          })}
        </View>
      )}
    </LiqiScreen>
  );
}

function Avatar({ name, uri }: { name: string; uri?: string }) {
  return uri ? (
    <Image source={{ uri }} style={styles.avatar} />
  ) : (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitial}>
        {name.trim().charAt(0).toUpperCase() || 'L'}
      </Text>
    </View>
  );
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
    <LiqiCard density="regular" style={styles.stateCard}>
      {loading ? (
        <ActivityIndicator color="#67E8FF" />
      ) : (
        <Ionicons color="rgba(178,235,255,0.76)" name={icon} size={24} />
      )}
      <Text style={styles.stateTitle}>{title}</Text>
      {onRetry ? (
        <LiqiButton onPress={onRetry} variant="secondary">
          Tải lại
        </LiqiButton>
      ) : null}
    </LiqiCard>
  );
}

function emptyLabel(filter: HubFilter) {
  if (filter === 'friends') return 'Chưa có friendship đã được chấp nhận.';
  if (filter === 'incoming') return 'Không có lời mời nào đang chờ bạn.';
  return 'Bạn chưa gửi lời mời nào.';
}

function relationshipLabel(relationship: SocialRelationshipSnapshotV2) {
  if (relationship.friendship.label === 'friend') return 'Bạn bè';
  if (relationship.friendship.label === 'pending_incoming')
    return 'Đang chờ bạn phản hồi';
  return 'Đang chờ người kia phản hồi';
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 11,
  },
  avatar: { borderRadius: 24, height: 48, width: 48 },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.10)',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#EAFDFF', fontSize: 18, fontWeight: '900' },
  body: { color: liqiColors.text.secondary, fontSize: 12.5, lineHeight: 18 },
  content: { gap: 14, paddingBottom: 36, paddingHorizontal: 16, paddingTop: 8 },
  eyebrow: {
    color: 'rgba(103,232,255,0.66)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 52 },
  headerCopy: { alignItems: 'center', flex: 1, gap: 3 },
  heroCard: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  heroCopy: { flex: 1, gap: 3 },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.09)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  heroTitle: {
    color: liqiColors.text.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  identityRow: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  list: { gap: 10 },
  personCard: { overflow: 'hidden' },
  personCopy: { flex: 1, minWidth: 0 },
  personMeta: { color: liqiColors.text.muted, fontSize: 11.5, marginTop: 3 },
  personName: {
    color: liqiColors.text.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  pressed: { opacity: 0.78 },
  stateCard: {
    alignItems: 'center',
    gap: 12,
    minHeight: 150,
    justifyContent: 'center',
  },
  stateTitle: {
    color: liqiColors.text.secondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  title: { color: liqiColors.text.primary, fontSize: 17, fontWeight: '900' },
});
