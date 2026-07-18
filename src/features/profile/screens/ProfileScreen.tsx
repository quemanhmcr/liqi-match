import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { MatchSetPickerModal } from '@/entities/match-set/ui';
import {
  useSocialCommandCoordinator,
  useSocialRelationshipRepository,
} from '@/entities/social-relationship/RelationshipCapabilitiesProvider';
import { usePreloadAssetSurface } from '@/entities/media-asset';
import { usePlayerTrustProjection } from '@/entities/trust-outcomes';
import { LiquidButton, LiquidOrbButton } from '@/shared/components/liquid';
import { classifyApplicationError } from '@/shared/errors/application-error';
import { useAuth } from '@/shared/auth/auth-context';
import { PlayerIdSchema } from '@/shared/contracts/core-v1';
import { runtimeEnvironment } from '@/shared/config/env';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import { ProfileFavoriteHeroes } from '../components/ProfileFavoriteHeroes';
import {
  ProfileHeroCard,
  type ProfileHeroMode,
} from '../components/ProfileHeroCard';
import { ProfileHighlights } from '../components/ProfileHighlights';
import { ProfileRelationshipActions } from '../components/ProfileRelationshipActions';
import { ProfilePlayStyle } from '../components/ProfilePlayStyle';
import { ProfileText } from '../components/ProfileShared';
import { useProfileReadRepository } from '../runtime/ProfileReadRepositoryProvider';

export type ProfileScreenProps = {
  identityId?: string;
  mode: ProfileHeroMode;
};

export function ProfileScreen({ identityId, mode }: ProfileScreenProps) {
  usePreloadAssetSurface('profile');
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
        mode={mode}
        title="Không thể mở hồ sơ"
        description="Thiếu phiên đăng nhập hoặc thông tin hồ sơ cần thiết."
      />
    );
  }

  if (profileQuery.isPending) {
    return (
      <ProfileReadState
        loading
        mode={mode}
        title="Đang tải hồ sơ"
        description="Đang đồng bộ dữ liệu người chơi."
      />
    );
  }

  if (profileQuery.isError && !profile) {
    return (
      <ProfileReadState
        mode={mode}
        onRetry={
          profileFailure.retryable
            ? () => void profileQuery.refetch()
            : undefined
        }
        title="Không thể tải hồ sơ"
        description={
          profileFailure.kind === 'offline'
            ? 'Thiết bị đang offline. Kết nối lại để tải hồ sơ.'
            : profileFailure.retryable
              ? 'Dịch vụ hồ sơ tạm thời chưa phản hồi. Hãy thử lại.'
              : 'Hồ sơ hiện chưa thể hiển thị. Hãy thử lại sau.'
        }
      />
    );
  }

  if (!profile) {
    return (
      <ProfileReadState
        mode={mode}
        title="Không tìm thấy hồ sơ"
        description="Người chơi này không tồn tại hoặc không còn khả dụng."
      />
    );
  }

  return (
    <LiquidScreen
      contentContainerStyle={styles.scrollContent}
      withBottomNavPadding={mode === 'self'}
      withHeader={false}
    >
      <ProfileTopBar
        loading={profileQuery.isLoading}
        mode={mode}
        onSettings={openProfileSettings}
      />
      {profileQuery.isError ? (
        <View
          accessibilityLabel="Hồ sơ đang hiển thị dữ liệu cũ"
          style={styles.staleBanner}
        >
          <Ionicons color="#FFB86B" name="information-circle" size={16} />
          <ProfileText style={styles.staleText}>
            Không thể làm mới. Đang hiển thị hồ sơ đã tải gần nhất.
          </ProfileText>
        </View>
      ) : null}
      <ProfileHeroCard
        inviteDisabled={authoritativeInviteDisabled}
        messageDisabled={authoritativeMessageDisabled}
        mode={mode}
        onEdit={mode === 'self' ? openProfileEditor : selectionImpact}
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
        onShare={openProfileShare}
        profile={profile}
        trustProjection={trustProjectionQuery.data}
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
      {targetPlayerId && trustProjectionQuery.data ? (
        <LiquidButton
          accessibilityLabel="Mở lịch sử uy tín"
          glowIntensity="low"
          onPress={() =>
            router.push(
              mode === 'self'
                ? appRoutes.profile.reputation
                : appRoutes.profile.reputationFor(targetPlayerId),
            )
          }
          style={styles.trustLedgerButton}
          variant="secondary"
          withShadow={false}
        >
          <Ionicons
            color="rgba(178,235,255,0.86)"
            name="shield-checkmark-outline"
            size={17}
          />
          <ProfileText style={styles.trustLedgerButtonText}>
            Xem lịch sử uy tín
          </ProfileText>
        </LiquidButton>
      ) : null}
      <ProfileFavoriteHeroes
        heroes={profile.favoriteHeroes}
        showWinRate={profile.showWinRate}
        onOpen={mode === 'self' ? openProfileEditor : undefined}
      />
      <ProfilePlayStyle tags={profile.playStyleTags} />
      <ProfileHighlights
        mode={mode}
        onManage={mode === 'self' ? openProfileGallery : undefined}
        wallAssetKeys={profile.wallAssetKeys}
        wallUrls={profile.wallUrls}
      />
      {mode === 'other' && targetPlayerId && setPickerVisible ? (
        <MatchSetPickerModal
          onClose={() => setSetPickerVisible(false)}
          targetDisplayName={profile.displayName}
          targetPlayerId={targetPlayerId}
          visible={setPickerVisible}
        />
      ) : null}
    </LiquidScreen>
  );
}

function RelationshipReadState({ loading }: { loading: boolean }) {
  return (
    <View
      accessibilityLabel="Trạng thái quan hệ không khả dụng"
      style={styles.relationshipReadState}
    >
      {loading ? <ActivityIndicator color="#C679FF" size="small" /> : null}
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
    <LiquidScreen
      contentContainerStyle={styles.readStateScreen}
      withBottomNavPadding={mode === 'self'}
      withHeader={false}
    >
      {loading ? <ActivityIndicator color="#C679FF" size="large" /> : null}
      <ProfileText style={styles.readStateTitle}>{title}</ProfileText>
      <ProfileText style={styles.readStateDescription}>
        {description}
      </ProfileText>
      {!loading && onRetry ? (
        <LiquidButton accessibilityLabel="Thử tải lại hồ sơ" onPress={onRetry}>
          Thử lại
        </LiquidButton>
      ) : null}
    </LiquidScreen>
  );
}

function ProfileTopBar({
  loading,
  mode,
  onSettings,
}: {
  loading: boolean;
  mode: ProfileHeroMode;
  onSettings: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <LiquidOrbButton
        accessibilityLabel="Quay lại"
        glowIntensity="low"
        onPress={() => {
          selectionImpact();
          if (router.canGoBack()) {
            router.back();
            return;
          }
          router.navigate(appRoutes.main.home);
        }}
        glassIntensity="low"
        size={42}
        style={styles.topOrb}
      >
        <Ionicons
          color={liquidColors.text.primary}
          name="chevron-back"
          size={20}
        />
      </LiquidOrbButton>
      <View style={styles.titleBlock}>
        <ProfileText style={styles.title}>Hồ sơ</ProfileText>
        {loading ? <ActivityIndicator color="#C679FF" size="small" /> : null}
      </View>
      {mode === 'self' ? (
        <LiquidOrbButton
          accessibilityLabel="Cài đặt hồ sơ"
          glowIntensity="low"
          onPress={onSettings}
          glassIntensity="low"
          size={42}
          style={styles.topOrb}
        >
          <Ionicons
            color={liquidColors.text.primary}
            name="settings-outline"
            size={18}
          />
        </LiquidOrbButton>
      ) : (
        <View style={styles.topOrb} />
      )}
    </View>
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
  trustLedgerButton: { marginTop: 10 },
  trustLedgerButtonText: {
    color: 'rgba(231,236,255,0.86)',
    fontSize: 12.5,
    fontWeight: '800',
  },
  relationshipReadState: {
    alignItems: 'center',
    backgroundColor: 'rgba(198,121,255,0.08)',
    borderColor: 'rgba(198,121,255,0.18)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  relationshipReadStateText: {
    color: 'rgba(226,232,255,0.70)',
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  staleBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,184,107,0.09)',
    borderColor: 'rgba(255,184,107,0.18)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  staleText: {
    color: 'rgba(255,226,190,0.78)',
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
  },
  readStateDescription: {
    color: 'rgba(224,230,248,0.72)',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 320,
    textAlign: 'center',
  },
  readStateScreen: {
    alignItems: 'center',
    flexGrow: 1,
    gap: 14,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  readStateTitle: {
    color: liquidColors.text.primary,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  scrollContent: {
    paddingTop: 3,
  },
  title: {
    ...liquidTypography.sectionTitle,
    color: liquidColors.text.primary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.18,
  },
  titleBlock: {
    alignItems: 'center',
    flex: 1,
    gap: 5,
    justifyContent: 'center',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    minHeight: 48,
  },
  topOrb: {
    height: 42,
    width: 42,
  },
});
