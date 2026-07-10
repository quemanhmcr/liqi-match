import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/shared/auth/auth-context';
import { LiquidCard, LiquidOrbButton } from '@/shared/components/liquid';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import { ProfileText } from '../components/ProfileShared';
import {
  type BlockedProfile,
  fetchBlockedProfiles,
  unblockProfile,
} from '../services/profile-settings-service';

export function ProfileBlockedUsersScreen() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const blockedQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return fetchBlockedProfiles(session);
    },
    queryKey: ['profile-blocked-users', session?.user.id],
  });

  const blockedUsers = blockedQuery.data ?? [];

  const confirmUnblock = (profile: BlockedProfile) => {
    selectionImpact();
    Alert.alert(
      'Gỡ chặn người chơi này?',
      `${profile.displayName} có thể xuất hiện lại trong các khu vực phù hợp nếu hai bên đủ điều kiện.`,
      [
        { style: 'cancel', text: 'Huỷ' },
        {
          onPress: () => void handleUnblock(profile.blockedId),
          text: 'Gỡ chặn',
        },
      ],
    );
  };

  const handleUnblock = async (blockedId: string) => {
    if (!session || pendingId) return;
    setPendingId(blockedId);
    try {
      await unblockProfile(session, blockedId);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['profile-blocked-users', session.user.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['profile-settings', session.user.id],
        }),
      ]);
    } catch {
      Alert.alert('Chưa gỡ chặn được', 'Vui lòng kiểm tra kết nối và thử lại.');
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
        Quản lý những người bạn đã chặn khỏi khám phá, match và tương tác.
      </ProfileText>

      {blockedQuery.isLoading ? (
        <EmptyCard
          icon="hourglass-outline"
          text="Đang tải danh sách đã chặn..."
        />
      ) : blockedQuery.isError ? (
        <EmptyCard
          icon="warning-outline"
          text="Chưa đọc được danh sách đã chặn. Vui lòng thử lại sau."
        />
      ) : blockedUsers.length === 0 ? (
        <EmptyCard
          icon="shield-checkmark-outline"
          text="Bạn chưa chặn ai. Các hồ sơ bị chặn sẽ xuất hiện tại đây."
        />
      ) : (
        <View style={styles.list}>
          {blockedUsers.map((profile) => (
            <BlockedRow
              disabled={pendingId === profile.blockedId}
              key={profile.blockedId}
              onUnblock={() => confirmUnblock(profile)}
              profile={profile}
            />
          ))}
        </View>
      )}
    </LiquidScreen>
  );
}

function BlockedRow({
  disabled,
  onUnblock,
  profile,
}: {
  disabled: boolean;
  onUnblock: () => void;
  profile: BlockedProfile;
}) {
  return (
    <LiquidCard
      density="list"
      glowIntensity="none"
      style={styles.rowCard}
      withShadow={false}
    >
      <View style={[styles.rowContent, disabled && styles.disabledRow]}>
        <View style={styles.avatarShell}>
          {profile.avatarUrl ? (
            <Image
              source={{ uri: profile.avatarUrl }}
              style={styles.avatarImage}
            />
          ) : (
            <ProfileText style={styles.avatarInitials}>
              {initialsFromName(profile.displayName)}
            </ProfileText>
          )}
        </View>
        <View style={styles.rowCopy}>
          <ProfileText style={styles.rowTitle}>
            {profile.displayName}
          </ProfileText>
          <ProfileText style={styles.rowSubtitle}>
            Đã chặn · {formatDate(profile.createdAt)}
          </ProfileText>
        </View>
        <Pressable
          accessibilityLabel={`Gỡ chặn ${profile.displayName}`}
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <LiquidCard density="regular" glowIntensity="low" style={styles.emptyCard}>
      <Ionicons color="rgba(178,235,255,0.78)" name={icon} size={22} />
      <ProfileText style={styles.emptyText}>{text}</ProfileText>
    </LiquidCard>
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
