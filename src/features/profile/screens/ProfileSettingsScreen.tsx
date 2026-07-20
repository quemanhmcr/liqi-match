import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { useAssetResolver } from '@/entities/media-asset';
import {
  usePlayerPrivacyProvider,
  useSocialCommandCoordinator,
  useSocialRelationshipRepository,
} from '@/entities/social-relationship/RelationshipCapabilitiesProvider';
import { useAuth } from '@/shared/auth/auth-context';
import {
  AccountDeletionClientError,
  deleteOwnAccount,
} from '@/shared/auth/account-deletion-service';
import { appRoutes } from '@/app-shell/navigation/routes';
import {
  LiqiButton,
  LiqiCard,
  LiqiChip,
  LiqiOrbButton,
  LiqiSectionHeader,
} from '@/shared/components/liqi';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';
import { liqiColors, liqiTypography } from '@/shared/theme/liqi-design-system';

import {
  ProfilePrivacySettingsSection,
  type PrivacySettingKey,
  type PrivacySettingValue,
} from '../components/ProfilePrivacySettingsSection';
import { ProfileText } from '../components/ProfileShared';
import { resolveProfileMedia } from '../model/profile-media';
import { useProfileReadRepository } from '../runtime/ProfileReadRepositoryProvider';
import {
  fetchProfileSettings,
  type ProfileSettingsState,
  updateDiscoverability,
  updateProfileSoftSettings,
} from '../services/profile-settings-service';

const legalLinks = {
  privacy: 'https://liqimatch.app/privacy',
  terms: 'https://liqimatch.app/terms',
};

const deleteConfirmationText = 'DELETE';

type SettingsMutationKey =
  'allowProfileShare' | 'deleteAccount' | 'isDiscoverable' | 'showWinRate';

export function ProfileSettingsScreen() {
  const { session, setSession, signOut } = useAuth();
  const profileRepository = useProfileReadRepository();
  const relationshipRepository = useSocialRelationshipRepository();
  const socialCoordinator = useSocialCommandCoordinator();
  const privacyProvider = usePlayerPrivacyProvider();
  const assetResolver = useAssetResolver();
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = useState<SettingsMutationKey | null>(
    null,
  );
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const profileQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return profileRepository.getProfile({ session });
    },
    queryKey: ['profile-settings-view', session?.user.id],
  });
  const settingsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return fetchProfileSettings(session);
    },
    queryKey: ['profile-settings', session?.user.id],
  });
  const blockedSummaryQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return relationshipRepository.listBlockedPlayers(session, { limit: 1 });
    },
    queryKey: ['profile-blocked-users-summary', session?.principal?.playerId],
  });
  const privacyQueryKey = [
    'player-privacy-v2',
    session?.principal?.playerId,
  ] as const;
  const privacyQuery = useQuery({
    enabled: Boolean(session && privacyProvider),
    queryFn: () => {
      if (!session || !privacyProvider) {
        throw new Error('Missing auth session or privacy provider');
      }
      return privacyProvider.getPrivacy(session);
    },
    queryKey: privacyQueryKey,
  });
  const privacyMutation = useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: PrivacySettingKey;
      value: PrivacySettingValue;
    }) => {
      const privacy = privacyQuery.data;
      if (!session || !socialCoordinator || !privacy) {
        throw Object.assign(
          new Error('Cài đặt quyền riêng tư chưa sẵn sàng.'),
          { code: 'privacy_forbidden', retryable: false },
        );
      }
      const nextPrivacy = { ...privacy, [key]: value };
      return socialCoordinator.updatePrivacy({
        expectedPrivacyVersion: privacy.version,
        privacy: {
          friendshipRequests: nextPrivacy.friendshipRequests,
          presenceVisibility: nextPrivacy.presenceVisibility,
          profileVisibility: nextPrivacy.profileVisibility,
          sessionInvites: nextPrivacy.sessionInvites,
          trustVisibility: nextPrivacy.trustVisibility,
        },
        session,
      });
    },
    onError: async (error) => {
      if (privacyErrorCode(error) === 'privacy_version_conflict') {
        await privacyQuery.refetch();
      }
      Alert.alert('Chưa lưu được quyền riêng tư', privacyErrorMessage(error));
    },
    onSuccess: async (receipt) => {
      queryClient.setQueryData(privacyQueryKey, receipt.privacy);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['social-relationship'] }),
        queryClient.invalidateQueries({ queryKey: ['discover'] }),
        queryClient.invalidateQueries({ queryKey: ['profile-view'] }),
        queryClient.invalidateQueries({ queryKey: ['home-dashboard'] }),
      ]);
    },
  });

  const profile = profileQuery.data;
  const profileAvatarSource = profile
    ? resolveProfileMedia(assetResolver, {
        assetKey: profile.avatarAssetKey,
        uri: profile.avatarUrl ?? profile.avatarFallbackUrl,
      }).source
    : undefined;
  const accountSubtitle = useMemo(
    () => session?.user.email ?? compactUserId(session?.user.id),
    [session?.user.email, session?.user.id],
  );
  const settings = settingsQuery.data ?? defaultSettingsState;
  const canConfirmDelete = deleteText.trim() === deleteConfirmationText;

  const openProfile = () => {
    selectionImpact();
    router.push(appRoutes.profile.self);
  };

  const openProfileEditor = () => {
    selectionImpact();
    router.push(appRoutes.profile.edit);
  };

  const openProfileShare = () => {
    if (!settings.allowProfileShare) {
      Alert.alert(
        'Đang tắt chia sẻ hồ sơ',
        'Bật lại “Cho phép tạo ảnh chia sẻ” trước khi xuất ảnh social.',
      );
      return;
    }
    impactLight();
    router.push(appRoutes.profile.share);
  };

  const openBlockedUsers = () => {
    selectionImpact();
    router.push(appRoutes.profile.blocked);
  };

  const openSocialHub = () => {
    selectionImpact();
    router.push(appRoutes.social.hub);
  };

  const openEngagementPreferences = () => {
    selectionImpact();
    router.push(appRoutes.profile.engagement);
  };

  const openReputationLedger = () => {
    selectionImpact();
    router.push(appRoutes.profile.reputation);
  };

  const openLegalLink = (url: string) => {
    impactLight();
    void Linking.openURL(url).catch(() => {
      Alert.alert('Không mở được liên kết', 'Vui lòng thử lại sau.');
    });
  };

  const updateSetting = async (
    key: Exclude<SettingsMutationKey, 'deleteAccount'>,
    value: boolean,
  ) => {
    if (!session || pendingKey) return;
    const queryKey = ['profile-settings', session.user.id] as const;
    const previous = queryClient.getQueryData<ProfileSettingsState>(queryKey);
    const rollback = previous ?? settings;
    const next = { ...rollback, [key]: value };

    setPendingKey(key);
    queryClient.setQueryData(queryKey, next);
    try {
      if (key === 'isDiscoverable') {
        await updateDiscoverability(session, value);
      } else {
        await updateProfileSoftSettings(session, {
          ...(key === 'allowProfileShare' ? { allowProfileShare: value } : {}),
          ...(key === 'showWinRate' ? { showWinRate: value } : {}),
        });
      }
      await queryClient.invalidateQueries({ queryKey });
    } catch {
      queryClient.setQueryData(queryKey, rollback);
      Alert.alert(
        'Chưa lưu được cài đặt',
        'Vui lòng kiểm tra kết nối và thử lại.',
      );
    } finally {
      setPendingKey(null);
    }
  };

  const confirmSignOut = () => {
    if (pendingKey) return;
    impactWarning();
    Alert.alert(
      'Đăng xuất khỏi Liqi Match?',
      'Bạn có thể đăng nhập lại bất cứ lúc nào bằng tài khoản đã liên kết.',
      [
        { style: 'cancel', text: 'Ở lại' },
        {
          onPress: () => void handleSignOut(),
          style: 'destructive',
          text: 'Đăng xuất',
        },
      ],
    );
  };

  const handleSignOut = async () => {
    if (!session || pendingKey) return;
    setPendingKey('deleteAccount');
    try {
      await signOut();
      router.replace(appRoutes.auth.login);
    } catch {
      setPendingKey(null);
      Alert.alert(
        'Chưa đăng xuất được',
        'Kết nối chưa ổn định. Vui lòng thử lại.',
      );
    }
  };

  const openDeleteModal = () => {
    if (pendingKey) return;
    impactWarning();
    setDeleteText('');
    setDeleteModalVisible(true);
  };

  const handleDeleteAccount = async () => {
    if (!session || pendingKey || !canConfirmDelete) return;
    setPendingKey('deleteAccount');
    try {
      await deleteOwnAccount(session);
      await signOut();
      setDeleteModalVisible(false);
      router.replace(appRoutes.auth.login);
    } catch (error) {
      Alert.alert(
        'Chưa xoá được tài khoản',
        error instanceof Error
          ? error.message
          : 'Vui lòng kiểm tra kết nối và thử lại.',
      );
      if (error instanceof AccountDeletionClientError) {
        if (error.synchronizedSession) {
          setSession(error.synchronizedSession);
        } else if (error.sessionEnded) {
          await signOut().catch(() => undefined);
          router.replace(appRoutes.auth.login);
        }
      }
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <LiqiScreen
      contentContainerStyle={styles.scrollContent}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <View style={styles.headerBar}>
        <LiqiOrbButton
          accessibilityLabel="Quay lại hồ sơ"
          surfaceTone="low"
          emphasis="low"
          onPress={() => {
            selectionImpact();
            router.back();
          }}
          size={42}
          style={styles.headerOrb}
        >
          <Ionicons
            color={liqiColors.text.primary}
            name="chevron-back"
            size={20}
          />
        </LiqiOrbButton>
        <View style={styles.headerCopy}>
          <ProfileText style={styles.headerEyebrow}>LIQI MATCH</ProfileText>
          <ProfileText style={styles.headerTitle}>Cài đặt</ProfileText>
        </View>
        <View aria-hidden style={styles.headerSpacer} />
      </View>
      <ProfileText style={styles.headerSubtitle}>
        Tinh chỉnh tài khoản, hồ sơ và quyền riêng tư của bạn.
      </ProfileText>

      {profile ? (
        <AccountSummaryCard
          accountSubtitle={accountSubtitle}
          displayName={profile.displayName}
          onPress={openProfile}
          source={profileAvatarSource}
          statusLabel={profile.statusLabel}
        />
      ) : (
        <ProfileReadStatusCard
          loading={profileQuery.isPending}
          onRetry={
            profileQuery.isError ? () => void profileQuery.refetch() : undefined
          }
          title={
            profileQuery.isPending
              ? 'Đang tải hồ sơ'
              : profileQuery.isError
                ? 'Không thể tải hồ sơ'
                : 'Không tìm thấy hồ sơ'
          }
        />
      )}

      <SettingsSection label="HỒ SƠ" title="Hồ sơ & chia sẻ">
        <SettingsRow
          icon="create-outline"
          onPress={openProfileEditor}
          subtitle="Tên, bio, avatar, cover, rank và tướng tủ."
          title="Chỉnh sửa hồ sơ"
        />
        <SettingsRow
          icon="images-outline"
          onPress={() => router.push(appRoutes.profile.gallery)}
          subtitle="Thêm, thay hoặc gỡ tối đa 4 ảnh trên tường hồ sơ."
          title="Khoảnh khắc nổi bật"
        />
        <SettingsRow
          icon="share-social-outline"
          onPress={openProfileShare}
          subtitle={
            settings.allowProfileShare
              ? 'Xuất PNG social để lưu hoặc gửi lên Zalo, Messenger, story.'
              : 'Đang tắt theo cài đặt quyền riêng tư.'
          }
          title="Ảnh chia sẻ hồ sơ"
        />
      </SettingsSection>

      <SettingsSection label="SOCIAL V2" title="Quan hệ & quyền riêng tư">
        <SettingsRow
          icon="people-outline"
          onPress={openSocialHub}
          subtitle="Bạn bè, lời mời đến, lời mời đã gửi và mute theo capability hiện tại."
          title="Social Hub"
        />
        <ProfilePrivacySettingsSection
          disabled={
            privacyMutation.isPending ||
            !socialCoordinator ||
            !privacyProvider ||
            !session ||
            !privacyQuery.data
          }
          error={privacyQuery.isError || !socialCoordinator || !privacyProvider}
          loading={privacyQuery.isPending}
          onChange={(key, value) => privacyMutation.mutate({ key, value })}
          onRetry={
            privacyQuery.isError ? () => void privacyQuery.refetch() : undefined
          }
          pendingKey={
            privacyMutation.isPending
              ? (privacyMutation.variables?.key ?? null)
              : null
          }
          privacy={privacyQuery.data ?? null}
        />
      </SettingsSection>

      <SettingsSection label="UY TÍN & KẾT NỐI" title="Uy tín & nhắc nhở">
        <SettingsRow
          icon="shield-checkmark-outline"
          onPress={openReputationLedger}
          subtitle="Xem các ghi nhận uy tín từ buổi chơi, lời khen và những lần chơi lại."
          title="Lịch sử uy tín"
        />
        <SettingsRow
          icon="notifications-outline"
          onPress={openEngagementPreferences}
          subtitle="Điều chỉnh thông báo hoạt động, phản hồi, chơi lại và giới hạn mỗi ngày."
          title="Nhắc nhở & hoạt động"
        />
      </SettingsSection>

      <SettingsSection label="RIÊNG TƯ" title="Hiển thị & an toàn">
        <SettingsRow
          accessory={
            <SettingToggle
              disabled={settingsQuery.isLoading || pendingKey !== null}
              loading={pendingKey === 'isDiscoverable'}
              onValueChange={(value) =>
                void updateSetting('isDiscoverable', value)
              }
              value={settings.isDiscoverable}
            />
          }
          icon="shield-checkmark-outline"
          onPress={() =>
            void updateSetting('isDiscoverable', !settings.isDiscoverable)
          }
          subtitle="Cho phép hồ sơ xuất hiện trong đề xuất và kết quả khám phá."
          title="Hiển thị trong khám phá"
        />
        <SettingsRow
          accessory={
            <SettingToggle
              disabled={settingsQuery.isLoading || pendingKey !== null}
              loading={pendingKey === 'allowProfileShare'}
              onValueChange={(value) =>
                void updateSetting('allowProfileShare', value)
              }
              value={settings.allowProfileShare}
            />
          }
          icon="image-outline"
          onPress={() =>
            void updateSetting('allowProfileShare', !settings.allowProfileShare)
          }
          subtitle="Chỉ áp dụng cho ảnh chia sẻ do bạn tạo; không thay đổi ai được xem hồ sơ."
          title="Cho phép tạo ảnh chia sẻ"
        />
        <SettingsRow
          accessory={
            <SettingToggle
              disabled={settingsQuery.isLoading || pendingKey !== null}
              loading={pendingKey === 'showWinRate'}
              onValueChange={(value) =>
                void updateSetting('showWinRate', value)
              }
              value={settings.showWinRate}
            />
          }
          icon="stats-chart-outline"
          onPress={() =>
            void updateSetting('showWinRate', !settings.showWinRate)
          }
          subtitle="Chỉ thay đổi cách hồ sơ hiển thị tỷ lệ thắng."
          title="Hiển thị tỷ lệ thắng"
        />
        <SettingsRow
          badge={`${blockedSummaryQuery.data?.totalCount ?? 0}`}
          icon="ban-outline"
          onPress={openBlockedUsers}
          subtitle="Xem và gỡ chặn người chơi đã chặn."
          title="Người đã chặn"
        />
      </SettingsSection>

      <SettingsSection label="PHÁP LÝ" title="Thông tin & hỗ trợ">
        <SettingsRow
          icon="document-text-outline"
          onPress={() => openLegalLink(legalLinks.terms)}
          subtitle="Quy định sử dụng Liqi Match."
          title="Điều khoản"
        />
        <SettingsRow
          icon="lock-closed-outline"
          onPress={() => openLegalLink(legalLinks.privacy)}
          subtitle="Cách dữ liệu và media hồ sơ được xử lý."
          title="Quyền riêng tư"
        />
      </SettingsSection>

      <SettingsSection label="PHIÊN ĐĂNG NHẬP" title="Tài khoản">
        <SettingsRow
          disabled={pendingKey !== null}
          icon="log-out-outline"
          onPress={confirmSignOut}
          subtitle="Chỉ xoá phiên đăng nhập trên thiết bị này, không xoá dữ liệu hồ sơ."
          title="Đăng xuất"
          tone="danger"
        />
        <SettingsRow
          disabled={pendingKey !== null}
          icon="trash-outline"
          onPress={openDeleteModal}
          subtitle="Xoá tài khoản, hồ sơ và media. Không thể hoàn tác."
          title="Xoá tài khoản"
          tone="danger"
        />
      </SettingsSection>

      <AccountDeleteModal
        confirmationText={deleteText}
        disabled={!canConfirmDelete || pendingKey === 'deleteAccount'}
        onCancel={() => {
          setDeleteModalVisible(false);
          setDeleteText('');
        }}
        onChangeText={setDeleteText}
        onConfirm={() => void handleDeleteAccount()}
        pending={pendingKey === 'deleteAccount'}
        visible={deleteModalVisible}
      />

      <View aria-hidden style={styles.bottomSpacer} />
    </LiqiScreen>
  );
}

const defaultSettingsState: ProfileSettingsState = {
  allowProfileShare: true,
  isDiscoverable: true,
  showWinRate: true,
};

function ProfileReadStatusCard({
  loading,
  onRetry,
  title,
}: {
  loading: boolean;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <LiqiCard
      density="list"
      emphasis="low"
      style={styles.accountCard}
      withShadow={false}
    >
      <View style={styles.profileReadStateRow}>
        <Ionicons
          color="rgba(178,235,255,0.78)"
          name={loading ? 'cloud-download-outline' : 'warning-outline'}
          size={20}
        />
        <View style={styles.accountCopy}>
          <ProfileText style={styles.accountName}>{title}</ProfileText>
          <ProfileText style={styles.accountMeta}>
            {loading
              ? 'Đang đồng bộ dữ liệu người chơi.'
              : 'Không dùng dữ liệu preview để thay thế kết quả repository.'}
          </ProfileText>
        </View>
        {!loading && onRetry ? (
          <LiqiButton accessibilityLabel="Thử tải lại hồ sơ" onPress={onRetry}>
            Thử lại
          </LiqiButton>
        ) : null}
      </View>
    </LiqiCard>
  );
}

function AccountSummaryCard({
  accountSubtitle,
  displayName,
  onPress,
  source,
  statusLabel,
}: {
  accountSubtitle: string;
  displayName: string;
  onPress: () => void;
  source?: ImageSourcePropType;
  statusLabel: string;
}) {
  return (
    <Pressable
      accessibilityLabel="Xem hồ sơ của tôi"
      accessibilityRole="button"
      android_ripple={null}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <LiqiCard
        density="list"
        emphasis="low"
        style={styles.accountCard}
        withShadow={false}
      >
        <View style={styles.accountRow}>
          <ProfileAvatar displayName={displayName} source={source} />
          <View style={styles.accountCopy}>
            <View style={styles.nameRow}>
              <ProfileText numberOfLines={1} style={styles.accountName}>
                {displayName}
              </ProfileText>
              <LiqiChip density="compact" selected variant="cyan">
                {statusLabel}
              </LiqiChip>
            </View>
            <ProfileText numberOfLines={1} style={styles.accountMeta}>
              {accountSubtitle}
            </ProfileText>
          </View>
          <Ionicons
            color="rgba(219,226,255,0.38)"
            name="chevron-forward"
            size={17}
          />
        </View>
      </LiqiCard>
    </Pressable>
  );
}

function SettingsSection({
  children,
  label,
  title,
}: {
  children: ReactNode;
  label: string;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <LiqiSectionHeader label={label} title={title} />
      <View style={styles.rows}>{children}</View>
    </View>
  );
}

function SettingsRow({
  accessory,
  badge,
  disabled,
  icon,
  onPress,
  subtitle,
  title,
  tone = 'default',
}: {
  accessory?: ReactNode;
  badge?: string;
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  subtitle: string;
  title: string;
  tone?: 'default' | 'danger';
}) {
  const interactive = Boolean(onPress && !disabled);
  const isDanger = tone === 'danger';
  const content = (
    <LiqiCard
      density="list"
      emphasis={interactive && !isDanger ? 'low' : 'none'}
      style={styles.rowCard}
      backgroundColor={isDanger ? 'rgba(48, 17, 31, 0.24)' : undefined}
      withShadow={false}
    >
      <View style={[styles.rowContent, disabled && styles.disabledRow]}>
        <View style={[styles.rowIconShell, isDanger && styles.dangerIconShell]}>
          <Ionicons
            color={
              isDanger ? 'rgba(255,194,207,0.82)' : 'rgba(178,235,255,0.78)'
            }
            name={icon}
            size={17}
          />
        </View>
        <View style={styles.rowCopy}>
          <ProfileText
            style={[styles.rowTitle, isDanger && styles.dangerTitle]}
          >
            {title}
          </ProfileText>
          <ProfileText style={styles.rowSubtitle}>{subtitle}</ProfileText>
        </View>
        {accessory}
        {badge ? <CountBadge value={badge} /> : null}
        {onPress && !accessory ? (
          <Ionicons
            color={
              isDanger ? 'rgba(255,194,207,0.36)' : 'rgba(219,226,255,0.38)'
            }
            name="chevron-forward"
            size={17}
          />
        ) : null}
      </View>
    </LiqiCard>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      android_ripple={null}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => pressed && !disabled && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

function SettingToggle({
  disabled,
  loading,
  onValueChange,
  value,
}: {
  disabled?: boolean;
  loading?: boolean;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[
        styles.toggleTrack,
        value && styles.toggleTrackOn,
        disabled && styles.toggleDisabled,
      ]}
    >
      <View style={[styles.toggleThumb, value && styles.toggleThumbOn]}>
        {loading ? <View style={styles.toggleLoadingDot} /> : null}
      </View>
    </Pressable>
  );
}

function CountBadge({ value }: { value: string }) {
  return (
    <View style={styles.countBadge}>
      <ProfileText style={styles.countBadgeText}>{value}</ProfileText>
    </View>
  );
}

function AccountDeleteModal({
  confirmationText,
  disabled,
  onCancel,
  onChangeText,
  onConfirm,
  pending,
  visible,
}: {
  confirmationText: string;
  disabled: boolean;
  onCancel: () => void;
  onChangeText: (value: string) => void;
  onConfirm: () => void;
  pending: boolean;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={styles.modalBackdrop}>
        <LiqiCard
          density="large"
          emphasis="low"
          style={styles.deleteModalCard}
          backgroundColor="rgba(32, 12, 24, 0.86)"
          variant="purple"
        >
          <View style={styles.deleteIconShell}>
            <Ionicons
              color="rgba(255,218,226,0.92)"
              name="trash-outline"
              size={24}
            />
          </View>
          <ProfileText style={styles.deleteTitle}>Xoá tài khoản?</ProfileText>
          <ProfileText style={styles.deleteBody}>
            Thao tác này xoá tài khoản đăng nhập, hồ sơ, dữ liệu ghép đôi cá
            nhân và media trên R2. Không thể hoàn tác.
          </ProfileText>
          <ProfileText style={styles.deleteHint}>
            Nhập DELETE để xác nhận.
          </ProfileText>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!pending}
            onChangeText={onChangeText}
            placeholder="DELETE"
            placeholderTextColor="rgba(255,255,255,0.28)"
            style={styles.deleteInput}
            value={confirmationText}
          />
          <View style={styles.deleteActions}>
            <LiqiButton
              accessibilityLabel="Huỷ xoá tài khoản"
              disabled={pending}
              emphasis="none"
              onPress={onCancel}
              style={styles.deleteActionButton}
              variant="secondary"
            >
              Huỷ
            </LiqiButton>
            <LiqiButton
              accessibilityLabel="Xác nhận xoá tài khoản"
              disabled={disabled}
              emphasis="low"
              onPress={onConfirm}
              style={styles.deleteActionButton}
              textStyle={styles.deleteButtonText}
              variant="ghost"
            >
              {pending ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
            </LiqiButton>
          </View>
        </LiqiCard>
      </View>
    </Modal>
  );
}

function ProfileAvatar({
  displayName,
  source,
}: {
  displayName: string;
  source?: ImageSourcePropType;
}) {
  const initials = initialsFromName(displayName);
  return (
    <View style={styles.avatarShell}>
      {source ? <Image source={source} style={styles.avatarImage} /> : null}
      {!source ? (
        <ProfileText style={styles.avatarInitials}>{initials}</ProfileText>
      ) : null}
    </View>
  );
}

function privacyErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : null;
}

function privacyErrorMessage(error: unknown) {
  const code = privacyErrorCode(error);
  if (code === 'privacy_version_conflict') {
    return 'Cài đặt đã thay đổi ở thiết bị khác. Hãy tải lại trước khi lưu.';
  }
  if (code === 'privacy_forbidden') {
    return 'Chưa thể xác minh quyền riêng tư. Các lựa chọn tạm thời bị khoá để bảo vệ bạn.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Vui lòng kiểm tra kết nối và thử lại.';
}

function compactUserId(userId: string | undefined) {
  if (!userId) return 'Chưa đăng nhập';
  return `ID ${userId.slice(0, 8)}`;
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'L';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : undefined;
  return `${first}${second ?? ''}`.toUpperCase();
}

function impactLight() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
}

function impactWarning() {
  void Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Warning,
  ).catch(() => undefined);
}

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

const styles = StyleSheet.create({
  accountCard: { marginTop: 14 },
  accountCopy: { flex: 1, minWidth: 0 },
  accountMeta: {
    color: liqiColors.text.muted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  accountName: {
    color: liqiColors.text.primary,
    flex: 1,
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.22,
  },
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    minHeight: 60,
  },
  profileReadStateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    minHeight: 60,
  },
  avatarImage: { height: '100%', width: '100%' },
  avatarInitials: {
    color: 'rgba(250,252,255,0.94)',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.36,
  },
  avatarShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(104,76,185,0.20)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  bottomSpacer: { height: 42 },
  countBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countBadgeText: {
    color: liqiColors.text.secondary,
    fontSize: 12,
    fontWeight: '800',
  },
  dangerIconShell: {
    backgroundColor: 'rgba(255,117,149,0.08)',
    borderColor: 'rgba(255,154,179,0.14)',
  },
  dangerTitle: { color: 'rgba(255,225,232,0.94)' },
  deleteActionButton: { flex: 1, minWidth: 0 },
  deleteActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  deleteBody: {
    color: liqiColors.text.secondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 9,
    textAlign: 'center',
  },
  deleteButtonText: { color: 'rgba(255,225,232,0.96)' },
  deleteHint: {
    color: 'rgba(255,216,168,0.80)',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
  deleteIconShell: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,117,149,0.10)',
    borderColor: 'rgba(255,154,179,0.16)',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  deleteInput: {
    backgroundColor: 'rgba(255,255,255,0.065)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    color: liqiColors.text.primary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginTop: 10,
    minHeight: 46,
    paddingHorizontal: 14,
    textAlign: 'center',
  },
  deleteModalCard: { width: '100%' },
  deleteTitle: {
    color: 'rgba(255,238,242,0.96)',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.34,
    marginTop: 14,
    textAlign: 'center',
  },
  disabledRow: { opacity: 0.56 },
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
    color: liqiColors.text.secondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 9,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  headerTitle: {
    ...liqiTypography.screenTitle,
    fontSize: 24,
    letterSpacing: -0.48,
    marginTop: 1,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.992 }] },
  rowCard: { marginTop: 8 },
  rowContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    minHeight: 58,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.06)',
    borderColor: 'rgba(103,232,255,0.11)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  rowSubtitle: {
    color: liqiColors.text.muted,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 3,
  },
  rowTitle: {
    color: liqiColors.text.primary,
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.16,
  },
  rows: { marginTop: 6 },
  scrollContent: { paddingBottom: 36, paddingTop: 2 },
  section: { marginTop: 12 },
  toggleDisabled: { opacity: 0.54 },
  toggleLoadingDot: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  toggleThumb: {
    alignItems: 'center',
    backgroundColor: 'rgba(226,232,255,0.72)',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    transform: [{ translateX: 1 }],
    width: 22,
  },
  toggleThumbOn: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    transform: [{ translateX: 21 }],
  },
  toggleTrack: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 26,
    justifyContent: 'center',
    paddingHorizontal: 1,
    width: 46,
  },
  toggleTrackOn: {
    backgroundColor: 'rgba(72,198,255,0.36)',
    borderColor: 'rgba(134,235,255,0.30)',
  },
});
