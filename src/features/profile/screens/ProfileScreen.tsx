import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import { LiquidButton, LiquidOrbButton } from '@/shared/components/liquid';
import { useAuth } from '@/shared/auth/auth-context';
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
import { ProfilePlayStyle } from '../components/ProfilePlayStyle';
import { ProfileText } from '../components/ProfileShared';
import { useProfileReadRepository } from '../runtime/ProfileReadRepositoryProvider';

export type ProfileScreenProps = {
  mode: ProfileHeroMode;
  userId?: string;
};

export function ProfileScreen({ mode, userId }: ProfileScreenProps) {
  const { session } = useAuth();
  const profileRepository = useProfileReadRepository();
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
    enabled: Boolean(session && (mode === 'self' || userId)),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return profileRepository.getProfile({
        session,
        userId: mode === 'other' ? userId : undefined,
      });
    },
    queryKey: ['profile-view', mode, userId ?? session?.user.id],
  });

  const profile = profileQuery.data;

  if (!session || (mode === 'other' && !userId)) {
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

  if (profileQuery.isError) {
    return (
      <ProfileReadState
        mode={mode}
        onRetry={() => void profileQuery.refetch()}
        title="Không thể tải hồ sơ"
        description="Repository trả về lỗi. Ứng dụng không dùng fixture để che trạng thái này."
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
      <ProfileHeroCard
        mode={mode}
        onEdit={mode === 'self' ? openProfileEditor : selectionImpact}
        onInvite={impactLight}
        onMessage={selectionImpact}
        onShare={openProfileShare}
        profile={profile}
        vibe={vibe}
      />
      <ProfileFavoriteHeroes
        heroes={profile.favoriteHeroes}
        showWinRate={profile.showWinRate}
        onOpen={mode === 'self' ? openProfileEditor : undefined}
      />
      <ProfilePlayStyle tags={profile.playStyleTags} />
      <ProfileHighlights mode={mode} />
    </LiquidScreen>
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
