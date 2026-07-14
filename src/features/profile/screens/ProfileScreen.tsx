import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  useSocialCommandCoordinator,
  useSocialRelationshipRepository,
} from '@/entities/social-relationship/RelationshipCapabilitiesProvider';
import { usePreloadAssetSurface } from '@/entities/media-asset';
import { LiquidButton, LiquidOrbButton } from '@/shared/components/liquid';
import { classifyApplicationError } from '@/shared/errors/application-error';
import { useAuth } from '@/shared/auth/auth-context';
import { PlayerIdSchema } from '@/shared/contracts/core-v1';
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
  const openProfileEditor = () => {
    selectionImpact();
    router.push(appRoutes.profile.edit);
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
    queryKey: ['profile-view', mode, identityId ?? session?.user.id],
  });

  const profile = profileQuery.data;
  const profileFailure = classifyApplicationError(profileQuery.error);
  const viewerPlayerId = session?.principal?.playerId;
  const targetPlayerId = profile?.playerId;
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
        description="Thiếu phiên đăng nhập hoặc định danh hồ sơ canonical."
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
              ? 'Repository tạm thời chưa phản hồi. Hãy thử lại.'
              : 'Yêu cầu hồ sơ không thể hoàn tất. Ứng dụng không dùng fixture để che trạng thái này.'
        }
      />
    );
  }

  if (!profile) {
    return (
      <ProfileReadState
        mode={mode}
        title="Không tìm thấy hồ sơ"
        description="Định danh này không tồn tại trong runtime hiện tại."
      />
    );
  }

  const vibe = Math.max(0, Math.min(100, Math.round(profile.stats.reputation)));

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
        onInvite={impactLight}
        onMessage={() => {
          selectionImpact();
          if (profile.conversationId) {
            router.push(appRoutes.messages.detail(profile.conversationId));
          }
        }}
        onShare={openProfileShare}
        profile={profile}
        vibe={vibe}
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
      <ProfileFavoriteHeroes
        heroes={profile.favoriteHeroes}
        showWinRate={profile.showWinRate}
        onOpen={mode === 'self' ? openProfileEditor : undefined}
      />
      <ProfilePlayStyle tags={profile.playStyleTags} />
      <ProfileHighlights mode={mode} wallAssetKeys={profile.wallAssetKeys} />
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
      <LiquidOrbButton
        accessibilityLabel={
          mode === 'self' ? 'Cài đặt hồ sơ' : 'Tùy chọn hồ sơ'
        }
        glowIntensity="low"
        onPress={mode === 'self' ? onSettings : selectionImpact}
        glassIntensity="low"
        size={42}
        style={styles.topOrb}
      >
        <Ionicons
          color={liquidColors.text.primary}
          name={mode === 'self' ? 'settings-outline' : 'ellipsis-horizontal'}
          size={18}
        />
      </LiquidOrbButton>
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
