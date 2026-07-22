import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { usePreloadAssetSurface } from '@/entities/media-asset';
import { MatchSetPickerModal } from '@/entities/match-set/ui';
import {
  useSocialCommandCoordinator,
  useSocialRelationshipRepository,
} from '@/entities/social-relationship/RelationshipCapabilitiesProvider';
import { usePlayerTrustProjection } from '@/entities/trust-outcomes';
import { useAuth } from '@/shared/auth/auth-context';
import { runtimeEnvironment } from '@/shared/config/env';
import { PlayerIdSchema } from '@/shared/contracts/core-v1';
import { classifyApplicationError } from '@/shared/errors/application-error';
import {
  AppButton,
  AppCard,
  AppIconButton,
  AppScreen,
  AppText,
  appColors,
  appSpacing,
  isCompactViewport,
} from '@/shared/ui';

import { ProfileHighlightSummary } from '../components/ProfileHighlightSummary';
import { ProfileMemorySection } from '../components/ProfileMemorySection';
import { ProfilePlayStyleGallery } from '../components/ProfilePlayStyleGallery';
import {
  ProfileReferenceHero,
  type ProfileHeroMode,
} from '../components/ProfileReferenceHero';
import { ProfileRelationshipActions } from '../components/ProfileRelationshipActions';
import { ProfileSocialStats } from '../components/ProfileSocialStats';
import { ProfileTrustSections } from '../components/ProfileTrustSections';
import {
  presentProfileHighlights,
  presentProfilePlayStyle,
  presentProfileSocialStats,
} from '../model/profile-surface-presenter';
import { useProfileReadRepository } from '../runtime/ProfileReadRepositoryProvider';
import { profileUi } from '../ui/profile-ui';

export type ProfileScreenProps = {
  identityId?: string;
  mode: ProfileHeroMode;
};

export function ProfileScreen({ identityId, mode }: ProfileScreenProps) {
  usePreloadAssetSurface('profile');
  const { width } = useWindowDimensions();
  const compact = isCompactViewport(width);
  const { session } = useAuth();
  const profileRepository = useProfileReadRepository();
  const relationshipRepository = useSocialRelationshipRepository();
  const socialCoordinator = useSocialCommandCoordinator();
  const [setPickerVisible, setSetPickerVisible] = useState(false);

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
        icon="person-circle-outline"
        mode={mode}
        onBack={mode === 'other' ? returnFromProfile : undefined}
        title="Không thể mở hồ sơ"
      />
    );
  }

  if (profileQuery.isPending) {
    return (
      <ProfileReadState
        description="Đang đồng bộ dữ liệu người chơi và trạng thái media."
        icon="person-outline"
        loading
        mode={mode}
        onBack={mode === 'other' ? returnFromProfile : undefined}
        title="Đang tải hồ sơ"
      />
    );
  }

  if (profileQuery.isError && !profile) {
    const offline = profileFailure.kind === 'offline';
    return (
      <ProfileReadState
        description={
          offline
            ? 'Thiết bị đang offline. Kết nối lại để tải hồ sơ.'
            : profileFailure.retryable
              ? 'Dịch vụ hồ sơ tạm thời chưa phản hồi. Hãy thử lại.'
              : 'Hồ sơ hiện chưa thể hiển thị. Hãy thử lại sau.'
        }
        icon={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
        mode={mode}
        onBack={mode === 'other' ? returnFromProfile : undefined}
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
        icon="search-outline"
        mode={mode}
        onBack={mode === 'other' ? returnFromProfile : undefined}
        title="Không tìm thấy hồ sơ"
      />
    );
  }

  const openProfileEditor = () => {
    selectionImpact();
    router.push(appRoutes.profile.edit);
  };
  const openProfilePlayStyleEditor = () => {
    selectionImpact();
    router.push(appRoutes.profile.editPlayStyle);
  };
  const openProfileShare = () => {
    impactLight();
    router.push(appRoutes.profile.share);
  };

  return (
    <AppScreen
      contentContainerStyle={styles.screenContent}
      withBottomNavPadding={mode === 'self'}
      withHeader={false}
    >
      <ProfileReferenceHero
        compact={compact}
        inviteDisabled={authoritativeInviteDisabled}
        messageDisabled={authoritativeMessageDisabled}
        mode={mode}
        onBack={returnFromProfile}
        onEdit={mode === 'self' ? openProfileEditor : undefined}
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
        onMore={() =>
          Alert.alert(
            'Tùy chọn hồ sơ',
            'Các thao tác quan hệ và an toàn được hiển thị trong phần bên dưới.',
          )
        }
        onShare={mode === 'self' ? openProfileShare : undefined}
        profile={profile}
      />

      <ProfileSocialStats
        compact={compact}
        items={presentProfileSocialStats(profile.socialStats)}
      />

      <View
        style={[
          styles.sections,
          compact ? styles.sectionsCompact : styles.sectionsRegular,
        ]}
      >
        {profileQuery.isError ? <StaleProfileBanner /> : null}

        <ProfileHighlightSummary
          compact={compact}
          items={presentProfileHighlights(profile)}
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

        <ProfilePlayStyleGallery
          compact={compact}
          onOpen={mode === 'self' ? openProfilePlayStyleEditor : undefined}
          tiles={presentProfilePlayStyle(profile)}
        />

        <ProfileMemorySection
          compact={compact}
          mode={mode}
          wallAssetKeys={profile.wallAssetKeys}
          wallUrls={profile.wallUrls}
        />

        <ProfileTrustSections
          compact={compact}
          failed={trustProjectionQuery.isError}
          loading={trustProjectionQuery.isPending}
          projection={trustProjectionQuery.data}
        />
      </View>

      {mode === 'other' && targetPlayerId && setPickerVisible ? (
        <MatchSetPickerModal
          onClose={() => setSetPickerVisible(false)}
          targetDisplayName={profile.displayName}
          targetPlayerId={targetPlayerId}
          visible={setPickerVisible}
        />
      ) : null}
    </AppScreen>
  );
}

function StaleProfileBanner() {
  return (
    <View accessibilityLabel="Hồ sơ đang hiển thị dữ liệu cũ" accessible>
      <AppCard
        backgroundColor={profileUi.colors.staleSurface}
        contentStyle={styles.staleContent}
        density="list"
        radius={profileUi.radii.card}
        withShadow={false}
      >
        <Ionicons
          color={appColors.status.warning}
          name="information-circle"
          size={18}
        />
        <AppText style={styles.staleText} tone="secondary" variant="bodySmall">
          Không thể làm mới. Đang hiển thị hồ sơ đã tải gần nhất.
        </AppText>
      </AppCard>
    </View>
  );
}

function RelationshipReadState({ loading }: { loading: boolean }) {
  return (
    <View accessibilityLabel="Trạng thái quan hệ không khả dụng" accessible>
      <AppCard
        borderOpacity={profileUi.card.borderOpacity}
        contentStyle={styles.relationshipState}
        density="compact"
        emphasis="none"
        radius={profileUi.radii.card}
        surfaceTone="low"
        withShadow={false}
      >
        {loading ? (
          <ActivityIndicator color={appColors.accent.purple} size="small" />
        ) : (
          <Ionicons
            color={appColors.status.warning}
            name="shield-outline"
            size={20}
          />
        )}
        <AppText
          style={styles.relationshipText}
          tone="secondary"
          variant="bodySmall"
        >
          {loading
            ? 'Đang kiểm tra quyền quan hệ và an toàn…'
            : 'Không thể xác minh quyền quan hệ. Các hành động tương tác đang bị khoá an toàn.'}
        </AppText>
      </AppCard>
    </View>
  );
}

function ProfileReadState({
  description,
  icon,
  loading = false,
  mode,
  onBack,
  onRetry,
  title,
}: Readonly<{
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  mode: ProfileHeroMode;
  onBack?: () => void;
  onRetry?: () => void;
  title: string;
}>) {
  return (
    <AppScreen
      contentContainerStyle={styles.readState}
      scroll={false}
      withBottomNavPadding={mode === 'self'}
      withHeader={false}
    >
      {onBack ? (
        <View style={styles.readStateHeader}>
          <AppIconButton
            accessibilityLabel="Quay lại"
            emphasis="none"
            onPress={onBack}
            size={44}
            testID="profile-read-state-back-action"
            withHighlight={false}
          >
            <Ionicons
              color={appColors.icon.primary}
              name="chevron-back"
              size={22}
            />
          </AppIconButton>
        </View>
      ) : null}
      <View style={styles.readStateBody}>
        {loading ? (
          <ActivityIndicator color={appColors.accent.purple} size="large" />
        ) : (
          <Ionicons color={appColors.accent.purpleIcon} name={icon} size={42} />
        )}
        <AppText style={styles.centeredText} variant="h2">
          {title}
        </AppText>
        <AppText style={styles.centeredText} tone="secondary" variant="body">
          {description}
        </AppText>
        {!loading && onRetry ? (
          <AppButton
            accessibilityLabel="Thử tải lại hồ sơ"
            onPress={onRetry}
            style={styles.retryButton}
          >
            Thử lại
          </AppButton>
        ) : null}
      </View>
    </AppScreen>
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
  centeredText: { maxWidth: 320, textAlign: 'center' },
  readState: {
    flex: 1,
    paddingHorizontal: appSpacing['3xl'],
    paddingTop: appSpacing.xl,
  },
  readStateBody: {
    alignItems: 'center',
    flex: 1,
    gap: appSpacing['3xl'],
    justifyContent: 'center',
    paddingHorizontal: appSpacing['3xl'],
  },
  readStateHeader: { alignSelf: 'stretch' },
  relationshipState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.xl,
  },
  relationshipText: { flex: 1 },
  retryButton: { marginTop: appSpacing.xl, minWidth: 132 },
  screenContent: { paddingHorizontal: 0, paddingTop: 0 },
  sections: { paddingTop: appSpacing['2xl'] },
  sectionsCompact: {
    gap: profileUi.screen.sectionGapCompact,
    paddingHorizontal: profileUi.screen.gutterCompact,
  },
  sectionsRegular: {
    gap: profileUi.screen.sectionGap,
    paddingHorizontal: profileUi.screen.gutter,
  },
  staleContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.md,
  },
  staleText: { flex: 1 },
});
