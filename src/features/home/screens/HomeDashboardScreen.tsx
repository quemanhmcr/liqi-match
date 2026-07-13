import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native';
import { useAuth } from '@/shared/auth/auth-context';
import {
  LiquidBadge,
  LiquidButton,
  LiquidCard,
  LiquidChip,
  LiquidGlassSurface,
  LiquidOrbButton,
  LiquidSectionHeader,
} from '@/shared/components/liquid';
import { classifyApplicationError } from '@/shared/errors/application-error';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';
import { appRoutes } from '@/app-shell/navigation/routes';
import { useNotificationInboxSummary } from '@/entities/notifications';
import {
  useAssetResolver,
  usePreloadAssetSurface,
  type AssetKey,
} from '@/entities/media-asset';
import {
  ctaPurpleCyanGlowSegments,
  heroGlowSegments,
  matchedPurpleGlowSegments,
  rankCyanGlowSegments,
  teamOrangeGlowSegments,
  type LiquidGlowPreset,
} from '@/shared/theme/liquid-glow.presets';

import {
  homeReadyModes,
  type HomeReadyMode,
  type MatchedSet,
  type MatchedSetStatus,
} from '../home-dashboard-service';
import { useHomeRepository } from '../runtime/HomeRepositoryProvider';
import {
  buildMatchedSetTags,
  chatActionAccessibilityLabel,
  formatMatchedConnectionCount,
  homeReadyModeLabel,
  selectPrimaryHomeReadyModes,
  matchedSetKindLabel,
  matchedSetStatusLabel,
} from '../model/home-dashboard-view-model';

const defaultMode: HomeReadyMode = homeReadyModes[0] ?? {
  accent: '#C679FF',
  description: 'Ưu tiên kết nối tình cảm, tìm người hợp vibe.',
  id: 'setlove',
  label: 'Set Love',
};

const primaryReadyModes = selectPrimaryHomeReadyModes(homeReadyModes);

type HomeSemanticIcon =
  | { family: 'ionicons'; name: keyof typeof Ionicons.glyphMap }
  | {
      family: 'material-community';
      name: keyof typeof MaterialCommunityIcons.glyphMap;
    };

const modeIcons: Record<HomeReadyMode['id'], HomeSemanticIcon> = {
  normal: { family: 'ionicons', name: 'shield-checkmark-outline' },
  rank: { family: 'ionicons', name: 'trophy-outline' },
  setlove: { family: 'ionicons', name: 'heart-outline' },
  soulmate: { family: 'material-community', name: 'handshake-outline' },
  team: { family: 'ionicons', name: 'people-outline' },
};

const kindIcons: Record<MatchedSet['kind'], HomeSemanticIcon> = {
  Normal: { family: 'ionicons', name: 'shield-checkmark-outline' },
  Rank: { family: 'ionicons', name: 'trophy-outline' },
  'Set Love': { family: 'ionicons', name: 'heart-outline' },
  'Team Rank': { family: 'ionicons', name: 'people-outline' },
  'Tri kỉ': { family: 'material-community', name: 'handshake-outline' },
};

function SemanticModeIcon({
  color,
  icon,
  size,
  testID,
}: {
  color: string;
  icon: HomeSemanticIcon;
  size: number;
  testID?: string;
}) {
  const semanticTestID = testID ? `${testID}-${icon.name}` : undefined;

  if (icon.family === 'material-community') {
    return (
      <MaterialCommunityIcons
        color={color}
        name={icon.name}
        size={size}
        testID={semanticTestID}
      />
    );
  }

  return (
    <Ionicons
      color={color}
      name={icon.name}
      size={size}
      testID={semanticTestID}
    />
  );
}

type MatchTone = {
  actionGradient: [string, string];
  border: string;
  borderStrong: string;
  chipBg: string;
  glow: string;
  pillBg: string;
  text: string;
};

const matchTones: Record<MatchedSet['kind'], MatchTone> = {
  Normal: {
    actionGradient: ['#465372', '#AAB7E9'],
    border: 'rgba(214,224,255,0.22)',
    borderStrong: 'rgba(221,230,255,0.56)',
    chipBg: 'rgba(221,230,255,0.075)',
    glow: 'rgba(221,230,255,0.12)',
    pillBg: 'rgba(221,230,255,0.10)',
    text: '#DCE5FF',
  },
  Rank: {
    actionGradient: ['rgba(18,46,72,0.90)', 'rgba(55,142,172,0.86)'],
    border: 'rgba(83,220,255,0.20)',
    borderStrong: 'rgba(80,227,255,0.52)',
    chipBg: 'rgba(37,195,255,0.075)',
    glow: 'rgba(42,205,255,0.12)',
    pillBg: 'rgba(21,169,229,0.11)',
    text: '#6BEAFF',
  },
  'Set Love': {
    actionGradient: ['rgba(82,62,184,0.90)', 'rgba(74,118,178,0.86)'],
    border: 'rgba(176,119,255,0.30)',
    borderStrong: 'rgba(203,151,255,0.66)',
    chipBg: 'rgba(162,92,255,0.12)',
    glow: 'rgba(160,88,255,0.22)',
    pillBg: 'rgba(142,82,255,0.18)',
    text: '#E6D2FF',
  },
  'Team Rank': {
    actionGradient: ['rgba(96,55,32,0.90)', 'rgba(166,92,56,0.86)'],
    border: 'rgba(255,155,80,0.22)',
    borderStrong: 'rgba(255,155,80,0.42)',
    chipBg: 'rgba(255,138,61,0.075)',
    glow: 'rgba(255,123,47,0.075)',
    pillBg: 'rgba(255,129,53,0.075)',
    text: '#FFB264',
  },
  'Tri kỉ': {
    actionGradient: ['rgba(82,48,164,0.90)', 'rgba(134,62,166,0.86)'],
    border: 'rgba(194,113,255,0.22)',
    borderStrong: 'rgba(207,145,255,0.52)',
    chipBg: 'rgba(171,95,255,0.065)',
    glow: 'rgba(165,89,255,0.075)',
    pillBg: 'rgba(139,78,255,0.095)',
    text: '#EBD8FF',
  },
};

const matchGlowPresets: Record<MatchedSet['kind'], LiquidGlowPreset> = {
  Normal: matchedPurpleGlowSegments,
  Rank: rankCyanGlowSegments,
  'Set Love': matchedPurpleGlowSegments,
  'Team Rank': teamOrangeGlowSegments,
  'Tri kỉ': matchedPurpleGlowSegments,
};

const actionGlowPresets: Record<MatchedSet['kind'], LiquidGlowPreset> = {
  Normal: matchedPurpleGlowSegments,
  Rank: rankCyanGlowSegments,
  'Set Love': ctaPurpleCyanGlowSegments,
  'Team Rank': teamOrangeGlowSegments,
  'Tri kỉ': ctaPurpleCyanGlowSegments,
};

function chipVariantForKind(kind: MatchedSet['kind']) {
  if (kind === 'Rank') return 'cyan' as const;
  if (kind === 'Team Rank') return 'orange' as const;
  return 'purple' as const;
}

function buttonVariantForKind(kind: MatchedSet['kind']) {
  if (kind === 'Rank') return 'rank' as const;
  if (kind === 'Team Rank') return 'team' as const;
  return 'primary' as const;
}

function HomeText(props: TextProps) {
  return <RNText maxFontSizeMultiplier={1} {...props} />;
}

function impactLight() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
}

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

export default function HomeDashboardScreen() {
  usePreloadAssetSurface('home');
  const { session } = useAuth();
  const homeRepository = useHomeRepository();
  const notificationSummaryQuery = useNotificationInboxSummary(session);
  const hasUnreadNotifications =
    (notificationSummaryQuery.data?.unseenCount ?? 0) > 0;
  const [selectedModeId, setSelectedModeId] =
    useState<HomeReadyMode['id']>('setlove');
  const [readyEnabled, setReadyEnabled] = useState(false);

  const dashboardQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return homeRepository.getDashboard(session);
    },
    queryKey: ['home-dashboard', session?.user.id],
  });

  const dashboard = dashboardQuery.data;
  const dashboardFailure = classifyApplicationError(dashboardQuery.error);
  const matchedSetsToRender = dashboard?.matchedSets ?? [];
  const activeMatchCount = matchedSetsToRender.length;
  const selectedMode = useMemo(
    () =>
      homeReadyModes.find((mode) => mode.id === selectedModeId) ?? defaultMode,
    [selectedModeId],
  );
  const selectedModeLabel = homeReadyModeLabel(selectedMode);
  const readyCopy = readyEnabled
    ? `Đang bật · ${selectedModeLabel}`
    : `Mood · ${selectedModeLabel}`;

  const selectMode = (modeId: HomeReadyMode['id']) => {
    selectionImpact();
    setSelectedModeId(modeId);
  };

  const toggleReady = () => {
    impactLight();
    setReadyEnabled((value) => !value);
  };

  if (!session) {
    return (
      <HomeDashboardQueryState
        description="Phiên đăng nhập không còn hợp lệ."
        title="Không thể mở Trang chủ"
      />
    );
  }

  if (!dashboard) {
    return (
      <HomeDashboardQueryState
        description={
          !dashboardQuery.error
            ? 'Đang đồng bộ hồ sơ và các kết nối của bạn.'
            : dashboardFailure.kind === 'offline'
              ? 'Thiết bị đang offline. Kết nối lại để tải Trang chủ.'
              : dashboardFailure.retryable
                ? 'Dữ liệu Trang chủ tạm thời chưa sẵn sàng. Hãy thử lại.'
                : 'Yêu cầu Trang chủ không thể hoàn tất. Ứng dụng không dùng preview để che lỗi này.'
        }
        loading={!dashboardQuery.error}
        onRetry={
          dashboardFailure.retryable
            ? () => void dashboardQuery.refetch()
            : undefined
        }
        title={
          dashboardQuery.error
            ? 'Không thể tải Trang chủ'
            : 'Đang tải Trang chủ'
        }
      />
    );
  }

  return (
    <LiquidScreen
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        session ? (
          <RefreshControl
            onRefresh={() => {
              void dashboardQuery.refetch();
            }}
            refreshing={dashboardQuery.isFetching}
            tintColor="#C679FF"
          />
        ) : undefined
      }
      withHeader={false}
    >
      <View style={styles.topBar}>
        <View style={styles.identityRow}>
          <Avatar
            fallbackUri={dashboard.currentProfile.avatarFallbackUrl}
            name={dashboard.currentProfile.displayName}
            size={50}
            assetKey={dashboard.currentProfile.avatarAssetKey}
            uri={dashboard.currentProfile.avatarUrl}
          />
          <View style={styles.greetingBlock}>
            <HomeText style={styles.greeting}>Xin chào,</HomeText>
            <HomeText numberOfLines={1} style={styles.userName}>
              {displayFirstName(dashboard.currentProfile.displayName)}
            </HomeText>
            <View style={styles.miniStatusPill}>
              <Ionicons color="#75E8FF" name="link-outline" size={12} />
              <HomeText numberOfLines={1} style={styles.miniStatusText}>
                {activeMatchCount
                  ? formatMatchedConnectionCount(activeMatchCount)
                  : dashboard.currentProfile.readySummary}
              </HomeText>
            </View>
          </View>
        </View>

        <LiquidOrbButton
          accessibilityLabel="Thông báo"
          badge={
            hasUnreadNotifications ? (
              <View
                style={styles.notificationDot}
                testID="home-notification-unread-dot"
              />
            ) : undefined
          }
          onPress={() => {
            selectionImpact();
            router.push(appRoutes.notifications);
          }}
          size={42}
          style={styles.notificationButton}
        >
          <Ionicons color="#F7F8FF" name="notifications-outline" size={18} />
        </LiquidOrbButton>
      </View>

      {dashboardQuery.isError ? (
        <View style={styles.previewBanner}>
          <Ionicons color="#FFB86B" name="information-circle" size={16} />
          <HomeText style={styles.previewText}>
            Không thể làm mới. Đang hiển thị dữ liệu đã tải gần nhất.
          </HomeText>
        </View>
      ) : null}

      <LiquidGlassSurface
        backgroundSlot={
          <View pointerEvents="none" style={styles.readyBoardDepthShadow} />
        }
        baseStrokeOpacity={0.04}
        baseStrokeWidth={0.52}
        blurIntensity={36}
        contentStyle={styles.readyBoardSurface}
        frameColors={[
          'rgba(210,151,255,0.14)',
          'rgba(255,255,255,0.020)',
          'rgba(100,230,255,0.12)',
        ]}
        glowPad={16}
        glowPreset={heroGlowSegments}
        radius={28}
        style={styles.readyBoardBorder}
        variant="hero"
        withInnerReflection={false}
        withShadow={false}
      >
        <View
          accessibilityLabel="Nền sẵn sàng trung tính"
          pointerEvents="none"
          style={styles.readyHeroImage}
          testID="home-ready-hero-background"
        />
        <View pointerEvents="none" style={styles.readyBoardDarkTint} />
        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(5,8,20,0.52)',
            'rgba(5,8,20,0.20)',
            'rgba(3,6,18,0.05)',
          ]}
          locations={[0, 0.56, 1]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[
            'rgba(198,121,255,0.10)',
            'rgba(100,230,255,0.06)',
            'rgba(255,255,255,0)',
          ]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.readyBoardSheen}
        />
        <View style={styles.readyBoardEdgeSweep} />
        <LinearGradient
          colors={['rgba(70,220,255,0)', 'rgba(82,214,255,0.040)']}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          start={{ x: 0.08, y: 0.16 }}
          style={styles.readyBoardInnerReflection}
        />
        <View style={styles.readyBoardContent} testID="home-ready-hero-content">
          <View style={styles.boardHeaderRow}>
            <View style={styles.boardTitleBlock}>
              <HomeText style={styles.eyebrow}>LIQI LOBBY</HomeText>
              <HomeText numberOfLines={1} style={styles.boardTitle}>
                Sẵn sàng vào set?
              </HomeText>
            </View>
            <View style={styles.liveBadge}>
              <View
                style={[styles.liveDot, readyEnabled && styles.liveDotActive]}
              />
              <HomeText style={styles.liveText}>
                {readyEnabled ? 'Đang sẵn sàng' : 'Chưa sẵn sàng'}
              </HomeText>
            </View>
          </View>

          <HomeText numberOfLines={2} style={styles.boardSubtitle}>
            Chọn mood và bật trạng thái để tìm người vào set.
          </HomeText>

          <View style={styles.modeGrid} testID="home-ready-mode-grid">
            {primaryReadyModes.map((mode) => {
              const selected = mode.id === selectedModeId;
              const displayLabel = homeReadyModeLabel(mode);
              return (
                <LiquidChip
                  accessibilityLabel={displayLabel}
                  accessibilityState={{ selected }}
                  contentStyle={[
                    styles.modeChip,
                    selected && styles.modeChipSelected,
                  ]}
                  icon={
                    <SemanticModeIcon
                      color={selected ? 'rgba(247,248,255,0.88)' : mode.accent}
                      icon={modeIcons[mode.id]}
                      size={11}
                      testID={`home-ready-mode-icon-${mode.id}`}
                    />
                  }
                  key={mode.id}
                  onPress={() => selectMode(mode.id)}
                  selected={selected}
                  textStyle={[
                    styles.modeLabel,
                    selected && styles.modeLabelSelected,
                  ]}
                >
                  {displayLabel}
                </LiquidChip>
              );
            })}
          </View>

          <View style={styles.readyActionRow}>
            <View style={styles.readyCopyBlock}>
              <HomeText numberOfLines={1} style={styles.readyCopy}>
                {readyCopy}
              </HomeText>
              <HomeText numberOfLines={2} style={styles.readyDescription}>
                {selectedMode.description}
              </HomeText>
            </View>
            <LiquidButton
              accessibilityLabel={
                readyEnabled ? 'Tắt sẵn sàng' : 'Bật sẵn sàng'
              }
              contentStyle={styles.primaryActionGradient}
              glowPreset={ctaPurpleCyanGlowSegments}
              gradientColors={
                readyEnabled
                  ? [
                      'rgba(136,84,218,0.90)',
                      'rgba(78,96,210,0.90)',
                      'rgba(68,154,190,0.86)',
                    ]
                  : [
                      'rgba(142,86,218,0.90)',
                      'rgba(78,82,200,0.90)',
                      'rgba(70,142,188,0.86)',
                    ]
              }
              gradientLocations={readyEnabled ? [0, 0.5, 1] : [0, 0.52, 1]}
              onPress={toggleReady}
              radius={22}
              state={readyEnabled ? 'active' : 'idle'}
              style={[
                styles.primaryAction,
                readyEnabled && styles.primaryActionActive,
              ]}
              withShadow={false}
            >
              <HomeText style={styles.primaryActionText}>
                {readyEnabled ? 'Tắt sẵn sàng' : 'Bật sẵn sàng'}
              </HomeText>
              <Ionicons
                color="#FFFFFF"
                name={readyEnabled ? 'close-circle-outline' : 'power-outline'}
                size={16}
                style={styles.actionIconForeground}
              />
            </LiquidButton>
          </View>
        </View>
      </LiquidGlassSurface>

      <LiquidSectionHeader
        action={
          dashboardQuery.isLoading ? (
            <ActivityIndicator color="#C679FF" />
          ) : null
        }
        label="KẾT NỐI"
        style={styles.matchesSectionHeader}
        title="Những người đã match"
      />

      {matchedSetsToRender.length ? (
        <View style={styles.matchList}>
          {matchedSetsToRender.map((set) => (
            <MatchedSetCard key={set.id} set={set} />
          ))}
        </View>
      ) : (
        <EmptyMatchedSets />
      )}
    </LiquidScreen>
  );
}

function HomeDashboardQueryState({
  description,
  loading = false,
  onRetry,
  title,
}: {
  description: string;
  loading?: boolean;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <LiquidScreen
      contentContainerStyle={styles.queryStateScreen}
      withHeader={false}
    >
      {loading ? <ActivityIndicator color="#C679FF" size="large" /> : null}
      <HomeText style={styles.queryStateTitle}>{title}</HomeText>
      <HomeText style={styles.queryStateDescription}>{description}</HomeText>
      {!loading && onRetry ? (
        <LiquidButton
          accessibilityLabel="Thử tải lại Trang chủ"
          onPress={onRetry}
        >
          Thử lại
        </LiquidButton>
      ) : null}
    </LiquidScreen>
  );
}

function MatchedSetCard({ set }: { set: MatchedSet }) {
  const statusStyle = statusStyles[set.status];
  const tone = matchTones[set.kind];
  const matchGlowPreset = matchGlowPresets[set.kind];
  const actionGlowPreset = actionGlowPresets[set.kind];
  const chipVariant = chipVariantForKind(set.kind);
  const buttonVariant = buttonVariantForKind(set.kind);
  const profileId = set.profileId;
  const displayKind = matchedSetKindLabel(set.kind);
  const displayStatus = matchedSetStatusLabel(set.status);
  const tags = buildMatchedSetTags({
    heroNames: set.heroNames,
    roleNames: set.roleNames,
  });
  const chatAccessibilityLabel = chatActionAccessibilityLabel(
    set.name,
    set.unreadCount,
  );

  return (
    <Pressable
      accessibilityLabel={`${set.name}, ${displayKind}`}
      accessibilityRole="button"
      onPress={selectionImpact}
      style={({ pressed }) => [
        styles.matchCardPressable,
        { shadowColor: tone.text },
        pressed && styles.pressed,
      ]}
    >
      <LiquidCard
        backgroundSlot={
          <View pointerEvents="none" style={styles.matchCardDepthShadow} />
        }
        baseStrokeColor={tone.border}
        baseStrokeOpacity={0.08}
        baseStrokeWidth={0.58}
        blurIntensity={34}
        contentStyle={styles.matchCard}
        density="compact"
        frameColors={[
          tone.border,
          'rgba(255,255,255,0.035)',
          'rgba(255,255,255,0.018)',
        ]}
        glowPreset={matchGlowPreset}
        radius={28}
        style={styles.matchCardFrame}
        variant={
          chipVariant === 'cyan'
            ? 'cyan'
            : chipVariant === 'orange'
              ? 'orange'
              : 'purple'
        }
        withInnerReflection={false}
        withShadow={false}
      >
        <View pointerEvents="none" style={styles.matchCardDarkTint} />
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.080)',
            'rgba(255,255,255,0.016)',
            'rgba(3,7,20,0.28)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[tone.glow, 'rgba(255,255,255,0)']}
          start={{ x: 0.06, y: 0 }}
          end={{ x: 0.86, y: 1 }}
          style={styles.matchCardSheen}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0)', tone.glow]}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          start={{ x: 0.22, y: 0.05 }}
          style={styles.matchCardInnerReflection}
        />
        <View style={styles.matchCardTop}>
          <View style={styles.matchAvatarWrap}>
            <Pressable
              accessibilityLabel={`Mở hồ sơ ${set.name}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !profileId }}
              disabled={!profileId}
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                if (!profileId) return;
                selectionImpact();
                router.push(appRoutes.profile.detail(profileId));
              }}
              style={({ pressed }) => [pressed && styles.avatarPressed]}
            >
              <Avatar
                name={set.name}
                size={54}
                assetKey={set.avatarAssetKey}
                uri={set.avatarUrl}
              />
            </Pressable>
            <View
              style={[
                styles.avatarStatusBadge,
                { backgroundColor: statusStyle.dot },
              ]}
            />
          </View>

          <View style={styles.matchMainInfo}>
            <View style={styles.matchNameRow}>
              <HomeText numberOfLines={1} style={styles.matchName}>
                {set.name}
              </HomeText>
              <LiquidChip
                icon={
                  <SemanticModeIcon
                    color={tone.text}
                    icon={kindIcons[set.kind]}
                    size={13}
                    testID={`home-match-kind-icon-${set.kind}`}
                  />
                }
                style={[
                  styles.kindPill,
                  { backgroundColor: tone.pillBg, borderColor: tone.border },
                ]}
                textStyle={[styles.kindText, { color: tone.text }]}
                variant={chipVariant}
              >
                {displayKind}
              </LiquidChip>
            </View>
            <HomeText style={styles.matchSubtitle}>
              {set.subtitle || 'Đã kết nối với bạn'}
            </HomeText>

            {tags.length ? (
              <View style={styles.matchTagsRow}>
                {tags.map((label) => (
                  <LiquidChip
                    density="tag"
                    key={label}
                    style={styles.softTag}
                    textStyle={styles.softTagText}
                    variant={chipVariant}
                  >
                    {label}
                  </LiquidChip>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.matchFooter}>
          <View style={styles.matchMetaBlock}>
            <View style={styles.statusMetaRow}>
              <View
                style={[
                  styles.cardStatusDot,
                  { backgroundColor: statusStyle.dot },
                ]}
              />
              <HomeText
                numberOfLines={1}
                style={[styles.statusLabel, { color: statusStyle.text }]}
              >
                {displayStatus}
              </HomeText>
              <HomeText style={styles.footerSeparator}>·</HomeText>
              <HomeText
                adjustsFontSizeToFit
                minimumFontScale={0.86}
                numberOfLines={1}
                style={styles.matchMeta}
              >
                {set.meta}
              </HomeText>
            </View>
          </View>

          <View style={styles.cardActions}>
            <LiquidOrbButton
              accessibilityLabel={chatAccessibilityLabel}
              badge={
                set.unreadCount ? (
                  <LiquidBadge size="sm" style={styles.chatUnreadBadge}>
                    {set.unreadCount}
                  </LiquidBadge>
                ) : undefined
              }
              badgeStyle={styles.chatUnreadBadgeHost}
              glowPreset={actionGlowPreset}
              onPress={(event) => {
                event.stopPropagation();
                selectionImpact();
              }}
              size={31}
              style={[
                styles.secondaryAction,
                { borderColor: tone.border, shadowColor: tone.text },
              ]}
            >
              <Ionicons
                color="#EAF0FF"
                name="chatbubble-ellipses-outline"
                size={17}
                style={styles.secondaryActionIcon}
              />
            </LiquidOrbButton>
            <LiquidButton
              accessibilityLabel={set.actionLabel}
              contentStyle={styles.cardPrimaryActionGradient}
              glowPreset={actionGlowPreset}
              gradientColors={tone.actionGradient}
              onPress={(event) => {
                event.stopPropagation();
                impactLight();
              }}
              radius={19}
              style={[styles.cardPrimaryAction, { shadowColor: tone.text }]}
              variant={buttonVariant}
              withShadow={false}
            >
              <HomeText style={styles.cardPrimaryActionText}>
                {set.actionLabel}
              </HomeText>
            </LiquidButton>
          </View>
        </View>
      </LiquidCard>
    </Pressable>
  );
}

function EmptyMatchedSets() {
  return (
    <LiquidCard
      blurIntensity={22}
      contentStyle={styles.emptyCard}
      density="large"
      radius={30}
      style={styles.emptyCardShell}
      withInnerReflection={false}
    >
      <View style={styles.emptyIcon}>
        <Ionicons color="#C679FF" name="people-outline" size={26} />
      </View>
      <HomeText style={styles.emptyTitle}>
        Chưa có set nào trong Trang chủ
      </HomeText>
      <HomeText style={styles.emptyBody}>
        Khi hai bên cùng thích nhau, match sẽ xuất hiện ở đây để bạn vào set,
        nhắn tin hoặc lập lobby rank.
      </HomeText>
      <View style={styles.emptyPreviewRow}>
        <View style={styles.emptyPreviewAvatar} />
        <View style={styles.emptyPreviewLines}>
          <View
            style={[styles.emptyPreviewLine, styles.emptyPreviewLineLong]}
          />
          <View
            style={[styles.emptyPreviewLine, styles.emptyPreviewLineShort]}
          />
        </View>
        <View style={styles.emptyPreviewPill}>
          <HomeText style={styles.emptyPreviewPillText}>Khám phá</HomeText>
        </View>
      </View>
    </LiquidCard>
  );
}

function Avatar({
  assetKey,
  fallbackUri,
  name,
  size,
  uri,
}: {
  assetKey?: AssetKey;
  fallbackUri?: string;
  name: string;
  size: number;
  uri?: string;
}) {
  const assetResolver = useAssetResolver();
  const initials = getInitials(name);
  const [failedUri, setFailedUri] = useState<string | undefined>();
  const [failedAssetKey, setFailedAssetKey] = useState<AssetKey | undefined>();
  const activeUri =
    uri && failedUri !== uri
      ? uri
      : fallbackUri && failedUri !== fallbackUri
        ? fallbackUri
        : undefined;
  const resolvedAsset =
    assetKey && failedAssetKey !== assetKey
      ? assetResolver.resolve(assetKey)
      : undefined;
  const imageSource: ImageSourcePropType | undefined = activeUri
    ? { uri: activeUri }
    : (resolvedAsset?.source as ImageSourcePropType | undefined);

  return (
    <LinearGradient
      colors={['rgba(198,121,255,0.96)', 'rgba(100,230,255,0.9)']}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[
        styles.avatarRing,
        { borderRadius: size / 2, height: size, width: size },
      ]}
    >
      {imageSource ? (
        <Image
          onError={() => {
            if (activeUri) {
              setFailedUri(activeUri);
              return;
            }
            if (assetKey) setFailedAssetKey(assetKey);
          }}
          source={imageSource}
          style={{
            borderRadius: size / 2 - 3,
            height: size - 6,
            width: size - 6,
          }}
        />
      ) : (
        <View
          accessibilityLabel={
            assetKey
              ? `Avatar ${resolvedAsset?.state ?? 'missing'}`
              : `Avatar initials ${name}`
          }
          style={[
            styles.avatarFallback,
            {
              borderRadius: size / 2 - 3,
              height: size - 6,
              width: size - 6,
            },
          ]}
        >
          <HomeText style={styles.avatarInitials}>{initials}</HomeText>
        </View>
      )}
    </LinearGradient>
  );
}

function displayFirstName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed === 'Bạn') return 'Quân';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'L';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : undefined;
  return `${first}${second ?? ''}`.toUpperCase();
}

const statusStyles: Record<MatchedSetStatus, { dot: string; text: string }> = {
  idle: { dot: '#FFB86B', text: '#FFD9A8' },
  offline: { dot: '#697089', text: '#A8AFC6' },
  online: { dot: '#64E6FF', text: '#BFF6FF' },
  ready: { dot: '#5DFFB3', text: '#B8FFD8' },
};

const styles = StyleSheet.create({
  queryStateDescription: {
    color: 'rgba(224,230,248,0.72)',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 320,
    textAlign: 'center',
  },
  queryStateScreen: {
    alignItems: 'center',
    flexGrow: 1,
    gap: 14,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  queryStateTitle: {
    color: '#F7F8FF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  bgCyanGlow: {
    backgroundColor: 'rgba(60,210,255,0.016)',
    borderRadius: 300,
    height: 560,
    position: 'absolute',
    right: -342,
    top: 154,
    width: 560,
  },
  bgPurpleGlow: {
    backgroundColor: 'rgba(130,80,255,0.020)',
    borderRadius: 300,
    height: 560,
    left: -360,
    position: 'absolute',
    top: -104,
    width: 560,
  },
  bgVignette: {
    backgroundColor: 'rgba(0,0,0,0.10)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cardActionDepthShadow: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 22,
    bottom: -7,
    left: 4,
    position: 'absolute',
    right: 4,
    top: 7,
    zIndex: 0,
  },
  matchCardDarkTint: {
    backgroundColor: 'rgba(3,6,18,0.24)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  matchCardDepthShadow: {
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderRadius: 29,
    bottom: -18,
    left: 14,
    position: 'absolute',
    right: 14,
    top: 16,
    zIndex: 0,
  },
  primaryActionDepthShadow: {
    backgroundColor: 'rgba(0,0,0,0.14)',
    borderRadius: 28,
    bottom: -8,
    left: 8,
    position: 'absolute',
    right: 8,
    top: 9,
    zIndex: 0,
  },
  readyBoardDarkTint: {
    backgroundColor: 'rgba(3,6,18,0.06)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  readyBoardDepthShadow: {
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderRadius: 32,
    bottom: -20,
    left: 22,
    position: 'absolute',
    right: 22,
    top: 22,
    zIndex: 0,
  },
  ambientGlow: {
    borderRadius: 999,
    position: 'absolute',
  },
  ambientGlowLeft: {
    backgroundColor: 'rgba(129,76,255,0.14)',
    height: 220,
    left: -126,
    top: 28,
    width: 220,
  },
  ambientGlowRight: {
    backgroundColor: 'rgba(54,168,255,0.10)',
    height: 260,
    right: -152,
    top: 176,
    width: 260,
  },
  avatarPressed: { opacity: 0.86, transform: [{ scale: 0.975 }] },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(6,8,18,0.95)',
    justifyContent: 'center',
  },
  avatarInitials: { color: '#F7F8FF', fontSize: 16, fontWeight: '900' },
  avatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B073FF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.36,
    shadowRadius: 13,
  },
  avatarStatusBadge: {
    borderColor: '#06101E',
    borderRadius: 99,
    borderWidth: 3,
    bottom: 4,
    height: 14,
    left: 4,
    position: 'absolute',
    width: 14,
  },
  boardHeaderRow: { minHeight: 42, position: 'relative' },
  boardSubtitle: {
    color: '#D1D7E8',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.04,
    lineHeight: 15,
    marginTop: 1,
    maxWidth: 246,
  },
  boardTitle: {
    ...liquidTypography.heroTitle,
    fontWeight: '700',
    letterSpacing: -0.24,
    lineHeight: 23,
    marginTop: 3,
    textShadowColor: 'rgba(255,255,255,0.10)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 3,
  },
  boardTitleBlock: { minWidth: 0, paddingRight: 0 },
  bottomFade: {
    backgroundColor: 'rgba(1,3,8,0.46)',
    bottom: 0,
    height: 150,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  actionIconForeground: { zIndex: 2 },
  chatUnreadBadge: {
    borderRadius: 8,
    height: 16,
    minWidth: 16,
    paddingHorizontal: 0,
  },
  chatUnreadBadgeHost: { right: -2, top: -2 },
  cardActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginLeft: 4,
  },
  cardHalo: {
    borderRadius: 27,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    opacity: 0.24,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cardPrimaryActionEdgeLine: {
    borderRadius: 999,
    height: 1,
    left: 14,
    opacity: 0.22,
    position: 'absolute',
    right: 16,
    top: 1,
  },
  cardPrimaryActionSheen: {
    borderRadius: 21,
    bottom: 0,
    left: -12,
    opacity: 0.2,
    position: 'absolute',
    right: -12,
    top: -8,
  },
  cardPrimaryAction: {
    borderRadius: 19,
    elevation: 2,
    minWidth: 68,
    overflow: 'visible',
    position: 'relative',
    shadowColor: '#C679FF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardPrimaryActionGradient: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
    zIndex: 2,
  },
  cardPrimaryActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.08,
    zIndex: 2,
  },
  cardStatusDot: {
    borderRadius: 99,
    height: 8,
    marginRight: 5,
    width: 8,
  },
  emptyBody: {
    color: '#A8AFC6',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 7,
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'stretch',
    backgroundColor: 'rgba(6,11,25,0.78)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 18,
  },
  emptyCardShell: { marginTop: 17 },
  emptyIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(198,121,255,0.14)',
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  emptyPreviewAvatar: {
    backgroundColor: 'rgba(198,121,255,0.45)',
    borderRadius: 999,
    height: 34,
    width: 34,
  },
  emptyPreviewLine: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 999,
    height: 8,
  },
  emptyPreviewLineLong: { width: '78%' },
  emptyPreviewLineShort: { width: '46%' },
  emptyPreviewLines: { flex: 1, gap: 7 },
  emptyPreviewPill: {
    backgroundColor: '#F7F8FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  emptyPreviewPillText: {
    color: '#10131F',
    fontSize: 11,
    fontWeight: '900',
  },
  emptyPreviewRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    padding: 10,
  },
  emptyTitle: {
    color: '#F7F8FF',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
  },
  eyebrow: {
    color: '#B179FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.22,
  },
  footerSeparator: {
    color: 'rgba(226,232,255,0.52)',
    fontSize: 10,
    fontWeight: '700',
    marginHorizontal: 5,
  },
  greeting: {
    ...liquidTypography.screenGreeting,
    fontSize: 13,
    fontWeight: '500',
  },
  greetingBlock: { flex: 1, minWidth: 0 },
  identityRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  kindPill: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 5,
    maxWidth: 124,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  kindPillSheen: {
    borderRadius: 18,
    bottom: 0,
    left: 0,
    opacity: 0.78,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  kindText: { fontSize: 9, fontWeight: '700', zIndex: 2 },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  liveDot: {
    backgroundColor: '#AEB7D0',
    borderRadius: 99,
    height: 7,
    width: 7,
  },
  liveDotActive: { backgroundColor: '#5DFFB3' },
  liveText: { color: '#DDE6FF', fontSize: 10, fontWeight: '600' },
  matchAvatarWrap: { position: 'relative' },
  matchCardPressable: {
    borderRadius: 30,
    position: 'relative',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 13,
  },
  matchCard: {
    backgroundColor: 'rgba(9,11,24,0.58)',
    borderRadius: 27,
    minHeight: 102,
    overflow: 'hidden',
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  matchCardFrame: {
    borderRadius: 28,
    overflow: 'visible',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { height: 12, width: 0 },
    elevation: 7,
    shadowOpacity: 0.2,
    shadowRadius: 26,
  },
  matchCardSheen: {
    height: 46,
    left: 0,
    opacity: 0.06,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  matchCardInnerReflection: {
    bottom: 0,
    left: 0,
    opacity: 0.08,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  matchEdgeSpark: {
    borderRadius: 999,
    opacity: 0.3,
    position: 'absolute',
  },
  matchEdgeSparkBottom: {
    bottom: 0,
    height: 1,
    opacity: 0.18,
    right: 30,
    width: 126,
  },
  matchEdgeSparkRight: {
    bottom: 24,
    opacity: 0.24,
    right: 0,
    top: 24,
    width: 1,
  },
  matchEdgeSparkTop: {
    height: 1,
    left: 28,
    opacity: 0.26,
    right: 70,
    top: 0,
  },
  matchCardTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  matchFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  matchList: { gap: 8, marginTop: 9 },
  matchesSectionHeader: { marginTop: 9 },
  matchMainInfo: { flex: 1, minWidth: 0, paddingTop: 1 },
  matchMeta: {
    color: 'rgba(214,220,237,0.90)',
    flex: 1,
    flexShrink: 1,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: -0.03,
    lineHeight: 13,
  },
  matchMetaBlock: { flex: 1, minWidth: 0 },
  matchName: {
    color: 'rgba(248,250,255,0.93)',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  matchNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minHeight: 26,
  },
  matchSubtitle: {
    color: 'rgba(226,232,255,0.72)',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: -0.03,
    lineHeight: 14,
    marginTop: 1,
  },
  matchTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    minWidth: 0,
  },
  miniStatusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 3,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  miniStatusText: { color: '#F0F3FF', fontSize: 11, fontWeight: '600' },
  modeChip: {
    alignItems: 'center',
    borderRadius: 15,
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    minHeight: 27,
    minWidth: 0,
    paddingHorizontal: 2,
    shadowColor: '#B073FF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  modeChipSelected: {
    backgroundColor: 'rgba(126,69,255,0.20)',
    borderColor: 'rgba(220,174,255,0.24)',
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  modeChipFrame: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.19)',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modeChipFrameSelected: {
    borderColor: 'rgba(220,174,255,0.86)',
    shadowColor: '#B073FF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.58,
    shadowRadius: 13,
  },
  modeGrid: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 5,
  },
  modeLabel: {
    color: '#CBD3E7',
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: -0.08,
  },
  modeLabelSelected: { color: 'rgba(255,255,255,0.90)', fontWeight: '700' },
  notificationButton: {
    alignItems: 'center',
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    marginLeft: 8,
    overflow: 'visible',
    shadowColor: '#FFFFFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    width: 42,
  },
  notificationDot: {
    backgroundColor: '#FF4F95',
    borderRadius: 99,
    height: 10,
    width: 10,
  },
  previewBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,184,107,0.12)',
    borderColor: 'rgba(255,184,107,0.25)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewText: { color: '#FFD9A8', flex: 1, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  primaryAction: {
    borderRadius: 22,
    elevation: 2,
    minWidth: 114,
    overflow: 'visible',
    position: 'relative',
    shadowColor: '#9E77FF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  primaryActionActive: {},
  primaryActionEdgeLine: {
    backgroundColor: 'rgba(255,255,255,0.46)',
    borderRadius: 999,
    height: 1,
    left: 18,
    opacity: 0.48,
    position: 'absolute',
    right: 18,
    top: 1,
  },
  primaryActionSheen: {
    borderRadius: 28,
    bottom: 0,
    left: -18,
    opacity: 0.18,
    position: 'absolute',
    right: -18,
    top: -10,
  },
  primaryActionGradient: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 32,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 2,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.04,
    zIndex: 2,
  },
  readyActionRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.05)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 5,
    paddingTop: 5,
  },
  readyBoardContent: {
    minHeight: 166,
    padding: 12,
    position: 'relative',
  },
  readyBoardSurface: {
    backgroundColor: 'rgba(7,10,23,0.52)',
    borderRadius: 27,
    minHeight: 166,
    overflow: 'hidden',
    padding: 0,
    zIndex: 2,
  },
  readyBoardBorder: {
    borderRadius: 28,
    elevation: 7,
    marginTop: 10,
    overflow: 'visible',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  readyBoardEdgeSweep: {
    backgroundColor: 'rgba(100,230,255,0.23)',
    borderRadius: 999,
    bottom: 20,
    opacity: 0.08,
    position: 'absolute',
    right: 0,
    top: 32,
    width: 1,
  },
  readyBoardSheen: {
    height: 96,
    left: -20,
    position: 'absolute',
    right: -20,
    top: -22,
  },
  readyBoardInnerReflection: {
    bottom: 0,
    left: 0,
    opacity: 0.17,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  readyCopy: {
    color: '#F7F8FF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.03,
    lineHeight: 15,
  },
  readyCopyBlock: { flex: 1, minWidth: 0 },
  readyDescription: {
    color: '#C4CBDE',
    fontSize: 9,
    fontWeight: '500',
    lineHeight: 12,
    marginTop: 1,
  },
  readyHeroImage: {
    height: '100%',
    left: 0,
    opacity: 0.72,
    position: 'absolute',
    top: 0,
    transform: [{ scale: 1.18 }, { translateX: -18 }],
    width: '100%',
  },
  root: { backgroundColor: liquidColors.background.base, flex: 1 },
  safe: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 16,
    height: 31,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    width: 31,
  },
  secondaryActionIcon: { zIndex: 3 },
  secondaryActionSurface: {
    backgroundColor: 'rgba(18,20,38,0.58)',
    borderRadius: 21,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  sectionEyebrow: {
    ...liquidTypography.sectionLabel,
    fontWeight: '700',
    letterSpacing: 0.38,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    ...liquidTypography.sectionTitle,
    color: 'rgba(248,250,255,0.92)',
    fontWeight: '600',
    letterSpacing: -0.22,
    marginTop: 5,
  },
  softTag: { flexShrink: 0 },
  softTagText: { fontSize: 9, fontWeight: '600', letterSpacing: -0.02 },
  statusLabel: { fontSize: 9, fontWeight: '700', maxWidth: 62 },
  statusMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 0,
  },
  surfaceFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  tabItem: {
    alignItems: 'center',
    borderRadius: 21,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 35,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  tabItemActive: {
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    shadowColor: '#8C7BFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  tabLabel: { color: 'rgba(210,218,245,0.56)', fontSize: 8, fontWeight: '600' },
  tabLabelActive: { color: 'rgba(255,255,255,0.82)', fontWeight: '700' },
  tabsShell: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(15,18,32,0.24)',
    borderColor: 'rgba(255,255,255,0.065)',
    borderRadius: 24,
    borderWidth: 1,
    bottom: 16,
    flexDirection: 'row',
    gap: 4,
    left: 46,
    overflow: 'hidden',
    padding: 3,
    position: 'absolute',
    right: 46,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  userName: {
    ...liquidTypography.screenName,
    fontSize: 23,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 27,
    marginTop: 0,
  },
});
