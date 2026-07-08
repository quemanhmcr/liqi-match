import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/shared/auth/auth-context';
import {
  LiquidEdgeGlow,
  type EdgeGlowSegment,
} from '@/shared/components/liquid-edge-glow';

import {
  buildPreviewHomeDashboard,
  fetchHomeDashboard,
  homeReadyModes,
  type HomeReadyMode,
  type MatchedSet,
  type MatchedSetStatus,
} from '@/features/home/home-dashboard-service';

const heroBackground =
  require('../../assets/anh_mau_3/background_hero_trang_chu.png') as number;
const avatarMinhAnh =
  require('../../assets/anh_mau_3/avatar_minh_anh_support.png') as number;
const avatarKhoaJungle =
  require('../../assets/anh_mau_3/avatar_khoa_jungle_assassin.png') as number;
const avatarTeamSaoBang =
  require('../../assets/anh_mau_3/avatar_team_sao_bang_emblem.png') as number;

const tabs = [
  { icon: 'home', key: 'home', label: 'Trang chủ' },
  { icon: 'compass-outline', key: 'discover', label: 'Khám phá' },
  { icon: 'chatbubble-ellipses-outline', key: 'messages', label: 'Tin nhắn' },
  { icon: 'person-outline', key: 'profile', label: 'Hồ sơ' },
] as const;

const defaultMode: HomeReadyMode = homeReadyModes[0] ?? {
  accent: '#C679FF',
  description: 'Vào set nhanh với người đã match.',
  id: 'setlv',
  label: 'Set LV',
};

const modeIcons: Record<HomeReadyMode['id'], keyof typeof Ionicons.glyphMap> = {
  normal: 'shield-checkmark-outline',
  rank: 'trophy-outline',
  setlv: 'sparkles-outline',
  soulmate: 'heart-outline',
  team: 'people-outline',
};

const kindIcons: Record<MatchedSet['kind'], keyof typeof Ionicons.glyphMap> = {
  Normal: 'shield-checkmark-outline',
  Rank: 'trophy-outline',
  'Set LV': 'sparkles-outline',
  'Team Rank': 'people-outline',
  'Tri kỉ': 'heart-outline',
};

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
  'Set LV': {
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


const readyBoardEdgeGlowSegments: readonly EdgeGlowSegment[] = [
  {
    bloomOpacity: 0.15,
    bloomWidth: 4.8,
    blur: 12,
    color: 'rgba(206,138,255,0.56)',
    end: 0.052,
    id: 'hero-purple-top',
    lineOpacity: 0.34,
    lineWidth: 0.74,
    start: 0,
  },
  {
    bloomOpacity: 0.09,
    bloomWidth: 4.5,
    blur: 12,
    color: 'rgba(190,105,255,0.40)',
    end: 1,
    id: 'hero-purple-wrap',
    lineOpacity: 0.18,
    lineWidth: 0.70,
    start: 0.97,
  },
  {
    bloomOpacity: 0.18,
    bloomWidth: 5.1,
    blur: 13,
    color: 'rgba(78,222,255,0.50)',
    end: 0.512,
    id: 'hero-cyan-right',
    lineOpacity: 0.32,
    lineWidth: 0.76,
    start: 0.39,
  },
  {
    bloomOpacity: 0.07,
    bloomWidth: 4.4,
    blur: 12,
    color: 'rgba(88,206,255,0.28)',
    end: 0.615,
    id: 'hero-blue-lower',
    lineOpacity: 0.10,
    lineWidth: 0.68,
    start: 0.525,
  },
];

const readyCtaEdgeGlowSegments: readonly EdgeGlowSegment[] = [
  {
    bloomOpacity: 0.17,
    bloomWidth: 4.4,
    blur: 10,
    color: 'rgba(224,156,255,0.58)',
    end: 0.125,
    id: 'ready-cta-top',
    lineOpacity: 0.48,
    lineWidth: 0.76,
    start: 0,
  },
  {
    bloomOpacity: 0.19,
    bloomWidth: 4.7,
    blur: 11,
    color: 'rgba(90,226,255,0.48)',
    end: 0.50,
    id: 'ready-cta-right',
    lineOpacity: 0.46,
    lineWidth: 0.78,
    start: 0.39,
  },
];

function matchEdgeGlowSegments(tone: MatchTone): EdgeGlowSegment[] {
  return [
    {
      bloomOpacity: 0.12,
      bloomWidth: 4.3,
      blur: 11,
      color: tone.borderStrong,
      end: 0.073,
      id: 'match-top-left',
      lineOpacity: 0.30,
      lineWidth: 0.72,
      start: 0,
    },
    {
      bloomOpacity: 0.08,
      bloomWidth: 4.1,
      blur: 11,
      color: tone.borderStrong,
      end: 1,
      id: 'match-left-wrap',
      lineOpacity: 0.20,
      lineWidth: 0.68,
      start: 0.968,
    },
    {
      bloomOpacity: 0.14,
      bloomWidth: 4.9,
      blur: 12,
      color: tone.text,
      end: 0.512,
      id: 'match-right-corner',
      lineOpacity: 0.30,
      lineWidth: 0.74,
      start: 0.398,
    },
    {
      bloomOpacity: 0.07,
      bloomWidth: 4.2,
      blur: 11,
      color: tone.borderStrong,
      end: 0.63,
      id: 'match-lower-right',
      lineOpacity: 0.14,
      lineWidth: 0.68,
      start: 0.555,
    },
  ];
}


function actionEdgeGlowSegments(tone: MatchTone): EdgeGlowSegment[] {
  return [
    {
      bloomOpacity: 0.10,
      bloomWidth: 4.1,
      blur: 11,
      color: tone.borderStrong,
      end: 0.12,
      id: 'action-top-glint',
      lineOpacity: 0.24,
      lineWidth: 0.66,
      start: 0,
    },
    {
      bloomOpacity: 0.12,
      bloomWidth: 4.6,
      blur: 12,
      color: tone.text,
      end: 0.505,
      id: 'action-right-glint',
      lineOpacity: 0.24,
      lineWidth: 0.68,
      start: 0.405,
    },
  ];
}


const templateMatchedSets: MatchedSet[] = [
  {
    actionLabel: 'Vào set',
    createdAt: 'template-1',
    heroNames: ['Aya', 'Helen', 'Annette'],
    id: 'template-minh-anh',
    kind: 'Tri kỉ',
    meta: 'Tối · Voice khi cần',
    name: 'Minh Anh',
    rankName: 'Cao Thủ',
    roleNames: ['Trợ Thủ'],
    status: 'ready',
    statusLabel: 'Sẵn sàng',
    subtitle: 'Cao Thủ · Trợ Thủ · Global',
    unreadCount: 1,
  },
  {
    actionLabel: 'Vào set',
    createdAt: 'template-2',
    heroNames: ['Nakroth', 'Aoi', 'Keera'],
    id: 'template-khoa-jungle',
    kind: 'Rank',
    meta: 'Leo rank nghiêm túc · Ping/chat là chính',
    name: 'Khoa Jungle',
    rankName: 'Chiến Tướng',
    roleNames: ['Đi Rừng'],
    status: 'online',
    statusLabel: 'Online',
    subtitle: 'Chiến Tướng · Đi Rừng · Global',
  },
  {
    actionLabel: 'Join lobby',
    createdAt: 'template-3',
    heroNames: ['Liliana', 'Yue', 'Lorion'],
    id: 'template-team-sao-bang',
    kind: 'Team Rank',
    meta: 'Team 4/5 · thiếu Mid call map',
    name: 'Team Sao Băng',
    rankName: 'Đại Cao Thủ',
    roleNames: ['Đường Giữa'],
    status: 'idle',
    statusLabel: 'Chờ phản hồi',
    subtitle: 'Đại Cao Thủ · Team Rank · cần Mid',
  },
];

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

export default function HomeScreen() {
  const { session } = useAuth();
  const [selectedModeId, setSelectedModeId] =
    useState<HomeReadyMode['id']>('setlv');
  const [readyEnabled, setReadyEnabled] = useState(false);

  const dashboardQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return fetchHomeDashboard(session);
    },
    queryKey: ['home-dashboard', session?.user.id],
  });

  const dashboard = dashboardQuery.data ?? buildPreviewHomeDashboard(session);
  const matchedSetsToRender = dashboard.matchedSets.length
    ? dashboard.matchedSets
    : templateMatchedSets;
  const activeMatchCount = dashboard.activeMatchCount || matchedSetsToRender.length;
  const selectedMode = useMemo(
    () =>
      homeReadyModes.find((mode) => mode.id === selectedModeId) ?? defaultMode,
    [selectedModeId],
  );
  const readyCopy = readyEnabled
    ? `Đang bật ${selectedMode.label}`
    : 'Bật sẵn sàng';

  const selectMode = (modeId: HomeReadyMode['id']) => {
    selectionImpact();
    setSelectedModeId(modeId);
  };

  const toggleReady = () => {
    impactLight();
    setReadyEnabled((value) => !value);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#020510', '#071126', '#02040B']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.bgPurpleGlow} />
      <View pointerEvents="none" style={styles.bgCyanGlow} />
      <View pointerEvents="none" style={styles.bgVignette} />
      <View style={styles.bottomFade} />
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView
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
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <View style={styles.identityRow}>
              <Avatar
                fallbackUri={dashboard.currentProfile.avatarFallbackUrl}
                name={dashboard.currentProfile.displayName}
                size={54}
                source={avatarKhoaJungle}
                uri={dashboard.currentProfile.avatarUrl}
              />
              <View style={styles.greetingBlock}>
                <HomeText style={styles.greeting}>Xin chào,</HomeText>
                <HomeText numberOfLines={1} style={styles.userName}>
                  {displayFirstName(dashboard.currentProfile.displayName)}
                </HomeText>
                <View style={styles.miniStatusPill}>
                  <View style={styles.statusDot} />
                  <HomeText numberOfLines={1} style={styles.miniStatusText}>
                    {activeMatchCount
                      ? `${activeMatchCount} set đã match`
                      : dashboard.currentProfile.readySummary}
                  </HomeText>
                </View>
              </View>
            </View>

            <Pressable
              accessibilityLabel="Thông báo"
              accessibilityRole="button"
              onPress={selectionImpact}
              style={({ pressed }) => [
                styles.notificationButton,
                pressed && styles.pressed,
              ]}
            >
              <BlurView intensity={34} style={styles.surfaceFill} tint="dark" />
              <LinearGradient
                colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.02)']}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons
                color="#F7F8FF"
                name="notifications-outline"
                size={21}
              />
              <View style={styles.notificationDot} />
            </Pressable>
          </View>

          {dashboardQuery.isError ? (
            <View style={styles.previewBanner}>
              <Ionicons color="#FFB86B" name="information-circle" size={16} />
              <HomeText style={styles.previewText}>
                {dashboardQuery.isError
                  ? 'Chưa đọc được dữ liệu match thật, đang hiển thị layout preview.'
                  : 'Preview giao diện Trang chủ với set đã match.'}
              </HomeText>
            </View>
          ) : null}

          <LinearGradient
            colors={[
              'rgba(210,151,255,0.14)',
              'rgba(255,255,255,0.020)',
              'rgba(100,230,255,0.12)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.readyBoardBorder}
          >
            <View pointerEvents="none" style={styles.readyBoardDepthShadow} />
            <LiquidEdgeGlow
              baseStrokeOpacity={0.04}
              baseStrokeWidth={0.52}
              pad={16}
              radius={28}
              segments={readyBoardEdgeGlowSegments}
            />
            <BlurView intensity={36} style={styles.readyBoard} tint="dark">
              <Image
                resizeMode="cover"
                source={heroBackground}
                style={styles.readyHeroImage}
              />
              <View pointerEvents="none" style={styles.readyBoardDarkTint} />
              <LinearGradient
                pointerEvents="none"
                colors={[
                  'rgba(5,8,20,0.18)',
                  'rgba(5,8,20,0.09)',
                  'rgba(5,8,20,0.02)',
                ]}
                locations={[0, 0.76, 1]}
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
                colors={[
                  'rgba(70,220,255,0)',
                  'rgba(82,214,255,0.040)',
                ]}
                end={{ x: 1, y: 1 }}
                pointerEvents="none"
                start={{ x: 0.08, y: 0.16 }}
                style={styles.readyBoardInnerReflection}
              />
              <View style={styles.boardHeaderRow}>
                <View style={styles.boardTitleBlock}>
                  <HomeText style={styles.eyebrow}>LIQI LOBBY</HomeText>
                  <HomeText numberOfLines={1} style={styles.boardTitle}>
                    Sẵn sàng vào set?
                  </HomeText>
                </View>
                <View style={styles.liveBadge}>
                  <View
                    style={[
                      styles.liveDot,
                      readyEnabled && styles.liveDotActive,
                    ]}
                  />
                  <HomeText style={styles.liveText}>
                    {readyEnabled ? 'Ready' : 'Idle'}
                  </HomeText>
                </View>
              </View>

              <HomeText numberOfLines={2} style={styles.boardSubtitle}>
                Chọn mood chơi hôm nay để các tài khoản đã match biết bạn đang muốn vào set kiểu nào.
              </HomeText>

              <ScrollView
                contentContainerStyle={styles.modeRailContent}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.modeRail}
              >
                {homeReadyModes.map((mode) => {
                  const selected = mode.id === selectedModeId;
                  return (
                    <Pressable
                      accessibilityLabel={mode.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={mode.id}
                      onPress={() => selectMode(mode.id)}
                      style={({ pressed }) => [
                        styles.modeChip,
                        selected && styles.modeChipSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        color={selected ? 'rgba(247,248,255,0.88)' : mode.accent}
                        name={modeIcons[mode.id]}
                        size={12}
                      />
                      <HomeText
                        style={[
                          styles.modeLabel,
                          selected && styles.modeLabelSelected,
                        ]}
                      >
                        {mode.label}
                      </HomeText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.readyActionRow}>
                <View style={styles.readyCopyBlock}>
                  <HomeText numberOfLines={1} style={styles.readyCopy}>{readyCopy}</HomeText>
                  <HomeText numberOfLines={2} style={styles.readyDescription}>
                    {selectedMode.description}
                  </HomeText>
                </View>
                <Pressable
                  accessibilityLabel={
                    readyEnabled ? 'Tắt sẵn sàng' : 'Bật sẵn sàng'
                  }
                  accessibilityRole="button"
                  onPress={toggleReady}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    readyEnabled && styles.primaryActionActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <View pointerEvents="none" style={styles.primaryActionDepthShadow} />
                  <LiquidEdgeGlow
                    baseStrokeOpacity={0.08}
                    baseStrokeWidth={0.58}
                    pad={14}
                    radius={28}
                    segments={readyCtaEdgeGlowSegments}
                  />
                  <LinearGradient
                    colors={
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
                    locations={readyEnabled ? [0, 0.50, 1] : [0, 0.52, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryActionGradient}
                  >
                    <LinearGradient
                      colors={[
                        'rgba(255,255,255,0.52)',
                        'rgba(255,255,255,0.10)',
                        'rgba(255,255,255,0)',
                      ]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.primaryActionSheen}
                    />
                    <View style={styles.primaryActionEdgeLine} />
                    <HomeText style={styles.primaryActionText}>
                      {readyEnabled ? 'Đang bật' : 'Bật ngay'}
                    </HomeText>
                    <Ionicons
                      color="#FFFFFF"
                      name="arrow-forward"
                      size={18}
                      style={styles.actionIconForeground}
                    />
                  </LinearGradient>
                </Pressable>
              </View>
            </BlurView>
          </LinearGradient>

          <View style={styles.sectionHeader}>
            <View>
              <HomeText style={styles.sectionEyebrow}>MATCHED</HomeText>
              <HomeText style={styles.sectionTitle}>
                Đã match thành công
              </HomeText>
            </View>
            {dashboardQuery.isLoading ? (
              <ActivityIndicator color="#C679FF" />
            ) : null}
          </View>

          {matchedSetsToRender.length ? (
            <View style={styles.matchList}>
              {matchedSetsToRender.map((set, index) => (
                <MatchedSetCard index={index} key={set.id} set={set} />
              ))}
            </View>
          ) : (
            <EmptyMatchedSets />
          )}
        </ScrollView>

        <FloatingTabs />
      </SafeAreaView>
    </View>
  );
}

function MatchedSetCard({ index, set }: { index: number; set: MatchedSet }) {
  const statusStyle = statusStyles[set.status];
  const tone = matchTones[set.kind];
  const avatarSource = mockAvatarSource(set, index);
  const matchGlowSegments = useMemo(() => matchEdgeGlowSegments(tone), [tone]);
  const actionGlowSegments = useMemo(() => actionEdgeGlowSegments(tone), [tone]);

  return (
    <Pressable
      accessibilityLabel={`${set.name}, ${set.kind}`}
      accessibilityRole="button"
      onPress={selectionImpact}
      style={({ pressed }) => [
        styles.matchCardPressable,
        { shadowColor: tone.text },
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={[tone.border, 'rgba(255,255,255,0.035)', 'rgba(255,255,255,0.018)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.matchCardFrame}
      >
        <View pointerEvents="none" style={styles.matchCardDepthShadow} />
        <LiquidEdgeGlow
          baseStrokeColor={tone.border}
          baseStrokeOpacity={0.08}
          baseStrokeWidth={0.58}
          pad={14}
          radius={28}
          segments={matchGlowSegments}
        />
        <BlurView intensity={34} style={styles.matchCard} tint="dark">
          <View pointerEvents="none" style={styles.matchCardDarkTint} />
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.095)',
              'rgba(255,255,255,0.018)',
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
          {set.unreadCount ? (
            <LinearGradient
              colors={['rgba(196,66,130,0.64)', 'rgba(112,68,176,0.36)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.unreadPillFloating}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0)']}
                pointerEvents="none"
                style={styles.unreadPillSheen}
              />
              <HomeText style={styles.unreadText}>{set.unreadCount}</HomeText>
            </LinearGradient>
          ) : null}

          <View style={styles.matchCardTop}>
            <View style={styles.matchAvatarWrap}>
              <Avatar
                name={set.name}
                size={58}
                source={avatarSource}
                uri={set.avatarUrl}
              />
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
                <View
                  style={[
                    styles.kindPill,
                    set.unreadCount ? styles.kindPillUnreadOffset : undefined,
                    { backgroundColor: tone.pillBg, borderColor: tone.border },
                  ]}
                >
                  <LinearGradient
                    colors={[
                      'rgba(255,255,255,0.18)',
                      'rgba(255,255,255,0.025)',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.kindPillSheen}
                  />
                  <Ionicons
                    color={tone.text}
                    name={kindIcons[set.kind]}
                    size={14}
                  />
                  <HomeText
                    numberOfLines={1}
                    style={[styles.kindText, { color: tone.text }]}
                  >
                    {set.kind}
                  </HomeText>
                </View>
              </View>
              <HomeText numberOfLines={1} style={styles.matchSubtitle}>
                {set.subtitle || 'Đã match thành công'}
              </HomeText>

              <View style={styles.matchTagsRow}>
                {[...set.heroNames.slice(0, 3), ...set.roleNames.slice(0, 1)]
                  .slice(0, 4)
                  .map((label) => (
                    <View
                      key={label}
                      style={[
                        styles.softTag,
                        { backgroundColor: tone.chipBg, borderColor: tone.border },
                      ]}
                    >
                      <HomeText
                        numberOfLines={1}
                        style={[styles.softTagText, { color: tone.text }]}
                      >
                        {label}
                      </HomeText>
                    </View>
                  ))}
              </View>
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
                  {set.statusLabel}
                </HomeText>
                <View style={styles.footerDivider} />
                <HomeText numberOfLines={1} style={styles.matchMeta}>
                  {set.meta}
                </HomeText>
              </View>
            </View>

            <View style={styles.cardActions}>
              <Pressable
                android_ripple={null}
                accessibilityRole="button"
                onPress={selectionImpact}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  { borderColor: tone.border, shadowColor: tone.text },
                  pressed && styles.pressed,
                ]}
              >
                <View pointerEvents="none" style={styles.cardActionDepthShadow} />
                <LiquidEdgeGlow
                  baseStrokeColor={tone.border}
                  baseStrokeOpacity={0.09}
                  baseStrokeWidth={0.62}
                  height={37}
                  pad={12}
                  radius={21}
                  segments={actionGlowSegments}
                  width={37}
                />
                <View pointerEvents="none" style={styles.secondaryActionSurface}>
                  <BlurView intensity={20} style={styles.surfaceFill} tint="dark" />
                  <LinearGradient
                    colors={[
                      'rgba(255,255,255,0.13)',
                      'rgba(255,255,255,0.016)',
                    ]}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
                <Ionicons
                  color="#EAF0FF"
                  name="chatbubble-ellipses-outline"
                  size={17}
                  style={styles.secondaryActionIcon}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={impactLight}
                style={({ pressed }) => [
                  styles.cardPrimaryAction,
                  { shadowColor: tone.text },
                  pressed && styles.pressed,
                ]}
              >
                <View pointerEvents="none" style={styles.cardActionDepthShadow} />
                <LiquidEdgeGlow
                  baseStrokeColor={tone.border}
                  baseStrokeOpacity={0.06}
                  baseStrokeWidth={0.54}
                  pad={12}
                  radius={21}
                  segments={actionGlowSegments}
                />
                <LinearGradient
                  colors={tone.actionGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardPrimaryActionGradient}
                >
                  <LinearGradient
                    colors={[
                      'rgba(255,255,255,0.50)',
                      'rgba(255,255,255,0.08)',
                      'rgba(255,255,255,0)',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardPrimaryActionSheen}
                  />
                  <View
                    style={[
                      styles.cardPrimaryActionEdgeLine,
                      { backgroundColor: tone.text },
                    ]}
                  />
                  <HomeText style={styles.cardPrimaryActionText}>
                    {set.actionLabel}
                  </HomeText>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </BlurView>
      </LinearGradient>
    </Pressable>
  );
}

function EmptyMatchedSets() {
  return (
    <BlurView intensity={22} style={styles.emptyCard} tint="dark">
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
    </BlurView>
  );
}

function FloatingTabs() {
  return (
    <BlurView intensity={24} style={styles.tabsShell} tint="dark">
      <LinearGradient
        colors={['rgba(255,255,255,0.055)', 'rgba(255,255,255,0.010)']}
        style={StyleSheet.absoluteFill}
      />
      {tabs.map((tab) => {
        const active = tab.key === 'home';
        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={tab.key}
            onPress={selectionImpact}
            style={({ pressed }) => [
              styles.tabItem,
              active && styles.tabItemActive,
              pressed && styles.pressed,
            ]}
          >
            {active ? (
              <LinearGradient
                colors={['rgba(124,107,255,0.09)', 'rgba(82,158,255,0.018)']}
                end={{ x: 1, y: 1 }}
                start={{ x: 0, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <Ionicons
              color={active ? 'rgba(255,255,255,0.84)' : '#A8AFC6'}
              name={tab.icon}
              size={active ? 20 : 19}
            />
            <HomeText
              style={[styles.tabLabel, active && styles.tabLabelActive]}
            >
              {tab.label}
            </HomeText>
          </Pressable>
        );
      })}
    </BlurView>
  );
}

function Avatar({
  fallbackUri,
  name,
  size,
  source,
  uri,
}: {
  fallbackUri?: string;
  name: string;
  size: number;
  source?: ImageSourcePropType;
  uri?: string;
}) {
  const initials = getInitials(name);
  const [failedUri, setFailedUri] = useState<string | undefined>();
  const activeUri =
    uri && failedUri !== uri
      ? uri
      : fallbackUri && failedUri !== fallbackUri
        ? fallbackUri
        : undefined;
  const imageSource: ImageSourcePropType | undefined = activeUri
    ? { uri: activeUri }
    : source;

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
            if (activeUri) setFailedUri(activeUri);
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

function mockAvatarSource(set: MatchedSet, index: number): ImageSourcePropType {
  const normalized = `${set.id} ${set.name}`.toLowerCase();
  if (normalized.includes('minh') || index === 0) return avatarMinhAnh;
  if (normalized.includes('khoa') || index === 1) return avatarKhoaJungle;
  if (normalized.includes('team') || normalized.includes('sao') || index === 2)
    return avatarTeamSaoBang;
  return index % 2 === 0 ? avatarMinhAnh : avatarKhoaJungle;
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
    backgroundColor: 'rgba(3,6,18,0.038)',
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
    bottom: 5,
    height: 16,
    left: 5,
    position: 'absolute',
    width: 16,
  },
  boardHeaderRow: { minHeight: 58, position: 'relative' },
  boardSubtitle: {
    color: '#B9C0D5',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.05,
    lineHeight: 17,
    marginTop: 7,
    maxWidth: 276,
  },
  boardTitle: {
    color: 'rgba(248,250,255,0.96)',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.26,
    lineHeight: 24,
    marginTop: 6,
    textShadowColor: 'rgba(255,255,255,0.12)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 4,
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
  cardActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginLeft: 7,
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
    opacity: 0.20,
    position: 'absolute',
    right: -12,
    top: -8,
  },
  cardPrimaryAction: {
    borderRadius: 21,
    elevation: 3,
    minWidth: 82,
    overflow: 'visible',
    position: 'relative',
    shadowColor: '#C679FF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
  },
  cardPrimaryActionGradient: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.105)',
    borderRadius: 21,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 2,
    minHeight: 35,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  cardPrimaryActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.10,
    zIndex: 2,
  },
  cardStatusDot: { borderRadius: 99, height: 8, marginRight: 5, width: 8 },
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
    marginTop: 17,
    overflow: 'hidden',
    padding: 18,
  },
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
  footerDivider: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    height: 15,
    marginHorizontal: 7,
    width: 1,
  },
  greeting: { color: '#B9C0D5', fontSize: 14, fontWeight: '500' },
  greetingBlock: { flex: 1, minWidth: 0 },
  identityRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 11,
    minWidth: 0,
  },
  kindPill: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
    maxWidth: 112,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 7,
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
  kindPillUnreadOffset: { marginRight: 19 },
  kindText: { fontSize: 10, fontWeight: '700', zIndex: 2 },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.065)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  liveDot: {
    backgroundColor: '#AEB7D0',
    borderRadius: 99,
    height: 9,
    width: 9,
  },
  liveDotActive: { backgroundColor: '#5DFFB3' },
  liveText: { color: '#DDE6FF', fontSize: 12, fontWeight: '600' },
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
    minHeight: 112,
    overflow: 'hidden',
    paddingBottom: 10,
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  matchCardFrame: {
    borderRadius: 28,
    overflow: 'visible',
    padding: 1,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { height: 12, width: 0 },
    elevation: 7,
    shadowOpacity: 0.20,
    shadowRadius: 26,
  },
  matchCardSheen: {
    height: 46,
    left: 0,
    opacity: 0.075,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  matchCardInnerReflection: {
    bottom: 0,
    left: 0,
    opacity: 0.10,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  matchEdgeSpark: {
    borderRadius: 999,
    opacity: 0.30,
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
  matchCardTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  matchFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
  },
  matchList: { gap: 9, marginTop: 12 },
  matchMainInfo: { flex: 1, minWidth: 0, paddingTop: 1 },
  matchMeta: {
    color: 'rgba(168,176,200,0.76)',
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.08,
  },
  matchMetaBlock: { flex: 1, minWidth: 0 },
  matchName: {
    color: 'rgba(248,250,255,0.93)',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.20,
    lineHeight: 17,
  },
  matchNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 28,
  },
  matchSubtitle: {
    color: 'rgba(220,226,255,0.58)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.04,
    marginTop: 1,
  },
  matchTagsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    marginTop: 6,
    minWidth: 0,
  },
  miniStatusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 5,
    maxWidth: '100%',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  miniStatusText: { color: '#F0F3FF', fontSize: 12, fontWeight: '600' },
  modeChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.065)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 31,
    paddingHorizontal: 9,
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
    flexWrap: 'nowrap',
    gap: 8,
    marginTop: 18,
  },
  modeRail: {
    marginHorizontal: -18,
    marginTop: 12,
  },
  modeRailContent: {
    gap: 7,
    paddingHorizontal: 18,
  },
  modeLabel: { color: '#BAC3DA', fontSize: 10, fontWeight: '600' },
  modeLabelSelected: { color: 'rgba(255,255,255,0.90)', fontWeight: '700' },
  notificationButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    marginLeft: 10,
    overflow: 'hidden',
    shadowColor: '#FFFFFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 15,
    width: 52,
  },
  notificationDot: {
    backgroundColor: '#FF4F95',
    borderRadius: 99,
    height: 13,
    position: 'absolute',
    right: 8,
    top: 5,
    width: 13,
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
    borderRadius: 28,
    minWidth: 104,
    overflow: 'visible',
    position: 'relative',
    shadowColor: '#9E77FF',
    shadowOffset: { height: 0, width: 0 },
    elevation: 4,
    shadowOpacity: 0.14,
    shadowRadius: 13,
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
    borderColor: 'rgba(255,255,255,0.17)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    zIndex: 2,
    gap: 10,
    justifyContent: 'center',
    minHeight: 35,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.08,
    zIndex: 2,
  },
  readyActionRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.05)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 10,
  },
  readyBoard: {
    backgroundColor: 'rgba(7,10,23,0.52)',
    borderRadius: 31,
    minHeight: 236,
    overflow: 'hidden',
    zIndex: 2,
    padding: 17,
  },
  readyBoardBorder: {
    borderRadius: 28,
    marginTop: 18,
    overflow: 'visible',
    padding: 1,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { height: 12, width: 0 },
    elevation: 7,
    shadowOpacity: 0.18,
    shadowRadius: 28,
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.04,
    lineHeight: 15,
  },
  readyCopyBlock: { flex: 1, minWidth: 0 },
  readyDescription: {
    color: '#A8AFC6',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 3,
  },
  readyHeroImage: {
    bottom: 0,
    height: '100%',
    opacity: 0.52,
    position: 'absolute',
    right: -14,
    top: 0,
    width: '74%',
  },
  root: { backgroundColor: '#02040B', flex: 1 },
  safe: { flex: 1 },
  scrollContent: {
    paddingBottom: 196,
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: 21,
    borderWidth: 1,
    height: 37,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    width: 37,
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
    color: '#B179FF',
    fontSize: 13,
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
    color: 'rgba(248,250,255,0.92)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.22,
    marginTop: 5,
  },
  softTag: {
    borderRadius: 11,
    borderWidth: 1,
    flexShrink: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  softTagText: { fontSize: 9, fontWeight: '700', letterSpacing: -0.02 },
  statusDot: {
    backgroundColor: '#5DFFB3',
    borderRadius: 99,
    height: 11,
    width: 11,
  },
  statusLabel: { fontSize: 11, fontWeight: '700', maxWidth: 72 },
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
    marginTop: 2,
  },
  unreadPillFloating: {
    alignItems: 'center',
    borderBottomLeftRadius: 15,
    borderColor: 'rgba(255,255,255,0.14)',
    borderTopRightRadius: 27,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    minWidth: 26,
    overflow: 'hidden',
    paddingHorizontal: 8,
    position: 'absolute',
    right: -1,
    top: -1,
    zIndex: 4,
  },
  unreadPillSheen: {
    bottom: 0,
    left: 0,
    opacity: 0.42,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  unreadText: { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '700' },
  userName: {
    color: '#F7F8FF',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.36,
    lineHeight: 30,
    marginTop: 0,
  },
});
