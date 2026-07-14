import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import {
  useSocialCommandCoordinator,
  useSocialRelationshipRepository,
} from '@/entities/social-relationship/RelationshipCapabilitiesProvider';
import { useAuth } from '@/shared/auth/auth-context';
import { LiquidCard, LiquidOrbButton } from '@/shared/components/liquid';
import type { BlockedPlayerListItemV2 } from '@/shared/contracts/core-v2';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import { ProfileText } from '../components/ProfileShared';
import { profileMediaUrl } from '../services/profile-service';

export function ProfileBlockedUsersScreen() {
  const { session } = useAuth();
  const relationshipRepository = useSocialRelationshipRepository();
  const socialCoordinator = useSocialCommandCoordinator();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const queryKey = [
    'profile-blocked-users',
    session?.principal?.playerId,
  ] as const;
  const blockedQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return relationshipRepository.listBlockedPlayers(session, { limit: 100 });
    },
    queryKey,
  });

  const blockedUsers = blockedQuery.data?.items ?? [];

  const confirmUnblock = (item: BlockedPlayerListItemV2) => {
    selectionImpact();
    const name = blockedPlayerName(item);
    Alert.alert(
      'Gỡ chặn người chơi này?',
      `${name} có thể xuất hiện lại trong các khu vực phù hợp nếu hai bên đủ điều kiện. Friendship cũ sẽ không tự phục hồi.`,
      [
        { style: 'cancel', text: 'Huỷ' },
        {
          onPress: () => void handleUnblock(item),
          text: 'Gỡ chặn',
        },
      ],
    );
  };

  const handleUnblock = async (item: BlockedPlayerListItemV2) => {
    if (!session || !socialCoordinator || pendingId) return;
    const targetPlayerId = item.player.playerId;
    setPendingId(targetPlayerId);
    try {
      await socialCoordinator.unblockPlayer({
        expectedRelationshipVersion: item.relationship.version,
        session,
        targetPlayerId,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({
          queryKey: [
            'profile-blocked-users-summary',
            session.principal?.playerId,
          ],
        }),
        queryClient.invalidateQueries({ queryKey: ['discover'] }),
      ]);
    } catch {
      Alert.alert(
        'Chưa gỡ chặn được',
        'Quan hệ có thể đã thay đổi ở phiên khác. Hãy tải lại và thử lại.',
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <LiquidScreen
      contentContainerStyle={styles.scrollContent}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <View style={styles.headerBar}>
        <LiquidOrbButton
          accessibilityLabel="Quay lại cài đặt"
          glassIntensity="low"
          glowIntensity="low"
          onPress={() => {
            selectionImpact();
            router.back();
          }}
          size={42}
          style={styles.headerOrb}
        >
          <Ionicons
            color={liquidColors.text.primary}
            name="chevron-back"
            size={20}
          />
        </LiquidOrbButton>
        <View style={styles.headerCopy}>
          <ProfileText style={styles.headerEyebrow}>AN TOÀN</ProfileText>
          <ProfileText style={styles.headerTitle}>Người đã chặn</ProfileText>
        </View>
        <View aria-hidden style={styles.headerSpacer} />
      </View>
      <ProfileText style={styles.headerSubtitle}>
        Danh sách này đến từ Social V2 authority và dùng PlayerId canonical.
      </ProfileText>

      {blockedQuery.isLoading ? (
        <EmptyCard
          icon="hourglass-outline"
          text="Đang tải danh sách đã chặn..."
        />
      ) : blockedQuery.isError || !socialCoordinator ? (
        <EmptyCard
          icon="warning-outline"
          text="Chưa xác minh được quyền quản lý block. Hành động đang bị khoá an toàn."
        />
      ) : blockedUsers.length === 0 ? (
        <EmptyCard
          icon="shield-checkmark-outline"
          text="Bạn chưa chặn ai. Các hồ sơ bị chặn sẽ xuất hiện tại đây."
        />
      ) : (
        <View style={styles.list}>
          {blockedUsers.map((item) => (
            <BlockedRow
              disabled={pendingId === item.player.playerId}
              item={item}
              key={item.player.playerId}
              onUnblock={() => confirmUnblock(item)}
            />
          ))}
        </View>
      )}
    </LiquidScreen>
  );
}

function BlockedRow({
  disabled,
  item,
  onUnblock,
}: Readonly<{
  disabled: boolean;
  item: BlockedPlayerListItemV2;
  onUnblock: () => void;
}>) {
  const displayName = blockedPlayerName(item);
  const avatarUrl = profileMediaUrl(item.player.avatarAssetId);
  return (
    <LiquidCard
      density="list"
      glowIntensity="none"
      style={styles.rowCard}
      withShadow={false}
    >
      <View style={[styles.rowContent, disabled && styles.disabledRow]}>
        <View style={styles.avatarShell}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <ProfileText style={styles.avatarInitials}>
              {initialsFromName(displayName)}
            </ProfileText>
          )}
        </View>
        <View style={styles.rowCopy}>
          <ProfileText style={styles.rowTitle}>{displayName}</ProfileText>
          <ProfileText style={styles.rowSubtitle}>
            Đã chặn · {formatDate(item.blockedAt)}
          </ProfileText>
        </View>
        <Pressable
          accessibilityLabel={`Gỡ chặn ${displayName}`}
          accessibilityRole="button"
          android_ripple={null}
          disabled={disabled}
          onPress={onUnblock}
          style={({ pressed }) => [
            styles.unblockButton,
            pressed && styles.pressed,
          ]}
        >
          <ProfileText style={styles.unblockText}>
            {disabled ? 'Đang gỡ...' : 'Gỡ chặn'}
          </ProfileText>
        </Pressable>
      </View>
    </LiquidCard>
  );
}

function EmptyCard({
  icon,
  text,
}: Readonly<{
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}>) {
  return (
    <LiquidCard density="regular" glowIntensity="low" style={styles.emptyCard}>
      <Ionicons color="rgba(178,235,255,0.78)" name={icon} size={22} />
      <ProfileText style={styles.emptyText}>{text}</ProfileText>
    </LiquidCard>
  );
}

function blockedPlayerName(item: BlockedPlayerListItemV2) {
  return (
    item.player.displayName ?? `Người chơi ${item.player.playerId.slice(0, 8)}`
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'không rõ ngày';
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'L';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : undefined;
  return `${first}${second ?? ''}`.toUpperCase();
}

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

const styles = StyleSheet.create({
  avatarImage: { height: '100%', width: '100%' },
  avatarInitials: {
    color: 'rgba(250,252,255,0.94)',
    fontSize: 15,
    fontWeight: '900',
  },
  avatarShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(104,76,185,0.20)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  disabledRow: { opacity: 0.56 },
  emptyCard: { alignItems: 'center', gap: 10, marginTop: 18 },
  emptyText: {
    color: liquidColors.text.secondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
  headerBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  headerCopy: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  headerEyebrow: {
    color: 'rgba(186,239,255,0.58)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.25,
  },
  headerOrb: { height: 42, width: 42 },
  headerSpacer: { height: 42, width: 42 },
  headerSubtitle: {
    color: liquidColors.text.secondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 9,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  headerTitle: {
    ...liquidTypography.screenName,
    fontSize: 23,
    letterSpacing: -0.48,
    marginTop: 1,
  },
  list: { marginTop: 16 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  rowCard: { marginTop: 9 },
  rowContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    minHeight: 58,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowSubtitle: {
    color: liquidColors.text.muted,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 3,
  },
  rowTitle: {
    color: liquidColors.text.primary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  scrollContent: { paddingBottom: 42, paddingTop: 2 },
  unblockButton: {
    borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  unblockText: {
    color: 'rgba(186,239,255,0.82)',
    fontSize: 11.5,
    fontWeight: '800',
  },
});
