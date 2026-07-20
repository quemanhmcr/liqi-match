import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  useAssetResolver,
  usePreloadAssetSurface,
} from '@/entities/media-asset';
import { MatchSetPickerModal } from '@/entities/match-set/ui';
import {
  useSocialCommandCoordinator,
  useSocialRelationshipRepository,
} from '@/entities/social-relationship/RelationshipCapabilitiesProvider';
import { usePlayerTrustProjection } from '@/entities/trust-outcomes';
import { useAuth } from '@/shared/auth/auth-context';
import { runtimeEnvironment } from '@/shared/config/env';
import { PlayerIdSchema } from '@/shared/contracts/core-v1';
import { LiqiIdentityHeader, liqiDaypartCopy } from '@/shared/components/liqi';
import { classifyApplicationError } from '@/shared/errors/application-error';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';
import {
  isCompactLiqiViewport,
  liqiColors,
  liqiComponentColors,
  liqiComponentGradients,
  liqiComponents,
  liqiRadius,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import { ProfileConnectionStatus } from '../components/ProfileConnectionStatus';
import { ProfileFavoriteHeroes } from '../components/ProfileFavoriteHeroes';
import {
  ProfileHeroCard,
  type ProfileHeroMode,
} from '../components/ProfileHeroCard';
import { ProfileHighlights } from '../components/ProfileHighlights';
import { ProfilePlayStyle } from '../components/ProfilePlayStyle';
import { ProfileActionButton } from '../components/ProfilePresentationPrimitives';
import { ProfileRelationshipActions } from '../components/ProfileRelationshipActions';
import { ProfileStatsBar } from '../components/ProfileStatsBar';
import { ProfileText } from '../components/ProfileShared';
import { resolveProfileMedia } from '../model/profile-media';
import { useProfileReadRepository } from '../runtime/ProfileReadRepositoryProvider';
import type { ProfileViewModel } from '../services/profile-service';

export type ProfileScreenProps = {
  identityId?: string;
  mode: ProfileHeroMode;
};

export function ProfileScreen({ identityId, mode }: ProfileScreenProps) {
  usePreloadAssetSurface('profile');
  const { width: viewportWidth } = useWindowDimensions();
  const compact = isCompactLiqiViewport(viewportWidth);
  const { session } = useAuth();
  const profileRepository = useProfileReadRepository();
  const relationshipRepository = useSocialRelationshipRepository();
  const socialCoordinator = useSocialCommandCoordinator();
  const [setPickerVisible, setSetPickerVisible] = useState(false);

  const openProfileEditor = () => {
    selectionImpact();
    router.push(appRoutes.profile.edit);
  };
  const openProfileGallery = () => {
    selectionImpact();
    router.push(appRoutes.profile.gallery);
  };
  const openProfileShare = () => {
    impactLight();
    router.push(appRoutes.profile.share);
  };
  const openProfileSettings = () => {
    selectionImpact();
    router.push(appRoutes.profile.settings);
  };
  const returnFromProfile = () => {
    selectionImpact();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate(appRoutes.main.home);
  };

  const profileQuery = useQuery({
    enabled: Boolean(session && (mode === 'self' || identityId)),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return profileRepository.getProfile({
        session,
        identityId: mode === 'other' ? identityId : undefined,
      });
    },
    queryKey: [
      'profile-view',
      runtimeEnvironment.supabaseProjectRef,
      session?.principal?.playerId ?? session?.user.id,
      mode,
      identityId ?? session?.principal?.playerId ?? session?.user.id,
    ],
  });

  const profile = profileQuery.data;
  const profileFailure = classifyApplicationError(profileQuery.error);
  const viewerPlayerId = session?.principal?.playerId;
  const targetPlayerId = profile?.playerId;
  const trustProjectionQuery = usePlayerTrustProjection(
    session,
    targetPlayerId,
  );
  const hasCanonicalSocialIdentity = Boolean(
    mode === 'other' &&
    socialCoordinator &&
    viewerPlayerId &&
    targetPlayerId &&
    targetPlayerId !== viewerPlayerId &&
    PlayerIdSchema.safeParse(targetPlayerId).success,
  );
  const relationshipQueryKey = [
    'social-relationship',
    runtimeEnvironment.supabaseProjectRef,
    viewerPlayerId,
    targetPlayerId,
  ] as const;
  const relationshipQuery = useQuery({
    enabled: hasCanonicalSocialIdentity,
    queryFn: () => {
      if (!session || !targetPlayerId) {
        throw new Error('Missing canonical social relationship identity.');
      }
      return relationshipRepository.getRelationship(session, targetPlayerId);
    },
    queryKey: relationshipQueryKey,
  });
  const relationship = relationshipQuery.data;
  const authoritativeMessageDisabled = Boolean(
    socialCoordinator &&
    mode === 'other' &&
    (!relationship?.capabilities.canMessage || !profile?.conversationId),
  );
  const authoritativeInviteDisabled = Boolean(
    socialCoordinator &&
    mode === 'other' &&
    !relationship?.capabilities.canInviteToSession,
  );

  if (!session || (mode === 'other' && !identityId)) {
    return (
      <ProfileReadState
        description="Thiếu phiên đăng nhập hoặc thông tin hồ sơ cần thiết."
        mode={mode}
        title="Không thể mở hồ sơ"
      />
    );
  }

  if (profileQuery.isPending) {
    return (
      <ProfileReadState
        description="Đang đồng bộ dữ liệu người chơi."
        loading
        mode={mode}
        title="Đang tải hồ sơ"
      />
    );
  }

  if (profileQuery.isError && !profile) {
    return (
      <ProfileReadState
        description={
          profileFailure.kind === 'offline'
            ? 'Thiết bị đang offline. Kết nối lại để tải hồ sơ.'
            : profileFailure.retryable
              ? 'Dịch vụ hồ sơ tạm thời chưa phản hồi. Hãy thử lại.'
              : 'Hồ sơ hiện chưa thể hiển thị. Hãy thử lại sau.'
        }
        mode={mode}
        onRetry={
          profileFailure.retryable
            ? () => void profileQuery.refetch()
            : undefined
        }
        title="Không thể tải hồ sơ"
      />
    );
  }

  if (!profile) {
    return (
      <ProfileReadState
        description="Người chơi này không tồn tại hoặc không còn khả dụng."
        mode={mode}
        title="Không tìm thấy hồ sơ"
      />
    );
  }

  const openTrustLedger = targetPlayerId
    ? () => {
        selectionImpact();
        router.push(
          mode === 'self'
            ? appRoutes.profile.reputation
            : appRoutes.profile.reputationFor(targetPlayerId),
        );
      }
    : undefined;

  return (
    <LiqiScreen
      contentContainerStyle={[
        styles.scrollContent,
        compact && styles.scrollContentCompact,
      ]}
      withBottomNavPadding={mode === 'self'}
      withHeader={false}
    >
      <LiqiIdentityHeader
        actions={
          mode === 'self'
            ? [
                {
                  accessibilityLabel: 'Cài đặt hồ sơ',
                  icon: 'settings-outline',
                  onPress: openProfileSettings,
                },
                {
                  accessibilityLabel: 'Chỉnh sửa hồ sơ',
                  emphasized: true,
                  icon: 'create-outline',
                  onPress: openProfileEditor,
                },
              ]
            : [
                {
                  accessibilityLabel: 'Quay lại',
                  icon: 'chevron-back',
                  onPress: returnFromProfile,
                },
              ]
        }
        avatar={<ProfileHeaderAvatar compact={compact} profile={profile} />}
        compact={compact}
        online={profile.statusValue === 'ready'}
        subtitle={`${liqiDaypartCopy()} · ${profile.statusLabel}`}
        testID="profile-identity-header"
        title={`${profileFirstName(profile.displayName)} ✨`}
      />

      {profileQuery.isError ? (
        <View
          accessibilityLabel="Hồ sơ đang hiển thị dữ liệu cũ"
          style={styles.staleBanner}
        >
          <Ionicons
            color={liqiColors.status.warning}
            name="information-circle"
            size={16}
          />
          <ProfileText style={styles.staleText}>
            Không thể làm mới. Đang hiển thị hồ sơ đã tải gần nhất.
          </ProfileText>
        </View>
      ) : null}

      <ProfileHeroCard
        compact={compact}
        inviteDisabled={authoritativeInviteDisabled}
        messageDisabled={authoritativeMessageDisabled}
        mode={mode}
        onInvite={() => {
          impactLight();
          setSetPickerVisible(true);
        }}
        onMessage={() => {
          selectionImpact();
          if (profile.conversationId) {
            router.push(appRoutes.messages.detail(profile.conversationId));
          }
        }}
        profile={profile}
      />

      <ProfileStatsBar
        compact={compact}
        onOpenTrust={openTrustLedger}
        projection={trustProjectionQuery.data}
      />

      {mode === 'other' && socialCoordinator ? (
        relationship ? (
          <ProfileRelationshipActions
            coordinator={socialCoordinator}
            queryKey={relationshipQueryKey}
            relationship={relationship}
            session={session}
          />
        ) : (
          <RelationshipReadState loading={relationshipQuery.isPending} />
        )
      ) : null}

      <View style={[styles.detailGrid, compact && styles.detailGridCompact]}>
        <ProfileFavoriteHeroes
          compact={compact}
          heroes={profile.favoriteHeroes}
          onOpen={mode === 'self' ? openProfileEditor : undefined}
          showWinRate={profile.showWinRate}
        />
        <ProfilePlayStyle compact={compact} tags={profile.playStyleTags} />
      </View>

      <ProfileHighlights
        compact={compact}
        coverAssetKey={profile.coverAssetKey}
        coverUrl={profile.coverUrl}
        mode={mode}
        onManage={mode === 'self' ? openProfileGallery : undefined}
        wallAssetKeys={profile.wallAssetKeys}
        wallUrls={profile.wallUrls}
      />

      <ProfileConnectionStatus
        compact={compact}
        onShare={mode === 'self' ? openProfileShare : undefined}
        profile={profile}
      />

      {mode === 'other' && targetPlayerId && setPickerVisible ? (
        <MatchSetPickerModal
          onClose={() => setSetPickerVisible(false)}
          targetDisplayName={profile.displayName}
          targetPlayerId={targetPlayerId}
          visible={setPickerVisible}
        />
      ) : null}
    </LiqiScreen>
  );
}

function ProfileHeaderAvatar({
  compact,
  profile,
}: {
  compact: boolean;
  profile: ProfileViewModel;
}) {
  const resolver = useAssetResolver();
  const media = resolveProfileMedia(resolver, {
    assetKey: profile.avatarAssetKey,
    uri: profile.avatarUrl ?? profile.avatarFallbackUrl,
  });
  const size = compact
    ? liqiComponents.identityHeader.avatarCompact
    : liqiComponents.identityHeader.avatar;

  return (
    <LinearGradient
      colors={liqiComponentGradients.identityHeader.avatarRing}
      style={[
        styles.headerAvatarRing,
        { borderRadius: size / 2, height: size, width: size },
      ]}
    >
      {media.source ? (
        <Image
          accessibilityLabel={`Avatar ${profile.displayName}`}
          resizeMode="cover"
          source={media.source}
          style={{
            borderRadius: size / 2 - 2,
            height: size - 4,
            width: size - 4,
          }}
        />
      ) : (
        <View
          accessibilityLabel={`Avatar đầu trang hồ sơ ${media.state}`}
          style={[
            styles.headerAvatarFallback,
            {
              borderRadius: size / 2 - 2,
              height: size - 4,
              width: size - 4,
            },
          ]}
        >
          <ProfileText style={styles.headerAvatarInitials}>
            {profile.displayName.trim().charAt(0).toUpperCase() || 'L'}
          </ProfileText>
        </View>
      )}
    </LinearGradient>
  );
}

function profileFirstName(displayName: string) {
  const value = displayName.trim();
  if (!value) return 'Bạn';
  return value.split(/\s+/)[0] ?? value;
}

function RelationshipReadState({ loading }: { loading: boolean }) {
  return (
    <View
      accessibilityLabel="Trạng thái quan hệ không khả dụng"
      style={styles.relationshipReadState}
    >
      {loading ? (
        <ActivityIndicator color={liqiColors.accent.purple} size="small" />
      ) : null}
      <ProfileText style={styles.relationshipReadStateText}>
        {loading
          ? 'Đang kiểm tra quyền quan hệ và an toàn…'
          : 'Không thể xác minh quyền quan hệ. Các hành động tương tác đang bị khoá an toàn.'}
      </ProfileText>
    </View>
  );
}

function ProfileReadState({
  description,
  loading = false,
  mode,
  onRetry,
  title,
}: {
  description: string;
  loading?: boolean;
  mode: ProfileHeroMode;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <LiqiScreen
      contentContainerStyle={styles.readStateScreen}
      withBottomNavPadding={mode === 'self'}
      withHeader={false}
    >
      {loading ? (
        <ActivityIndicator color={liqiColors.accent.purple} size="large" />
      ) : null}
      <ProfileText style={styles.readStateTitle}>{title}</ProfileText>
      <ProfileText style={styles.readStateDescription}>
        {description}
      </ProfileText>
      {!loading && onRetry ? (
        <ProfileActionButton
          label="Thử tải lại hồ sơ"
          onPress={onRetry}
          style={styles.retryButton}
          variant="primary"
        />
      ) : null}
    </LiqiScreen>
  );
}

function impactLight() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
}

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

const styles = StyleSheet.create({
  detailGrid: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: liqiSpacing.lg,
  },
  detailGridCompact: {
    flexDirection: 'column',
  },
  headerAvatarFallback: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.profile.avatarFallback,
    justifyContent: 'center',
  },
  headerAvatarInitials: {
    ...liqiTypography.greeting,
    color: liqiColors.text.primary,
  },
  headerAvatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  readStateDescription: {
    ...liqiTypography.body,
    color: liqiColors.text.secondary,
    maxWidth: 320,
    textAlign: 'center',
  },
  readStateScreen: {
    alignItems: 'center',
    flexGrow: 1,
    gap: liqiSpacing['2xl'],
    justifyContent: 'center',
    paddingHorizontal: liqiSpacing['6xl'],
  },
  readStateTitle: {
    ...liqiTypography.cardTitle,
    color: liqiColors.text.primary,
    textAlign: 'center',
  },
  retryButton: { minWidth: 128 },
  relationshipReadState: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.profile.statusSurface,
    borderColor: liqiColors.border.card,
    borderRadius: liqiRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: liqiSpacing.lg,
    paddingHorizontal: liqiSpacing.xl,
    paddingVertical: liqiSpacing.lg,
  },
  relationshipReadStateText: {
    ...liqiTypography.subtitle,
    color: liqiColors.text.secondary,
    flex: 1,
  },
  scrollContent: {
    gap: liqiComponents.screen.gap,
    paddingTop: liqiSpacing.lg,
  },
  scrollContentCompact: { gap: liqiComponents.screen.gapCompact },
  staleBanner: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.profile.actions.ghost.background,
    borderColor: liqiComponentColors.profile.pills.amber.border,
    borderRadius: liqiRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: liqiSpacing.md,
    paddingHorizontal: liqiSpacing.xl,
    paddingVertical: liqiSpacing.md,
  },
  staleText: {
    ...liqiTypography.caption,
    color: liqiColors.text.secondary,
    flex: 1,
  },
});
