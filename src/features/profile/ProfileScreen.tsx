import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { LiquidBottomNav, LiquidOrbButton } from '@/shared/components/liquid';
import { useAuth } from '@/shared/auth/auth-context';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import { ProfileFavoriteHeroes } from './components/ProfileFavoriteHeroes';
import {
  ProfileHeroCard,
  type ProfileHeroMode,
} from './components/ProfileHeroCard';
import { ProfileHighlights } from './components/ProfileHighlights';
import { ProfilePlayStyle } from './components/ProfilePlayStyle';
import { ProfileText } from './components/ProfileShared';
import { profileMockVibe } from './profile.mock';
import { buildPreviewProfile, fetchProfileView } from './profile-service';

export type ProfileScreenProps = {
  mode: ProfileHeroMode;
  userId?: string;
};

const tabs = [
  { icon: 'home', key: 'home', label: 'Trang chủ' },
  { icon: 'compass-outline', key: 'discover', label: 'Khám phá' },
  { icon: 'chatbubble-ellipses-outline', key: 'messages', label: 'Tin nhắn' },
  { icon: 'person-outline', key: 'profile', label: 'Hồ sơ' },
] as const;

export function ProfileScreen({ mode, userId }: ProfileScreenProps) {
  const { session } = useAuth();
  const profileQuery = useQuery({
    enabled: Boolean(session && (mode === 'self' || userId)),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return fetchProfileView({
        session,
        userId: mode === 'other' ? userId : undefined,
      });
    },
    queryKey: ['profile-view', mode, userId ?? session?.user.id],
  });

  const profile =
    profileQuery.data ??
    buildPreviewProfile(session, mode === 'other' ? userId : session?.user.id);

  return (
    <LiquidScreen
      bottomSlot={<ProfileBottomNav />}
      contentContainerStyle={styles.scrollContent}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <ProfileTopBar mode={mode} loading={profileQuery.isLoading} />
      <ProfileHeroCard
        mode={mode}
        onEdit={selectionImpact}
        onInvite={impactLight}
        onMessage={selectionImpact}
        profile={profile}
        vibe={profileMockVibe}
      />
      <ProfileFavoriteHeroes heroes={profile.favoriteHeroes} />
      <ProfilePlayStyle tags={profile.playStyleTags} />
      <ProfileHighlights mode={mode} />
      <View aria-hidden style={styles.bottomSpacer} />
      {profileQuery.isError ? (
        <ProfileText style={styles.errorText}>
          Chưa đọc được dữ liệu hồ sơ thật, đang hiển thị layout preview.
        </ProfileText>
      ) : null}
    </LiquidScreen>
  );
}

function ProfileTopBar({
  loading,
  mode,
}: {
  loading: boolean;
  mode: ProfileHeroMode;
}) {
  return (
    <View style={styles.topBar}>
      <LiquidOrbButton
        accessibilityLabel="Quay lại"
        glowIntensity="low"
        onPress={() => {
          selectionImpact();
          router.back();
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
        onPress={selectionImpact}
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

function ProfileBottomNav() {
  return (
    <LiquidBottomNav
      activeKey="profile"
      items={tabs}
      onPress={(key) => {
        selectionImpact();
        if (key === 'home') router.push('/home');
      }}
      renderIcon={(tab, active) => (
        <Ionicons
          color={active ? 'rgba(255,255,255,0.84)' : '#A8AFC6'}
          name={tab.icon}
          size={active ? 22 : 21}
        />
      )}
    />
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
  errorText: {
    color: 'rgba(255,216,168,0.78)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 14,
    paddingHorizontal: 5,
  },
  bottomSpacer: { height: 240 },
  scrollContent: {
    paddingBottom: 240,
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
