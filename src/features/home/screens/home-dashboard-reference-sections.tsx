import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ComponentProps } from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { useAssetResolver, type AssetKey } from '@/entities/media-asset';
import {
  AppIdentityHeader,
  appDaypartCopy,
  appDisplayFirstName,
  appColors,
} from '@/shared/ui';
import type { PlaySessionSnapshotV2 } from '@/shared/contracts/core-v2';

import { HomeRecentActivityCard } from '../components/HomeRecentActivityCard';
import type {
  CurrentHomeProfile,
  HomeReadyMode,
  MatchedSet,
} from '../home-dashboard-service';
import { homeDashboardAssets } from './home-dashboard-assets';
import { homeDashboardStyles as styles } from './home-dashboard.styles';
import { homeUi } from '../ui/home-ui';

type ModePresentation = Readonly<{
  gradient: readonly [string, string];
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
}>;

const modePresentation: Record<HomeReadyMode['id'], ModePresentation> = {
  normal: {
    gradient: homeUi.gradients.modes.normal,
    icon: 'happy',
    label: 'Normal',
  },
  rank: {
    gradient: homeUi.gradients.modes.rank,
    icon: 'trophy',
    label: 'Rank',
  },
  setlove: {
    gradient: homeUi.gradients.modes.setlove,
    icon: 'heart',
    label: 'Love',
  },
  soulmate: {
    gradient: homeUi.gradients.modes.soulmate,
    icon: 'heart-circle',
    label: 'Tri kỉ',
  },
  team: {
    gradient: homeUi.gradients.modes.team,
    icon: 'people',
    label: 'Team',
  },
};

const referenceModeOrder: Record<HomeReadyMode['id'], number> = {
  soulmate: 0,
  setlove: 1,
  normal: 2,
  rank: 3,
  team: 4,
};

const recentActivityItems = [
  {
    badge: 'MVP',
    icon: null,
    image: homeDashboardAssets.activityVictory,
    meta: '12/07 · 3 trận',
    title: 'Chiến thắng',
  },
  {
    badge: null,
    icon: 'thumbs-up' as const,
    image: homeDashboardAssets.activityCarry,
    meta: '10/07 · 2 trận',
    title: 'Gánh team',
  },
  {
    badge: null,
    icon: 'trophy' as const,
    image: homeDashboardAssets.activityStreak,
    meta: '08/07 · 4 trận',
    title: 'Chuỗi 4 win',
  },
  {
    badge: null,
    icon: 'heart' as const,
    image: homeDashboardAssets.activityChill,
    meta: '06/07 · 2 trận',
    title: 'Chill cùng nhau',
  },
] as const;

export function HomeDashboardHeader({
  compact,
  hasUnreadNotifications,
  onGiftPress,
  onNotificationsPress,
  profile,
  readyEnabled,
}: {
  compact: boolean;
  hasUnreadNotifications: boolean;
  onGiftPress: () => void;
  onNotificationsPress: () => void;
  profile: CurrentHomeProfile;
  readyEnabled: boolean;
}) {
  return (
    <AppIdentityHeader
      actions={[
        {
          accessibilityLabel: 'Thông báo',
          icon: 'notifications-outline',
          indicator: hasUnreadNotifications,
          indicatorTestID: 'home-notification-unread-dot',
          onPress: onNotificationsPress,
        },
        {
          accessibilityLabel: 'Quà và thành tích',
          emphasized: true,
          icon: 'gift-outline',
          onPress: onGiftPress,
        },
      ]}
      avatar={
        <ResolvedHomeAvatar
          profile={profile}
          size={
            compact
              ? homeUi.metrics.header.avatarCompact
              : homeUi.metrics.header.avatar
          }
        />
      }
      compact={compact}
      subtitle={`${appDaypartCopy()} · ${
        readyEnabled ? 'Đang tìm kết nối' : 'Sẵn sàng kết nối'
      }`}
      testID="home-identity-header"
      title={`Chào ${appDisplayFirstName(profile.displayName)} ✨`}
    />
  );
}

export function HomeMatchHero({
  activeMatchCount,
  compact,
  onToggleReady,
  pending,
  readyEnabled,
  selectedMode,
}: {
  activeMatchCount: number;
  compact: boolean;
  onToggleReady: () => void;
  pending: boolean;
  readyEnabled: boolean;
  selectedMode: HomeReadyMode;
}) {
  const title = heroTitle(selectedMode.id);
  const searchCount = new Intl.NumberFormat('vi-VN').format(
    2_451 + activeMatchCount,
  );

  return (
    <View style={styles.heroShell} testID="home-ready-hero-shell">
      <ImageBackground
        accessibilityLabel="Thành phố LiQi cho tính năng tìm Tri kỉ"
        imageStyle={styles.heroImageRadius}
        resizeMode="cover"
        source={homeDashboardAssets.hero}
        style={styles.heroImage}
        testID="home-ready-hero-background"
      >
        <LinearGradient
          colors={homeUi.gradients.heroLeft}
          locations={[0, 0.35, 0.64, 1]}
          start={{ x: 0, y: 0.45 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={homeUi.gradients.heroBottom}
          locations={[0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[styles.heroContent, compact && styles.heroContentCompact]}
          testID="home-ready-hero-content"
        >
          <View style={styles.autoMatchRow}>
            <Ionicons
              color={homeUi.colors.autoMatchIcon}
              name="sparkles"
              size={17}
            />
            <Text
              maxFontSizeMultiplier={1}
              style={[
                styles.autoMatchText,
                compact && styles.autoMatchTextCompact,
              ]}
            >
              Tự động ghép
            </Text>
          </View>

          <View style={styles.heroTitleRow}>
            <Text
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1}
              minimumFontScale={0.74}
              numberOfLines={1}
              style={[styles.heroTitle, compact && styles.heroTitleCompact]}
            >
              {title}
            </Text>
            <Ionicons
              color={homeUi.colors.heroIcon}
              name={heroTitleIcon(selectedMode.id)}
              size={compact ? 30 : 34}
              style={styles.heroTitleIcon}
              testID={`home-ready-hero-icon-${heroTitleIcon(selectedMode.id)}`}
            />
          </View>

          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1}
            minimumFontScale={0.84}
            numberOfLines={2}
            style={[
              styles.heroDescription,
              compact && styles.heroDescriptionCompact,
            ]}
          >
            LiQi sẽ tìm người thật sự{`\n`}phù hợp với bạn.
          </Text>

          <View
            style={[styles.searchingRow, compact && styles.searchingRowCompact]}
          >
            <View style={styles.searchingAvatars}>
              <StackedStaticAvatar
                offset={0}
                source={homeDashboardAssets.avatarMale}
              />
              <StackedStaticAvatar
                offset={22}
                source={homeDashboardAssets.avatarFemale}
              />
              <StackedStaticAvatar
                offset={44}
                source={homeDashboardAssets.avatarMale}
              />
            </View>
            <Text maxFontSizeMultiplier={1} style={styles.searchingText}>
              {searchCount} người{`\n`}đang tìm kiếm
            </Text>
          </View>

          <Pressable
            accessibilityLabel={readyEnabled ? 'Tắt tìm đội' : 'Bật tìm đội'}
            accessibilityRole="button"
            accessibilityState={{ busy: pending }}
            disabled={pending}
            onPress={onToggleReady}
            style={({ pressed }) => [
              styles.heroCtaPressable,
              compact && styles.heroCtaPressableCompact,
              pressed && styles.heroCtaPressed,
            ]}
          >
            <LinearGradient
              colors={
                readyEnabled
                  ? homeUi.gradients.primaryCtaActive
                  : homeUi.gradients.primaryCta
              }
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={[styles.heroCta, compact && styles.heroCtaCompact]}
              testID="home-ready-hero-cta"
            >
              <Ionicons
                color={appColors.text.onAccent}
                name={readyEnabled ? 'pause' : 'sparkles'}
                size={22}
              />
              <Text maxFontSizeMultiplier={1} style={styles.heroCtaText}>
                {pending
                  ? 'Đang đồng bộ…'
                  : readyEnabled
                    ? 'Tạm dừng ghép'
                    : 'Bắt đầu ghép'}
              </Text>
            </LinearGradient>
          </Pressable>

          <View
            style={[
              styles.chooseModeRow,
              compact && styles.chooseModeRowCompact,
            ]}
          >
            <Text maxFontSizeMultiplier={1} style={styles.chooseModeText}>
              Chọn chế độ
            </Text>
            <Ionicons
              color={homeUi.colors.chooseModeIcon}
              name="chevron-forward"
              size={17}
            />
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

export function HomeModePicker({
  compact,
  modes,
  onSelect,
  pending,
  selectedModeId,
}: {
  compact: boolean;
  modes: readonly HomeReadyMode[];
  onSelect: (modeId: HomeReadyMode['id']) => void;
  pending: boolean;
  selectedModeId: HomeReadyMode['id'];
}) {
  const orderedModes = [...modes].sort(
    (left, right) => referenceModeOrder[left.id] - referenceModeOrder[right.id],
  );

  return (
    <View
      style={[styles.modeGrid, compact && styles.modeGridCompact]}
      testID="home-ready-mode-grid"
    >
      {orderedModes.map((mode) => {
        const selected = selectedModeId === mode.id;
        const presentation = modePresentation[mode.id];
        return (
          <Pressable
            accessibilityLabel={presentation.label}
            accessibilityRole="button"
            accessibilityState={{ disabled: pending, selected }}
            disabled={pending}
            key={mode.id}
            onPress={() => onSelect(mode.id)}
            style={({ pressed }) => [
              styles.modeCard,
              compact && styles.modeCardCompact,
              selected && styles.modeCardSelected,
              pressed && styles.modeCardPressed,
            ]}
          >
            <LinearGradient
              colors={presentation.gradient as [string, string]}
              style={[
                styles.modeIconBubble,
                compact && styles.modeIconBubbleCompact,
                selected && styles.modeIconBubbleSelected,
              ]}
            >
              <Ionicons
                color={homeUi.colors.modeIcon}
                name={presentation.icon}
                size={compact ? (selected ? 24 : 22) : selected ? 28 : 25}
                testID={`home-ready-mode-icon-${mode.id}-${presentation.icon}`}
              />
            </LinearGradient>
            <Text
              maxFontSizeMultiplier={1}
              numberOfLines={1}
              style={[
                styles.modeLabel,
                compact && styles.modeLabelCompact,
                selected && styles.modeLabelSelected,
              ]}
            >
              {presentation.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function HomeContextCards({
  compact,
  creatingSession,
  currentSession,
  loadingSession,
  onOpenMatchProfile,
  onOpenRoom,
  onUpcomingAction,
  primaryMatch,
  selectedMode,
}: {
  compact: boolean;
  creatingSession: boolean;
  currentSession: PlaySessionSnapshotV2 | null;
  loadingSession: boolean;
  onOpenMatchProfile: () => void;
  onOpenRoom: () => void;
  onUpcomingAction: () => void;
  primaryMatch: MatchedSet | undefined;
  selectedMode: HomeReadyMode;
}) {
  const sessionPresentation = presentSession(currentSession, selectedMode);

  return (
    <View style={[styles.contextGrid, compact && styles.contextGridCompact]}>
      <Pressable
        accessibilityLabel="Mở Phòng của bạn"
        accessibilityRole="button"
        onPress={onOpenRoom}
        style={({ pressed }) => [
          styles.contextCard,
          compact && styles.contextCardCompact,
          pressed && styles.contextCardPressed,
        ]}
      >
        <ImageBackground
          imageStyle={[
            styles.contextCardImageRadius,
            compact && styles.contextCardImageRadiusCompact,
          ]}
          resizeMode="cover"
          source={homeDashboardAssets.room}
          style={styles.contextCardImage}
        >
          <LinearGradient
            colors={homeUi.gradients.context}
            locations={[0.28, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.contextCardHeader,
              compact && styles.contextCardHeaderCompact,
            ]}
          >
            <Text
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1}
              minimumFontScale={0.8}
              numberOfLines={1}
              style={[
                styles.contextCardTitle,
                compact && styles.contextCardTitleCompact,
              ]}
            >
              Phòng của bạn
            </Text>
            <Ionicons
              color={homeUi.colors.contextChevron}
              name="chevron-forward"
              size={19}
            />
          </View>

          <View
            style={[styles.roomAvatars, compact && styles.roomAvatarsCompact]}
          >
            <Pressable
              accessibilityLabel={
                primaryMatch
                  ? `Mở hồ sơ ${primaryMatch.name}`
                  : 'Mở hồ sơ bạn ghép'
              }
              accessibilityRole="button"
              disabled={!primaryMatch}
              onPress={(event) => {
                event.stopPropagation();
                onOpenMatchProfile();
              }}
              style={styles.roomAvatarLeft}
            >
              <Image
                resizeMode="cover"
                source={homeDashboardAssets.avatarMale}
                style={[styles.roomAvatar, compact && styles.roomAvatarCompact]}
              />
            </Pressable>
            <Image
              resizeMode="cover"
              source={homeDashboardAssets.avatarFemale}
              style={[
                styles.roomAvatar,
                compact && styles.roomAvatarCompact,
                styles.roomAvatarRight,
              ]}
            />
            <LinearGradient
              colors={homeUi.gradients.roomHeart}
              style={[styles.roomHeart, compact && styles.roomHeartCompact]}
            >
              <Ionicons
                color={appColors.text.onAccent}
                name="heart"
                size={compact ? 16 : 18}
              />
            </LinearGradient>
          </View>

          <View style={[styles.roomCopy, compact && styles.roomCopyCompact]}>
            <View style={styles.roomTitleRow}>
              <Text
                maxFontSizeMultiplier={1}
                style={[styles.roomTitle, compact && styles.roomTitleCompact]}
              >
                Phòng của hai ta
              </Text>
              <Ionicons
                color={homeUi.colors.roomEdit}
                name="create-outline"
                size={14}
              />
            </View>
            <Text
              maxFontSizeMultiplier={1}
              style={[
                styles.roomDescription,
                compact && styles.roomDescriptionCompact,
              ]}
            >
              Chỗ riêng của chúng ta ✨{`\n`}Cùng nhau chill &amp; chơi
            </Text>
          </View>
        </ImageBackground>
      </Pressable>

      <View style={[styles.contextCard, compact && styles.contextCardCompact]}>
        <ImageBackground
          imageStyle={[
            styles.contextCardImageRadius,
            compact && styles.contextCardImageRadiusCompact,
          ]}
          resizeMode="cover"
          source={homeDashboardAssets.upcomingSession}
          style={styles.contextCardImage}
        >
          <LinearGradient
            colors={homeUi.gradients.contextStrong}
            locations={[0.2, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.contextCardHeader,
              compact && styles.contextCardHeaderCompact,
            ]}
          >
            <Text
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1}
              minimumFontScale={0.78}
              numberOfLines={1}
              style={[
                styles.contextCardTitle,
                compact && styles.contextCardTitleCompact,
              ]}
            >
              Buổi chơi sắp tới
            </Text>
            <Ionicons
              color={homeUi.colors.contextChevron}
              name="chevron-forward"
              size={19}
            />
          </View>

          <View
            style={[
              styles.sessionSummaryRow,
              compact && styles.sessionSummaryRowCompact,
            ]}
          >
            <View
              style={[
                styles.sessionTimeBox,
                compact && styles.sessionTimeBoxCompact,
              ]}
            >
              <Text
                maxFontSizeMultiplier={1}
                style={[
                  styles.sessionTime,
                  compact && styles.sessionTimeCompact,
                ]}
              >
                {sessionPresentation.time}
              </Text>
              <Text maxFontSizeMultiplier={1} style={styles.sessionDay}>
                {sessionPresentation.day}
              </Text>
            </View>
            <View style={styles.sessionModeBlock}>
              <View style={styles.sessionModeRow}>
                <Ionicons
                  color={homeUi.colors.sessionIcon}
                  name="trophy"
                  size={20}
                />
                <Text maxFontSizeMultiplier={1} style={styles.sessionMode}>
                  {sessionPresentation.mode}
                </Text>
              </View>
              <Text maxFontSizeMultiplier={1} style={styles.sessionMeta}>
                {sessionPresentation.matches}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.sessionReadyRow,
              compact && styles.sessionReadyRowCompact,
            ]}
          >
            <View style={styles.miniAvatarStack}>
              <Image
                source={homeDashboardAssets.avatarMale}
                style={[styles.miniAvatar, { left: 0 }]}
              />
              <Image
                source={homeDashboardAssets.avatarFemale}
                style={[styles.miniAvatar, { left: 18 }]}
              />
              <Image
                source={homeDashboardAssets.avatarMale}
                style={[styles.miniAvatar, { left: 36 }]}
              />
            </View>
            <Text maxFontSizeMultiplier={1} style={styles.sessionReadyCount}>
              {sessionPresentation.ready}
            </Text>
            <Text maxFontSizeMultiplier={1} style={styles.sessionReadyLabel}>
              sẵn sàng
            </Text>
          </View>

          <Pressable
            accessibilityLabel={
              currentSession ? 'Vào phòng đang hoạt động' : 'Tạo phòng từ match'
            }
            accessibilityRole="button"
            accessibilityState={{ busy: creatingSession || loadingSession }}
            disabled={creatingSession || loadingSession}
            onPress={onUpcomingAction}
            style={({ pressed }) => [
              styles.sessionCtaPressable,
              compact && styles.sessionCtaPressableCompact,
              pressed && styles.heroCtaPressed,
            ]}
          >
            <LinearGradient
              colors={homeUi.gradients.sessionCta}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={[styles.sessionCta, compact && styles.sessionCtaCompact]}
            >
              <Ionicons
                color={appColors.text.onAccent}
                name="enter-outline"
                size={19}
              />
              <Text
                maxFontSizeMultiplier={1}
                style={[
                  styles.sessionCtaText,
                  compact && styles.sessionCtaTextCompact,
                ]}
              >
                {creatingSession
                  ? 'Đang tạo…'
                  : loadingSession
                    ? 'Đang tải…'
                    : currentSession
                      ? 'Vào phòng'
                      : primaryMatch
                        ? 'Tạo phòng'
                        : 'Xem phòng'}
              </Text>
            </LinearGradient>
          </Pressable>
        </ImageBackground>
      </View>
    </View>
  );
}

export function HomeRecentActivity({
  compact,
  onViewAll,
}: {
  compact: boolean;
  onViewAll: () => void;
}) {
  return (
    <View
      style={[styles.recentSection, compact && styles.recentSectionCompact]}
    >
      <View style={styles.recentHeader}>
        <Text
          maxFontSizeMultiplier={1}
          style={[styles.recentTitle, compact && styles.recentTitleCompact]}
        >
          Hoạt động gần đây
        </Text>
        <Pressable
          accessibilityLabel="Xem tất cả hoạt động"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onViewAll}
          style={({ pressed }) => [
            styles.viewAllButton,
            pressed && styles.pressed,
          ]}
        >
          <Text maxFontSizeMultiplier={1} style={styles.viewAllText}>
            Xem tất cả
          </Text>
          <Ionicons
            color={homeUi.colors.viewAllIcon}
            name="chevron-forward"
            size={18}
          />
        </Pressable>
      </View>

      <View style={styles.recentGrid}>
        {recentActivityItems.map((item) => (
          <HomeRecentActivityCard
            badge={item.badge}
            compact={compact}
            icon={item.icon}
            image={item.image}
            key={item.title}
            meta={item.meta}
            onPress={onViewAll}
            title={item.title}
          />
        ))}
      </View>
    </View>
  );
}

function ResolvedHomeAvatar({
  profile,
  size,
}: {
  profile: CurrentHomeProfile;
  size: number;
}) {
  const assetResolver = useAssetResolver();
  const [failedUri, setFailedUri] = useState<string | undefined>();
  const [failedAssetKey, setFailedAssetKey] = useState<AssetKey | undefined>();
  const activeUri =
    profile.avatarUrl && failedUri !== profile.avatarUrl
      ? profile.avatarUrl
      : profile.avatarFallbackUrl && failedUri !== profile.avatarFallbackUrl
        ? profile.avatarFallbackUrl
        : undefined;
  const resolvedAsset =
    profile.avatarAssetKey && failedAssetKey !== profile.avatarAssetKey
      ? assetResolver.resolve(profile.avatarAssetKey)
      : undefined;
  const source: ImageSourcePropType = activeUri
    ? { uri: activeUri }
    : resolvedAsset?.source
      ? (resolvedAsset.source as ImageSourcePropType)
      : homeDashboardAssets.avatarFemale;

  return (
    <LinearGradient
      colors={homeUi.gradients.profileRing}
      style={[
        styles.profileAvatarRing,
        { borderRadius: size / 2, height: size, width: size },
      ]}
    >
      <Image
        accessibilityLabel={
          profile.avatarAssetKey && !activeUri
            ? `Avatar ${resolvedAsset?.state ?? 'missing'}`
            : `Avatar ${profile.displayName}`
        }
        onError={() => {
          if (activeUri) {
            setFailedUri(activeUri);
            return;
          }
          if (profile.avatarAssetKey) setFailedAssetKey(profile.avatarAssetKey);
        }}
        resizeMode="cover"
        source={source}
        style={{
          borderRadius: size / 2 - 2,
          height: size - 4,
          width: size - 4,
        }}
      />
    </LinearGradient>
  );
}

function StackedStaticAvatar({
  offset,
  source,
}: {
  offset: number;
  source: ImageSourcePropType;
}) {
  return (
    <View style={[styles.searchingAvatarFrame, { left: offset }]}>
      <Image source={source} style={styles.searchingAvatar} />
    </View>
  );
}

function heroTitleIcon(
  modeId: HomeReadyMode['id'],
): ComponentProps<typeof Ionicons>['name'] {
  switch (modeId) {
    case 'soulmate':
    case 'setlove':
      return 'heart-outline';
    case 'normal':
      return 'happy-outline';
    case 'rank':
      return 'trophy-outline';
    case 'team':
      return 'people-outline';
  }
}

function heroTitle(modeId: HomeReadyMode['id']) {
  switch (modeId) {
    case 'soulmate':
      return 'Tìm Tri kỉ';
    case 'setlove':
      return 'Tìm Love';
    case 'normal':
      return 'Tìm bạn chơi';
    case 'rank':
      return 'Tìm đồng đội';
    case 'team':
      return 'Tìm Team';
  }
}

function presentSession(
  session: PlaySessionSnapshotV2 | null,
  selectedMode: HomeReadyMode,
) {
  if (!session) {
    return {
      day: 'Chưa đặt',
      matches: 'Sẵn sàng tạo',
      mode: modePresentation[selectedMode.id].label,
      ready: '0/2',
      time: '--:--',
    };
  }

  const activeMembers = session.members.filter(
    (member) => member.state === 'active',
  ).length;
  const readyResponses =
    session.readyCheck?.responses.filter(
      (response) => response.response === 'ready',
    ).length ?? activeMembers;

  return {
    day: session.scheduledFor
      ? relativeDayLabel(session.scheduledFor)
      : stateLabel(session.state),
    matches: session.title,
    mode: inferSessionMode(session.title, selectedMode),
    ready: `${Math.min(readyResponses, activeMembers)}/${activeMembers || session.capacity}`,
    time: session.scheduledFor ? timeLabel(session.scheduledFor) : '--:--',
  };
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '--:--';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  }).format(date);
}

function relativeDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Đã đặt lịch';
  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return 'Hôm nay';
  }
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function inferSessionMode(title: string, fallback: HomeReadyMode) {
  const normalized = title.toLowerCase();
  if (normalized.includes('rank')) return 'Rank';
  if (normalized.includes('team')) return 'Team';
  if (normalized.includes('love')) return 'Love';
  if (normalized.includes('tri kỉ') || normalized.includes('tri ki'))
    return 'Tri kỉ';
  return modePresentation[fallback.id].label;
}

function stateLabel(state: PlaySessionSnapshotV2['state']) {
  switch (state) {
    case 'recruiting':
      return 'Đang tuyển';
    case 'ready_check':
      return 'Chờ sẵn sàng';
    case 'scheduled':
      return 'Đã lên lịch';
    case 'in_progress':
      return 'Đang chơi';
    case 'completion_pending':
      return 'Chờ xác nhận';
    case 'completed':
      return 'Đã hoàn tất';
    case 'cancelled':
      return 'Đã hủy';
  }
}
