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
  type TextProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/shared/auth/auth-context';
import {
  buildPreviewHomeDashboard,
  fetchHomeDashboard,
  homeReadyModes,
  type HomeReadyMode,
  type MatchedSet,
  type MatchedSetStatus,
} from '@/features/home/home-dashboard-service';

const tabs = [
  { icon: 'home', key: 'home', label: 'Trang chủ' },
  { icon: 'sparkles-outline', key: 'discover', label: 'Khám phá' },
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
  setlv: 'flash-outline',
  soulmate: 'heart-outline',
  team: 'people-outline',
};

const kindIcons: Record<MatchedSet['kind'], keyof typeof Ionicons.glyphMap> = {
  Normal: 'shield-checkmark-outline',
  Rank: 'trophy-outline',
  'Set LV': 'flash-outline',
  'Team Rank': 'people-outline',
  'Tri kỉ': 'heart-outline',
};

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
  const selectedMode = useMemo(
    () =>
      homeReadyModes.find((mode) => mode.id === selectedModeId) ?? defaultMode,
    [selectedModeId],
  );
  const readyCopy = readyEnabled
    ? `Đang bật ${selectedMode.label}`
    : 'Bật sẵn sàng để các set thấy bạn';

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
        colors={['#040613', '#080B1F', '#050713']}
        locations={[0, 0.46, 1]}
        style={StyleSheet.absoluteFill}
      />
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
                uri={dashboard.currentProfile.avatarUrl}
              />
              <View style={styles.greetingBlock}>
                <HomeText style={styles.greeting}>Xin chào,</HomeText>
                <HomeText numberOfLines={1} style={styles.userName}>
                  {dashboard.currentProfile.displayName}
                </HomeText>
                <View style={styles.miniStatusPill}>
                  <View style={styles.statusDot} />
                  <HomeText numberOfLines={1} style={styles.miniStatusText}>
                    {dashboard.activeMatchCount
                      ? `${dashboard.activeMatchCount} set đã match`
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
              <BlurView intensity={24} style={styles.surfaceFill} tint="dark" />
              <Ionicons color="#F7F8FF" name="notifications" size={21} />
              <View style={styles.notificationDot} />
            </Pressable>
          </View>

          {dashboard.preview || dashboardQuery.isError ? (
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
            colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.readyBoardBorder}
          >
            <BlurView intensity={32} style={styles.readyBoard} tint="dark">
              <View style={styles.boardGlow} />
              <View style={styles.boardHeaderRow}>
                <View style={styles.boardTitleBlock}>
                  <HomeText style={styles.eyebrow}>LIQI LOBBY</HomeText>
                  <HomeText style={styles.boardTitle}>
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

              <HomeText style={styles.boardSubtitle}>
                Chọn mood chơi hôm nay để các tài khoản đã match biết bạn đang
                muốn vào set kiểu nào.
              </HomeText>

              <View style={styles.modeGrid}>
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
                        color={selected ? '#F7F8FF' : mode.accent}
                        name={modeIcons[mode.id]}
                        size={16}
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
              </View>

              <View style={styles.readyActionRow}>
                <View style={styles.readyCopyBlock}>
                  <HomeText style={styles.readyCopy}>{readyCopy}</HomeText>
                  <HomeText numberOfLines={1} style={styles.readyDescription}>
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
                  <LinearGradient
                    colors={
                      readyEnabled
                        ? ['#5DFFB3', '#64E6FF']
                        : ['#8A45FF', '#E06CFF']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryActionGradient}
                  >
                    <HomeText style={styles.primaryActionText}>
                      {readyEnabled ? 'Đang bật' : 'Bật ngay'}
                    </HomeText>
                    <Ionicons color="#FFFFFF" name="arrow-forward" size={18} />
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

          {dashboard.matchedSets.length ? (
            <View style={styles.matchList}>
              {dashboard.matchedSets.map((set) => (
                <MatchedSetCard key={set.id} set={set} />
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

function MatchedSetCard({ set }: { set: MatchedSet }) {
  const statusStyle = statusStyles[set.status];

  return (
    <Pressable
      accessibilityLabel={`${set.name}, ${set.kind}`}
      accessibilityRole="button"
      onPress={selectionImpact}
      style={({ pressed }) => [
        styles.matchCardFrame,
        pressed && styles.pressed,
      ]}
    >
      <BlurView intensity={24} style={styles.matchCard} tint="dark">
        <View style={styles.matchCardTop}>
          <Avatar name={set.name} size={48} uri={set.avatarUrl} />
          <View style={styles.matchMainInfo}>
            <View style={styles.matchNameRow}>
              <HomeText numberOfLines={1} style={styles.matchName}>
                {set.name}
              </HomeText>
              {set.unreadCount ? (
                <View style={styles.unreadPill}>
                  <HomeText style={styles.unreadText}>
                    {set.unreadCount}
                  </HomeText>
                </View>
              ) : null}
            </View>
            <HomeText numberOfLines={1} style={styles.matchSubtitle}>
              {set.subtitle || 'Đã match thành công'}
            </HomeText>
          </View>
          <View style={styles.kindPill}>
            <Ionicons color="#E8D4FF" name={kindIcons[set.kind]} size={14} />
            <HomeText style={styles.kindText}>{set.kind}</HomeText>
          </View>
        </View>

        <View style={styles.matchTagsRow}>
          {[...set.heroNames.slice(0, 3), ...set.roleNames.slice(0, 1)]
            .slice(0, 4)
            .map((label) => (
              <View key={label} style={styles.softTag}>
                <HomeText numberOfLines={1} style={styles.softTagText}>
                  {label}
                </HomeText>
              </View>
            ))}
        </View>

        <View style={styles.matchFooter}>
          <View style={styles.matchMetaBlock}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.cardStatusDot,
                  { backgroundColor: statusStyle.dot },
                ]}
              />
              <HomeText
                style={[styles.statusLabel, { color: statusStyle.text }]}
              >
                {set.statusLabel}
              </HomeText>
            </View>
            <HomeText numberOfLines={1} style={styles.matchMeta}>
              {set.meta}
            </HomeText>
          </View>

          <View style={styles.cardActions}>
            <Pressable
              accessibilityRole="button"
              onPress={selectionImpact}
              style={styles.secondaryAction}
            >
              <Ionicons color="#DDE6FF" name="chatbubble-outline" size={16} />
              <HomeText style={styles.secondaryActionText}>Nhắn</HomeText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={impactLight}
              style={styles.cardPrimaryAction}
            >
              <LinearGradient
                colors={cardActionGradient(set.kind)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardPrimaryActionGradient}
              >
                <HomeText style={styles.cardPrimaryActionText}>
                  {set.actionLabel}
                </HomeText>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </BlurView>
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
    <BlurView intensity={38} style={styles.tabsShell} tint="dark">
      {tabs.map((tab) => {
        const active = tab.key === 'home';
        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={tab.key}
            onPress={selectionImpact}
            style={[styles.tabItem, active && styles.tabItemActive]}
          >
            <Ionicons
              color={active ? '#10131F' : '#A8AFC6'}
              name={tab.icon}
              size={18}
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
  uri,
}: {
  fallbackUri?: string;
  name: string;
  size: number;
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

  return (
    <LinearGradient
      colors={['rgba(198,121,255,0.95)', 'rgba(100,230,255,0.85)']}
      style={[
        styles.avatarRing,
        { borderRadius: size / 2, height: size, width: size },
      ]}
    >
      {activeUri ? (
        <Image
          onError={() => setFailedUri(activeUri)}
          source={{ uri: activeUri }}
          style={{
            borderRadius: size / 2 - 2,
            height: size - 4,
            width: size - 4,
          }}
        />
      ) : (
        <View
          style={[
            styles.avatarFallback,
            {
              borderRadius: size / 2 - 2,
              height: size - 4,
              width: size - 4,
            },
          ]}
        >
          <HomeText style={styles.avatarInitials}>{initials}</HomeText>
        </View>
      )}
    </LinearGradient>
  );
}

function cardActionGradient(kind: MatchedSet['kind']): [string, string] {
  if (kind === 'Rank') return ['#15B7CE', '#64E6FF'];
  if (kind === 'Team Rank') return ['#FF8A3D', '#FFB86B'];
  return ['#8A45FF', '#D96CFF'];
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
  root: { backgroundColor: '#050713', flex: 1 },
  safe: { flex: 1 },
  surfaceFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  scrollContent: {
    paddingBottom: 212,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  identityRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minWidth: 0,
  },
  greetingBlock: { flex: 1 },
  greeting: { color: '#9EA8C5', fontSize: 13, fontWeight: '700' },
  userName: {
    color: '#F7F8FF',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: -1,
  },
  miniStatusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
    maxWidth: '100%',
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  statusDot: {
    backgroundColor: '#5DFFB3',
    borderRadius: 99,
    height: 7,
    width: 7,
  },
  miniStatusText: { color: '#DDE6FF', fontSize: 12, fontWeight: '800' },
  notificationButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 23,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    marginLeft: 12,
    overflow: 'hidden',
    width: 46,
  },
  notificationDot: {
    backgroundColor: '#FF7AD9',
    borderColor: '#090B18',
    borderRadius: 99,
    borderWidth: 2,
    height: 11,
    position: 'absolute',
    right: 10,
    top: 9,
    width: 11,
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
  readyBoardBorder: {
    borderRadius: 32,
    marginTop: 22,
    padding: 1,
  },
  readyBoard: {
    backgroundColor: 'rgba(11,15,32,0.9)',
    borderRadius: 31,
    overflow: 'hidden',
    padding: 18,
    paddingTop: 17,
  },
  boardGlow: {
    backgroundColor: 'rgba(198,121,255,0.09)',
    borderRadius: 999,
    height: 210,
    position: 'absolute',
    right: -132,
    top: -92,
    width: 210,
  },
  boardHeaderRow: {
    alignItems: 'flex-start',
    minHeight: 70,
    position: 'relative',
  },
  boardTitleBlock: { minWidth: 0, paddingRight: 0 },
  eyebrow: {
    color: '#C679FF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  boardTitle: {
    color: '#F7F8FF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.9,
    lineHeight: 32,
    marginTop: 5,
  },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  liveDot: {
    backgroundColor: '#697089',
    borderRadius: 99,
    height: 8,
    width: 8,
  },
  liveDotActive: { backgroundColor: '#5DFFB3' },
  liveText: { color: '#F7F8FF', fontSize: 12, fontWeight: '900' },
  boardSubtitle: {
    color: '#A8AFC6',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 6,
    maxWidth: 316,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 15,
  },
  modeChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  modeChipSelected: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  modeLabel: { color: '#A8AFC6', fontSize: 13, fontWeight: '900' },
  modeLabelSelected: { color: '#F7F8FF' },
  readyActionRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.1)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 15,
  },
  readyCopyBlock: { flex: 1 },
  readyCopy: {
    color: '#F7F8FF',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  readyDescription: {
    color: '#A8AFC6',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  primaryAction: {
    borderRadius: 999,
    minWidth: 118,
    overflow: 'hidden',
  },
  primaryActionActive: {},
  primaryActionGradient: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minWidth: 118,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  primaryActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 26,
  },
  sectionEyebrow: {
    color: '#697089',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  sectionTitle: {
    color: '#F7F8FF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 3,
  },
  matchList: { gap: 12, marginTop: 14 },
  matchCardFrame: { borderRadius: 28, overflow: 'hidden' },
  matchCard: {
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 14,
  },
  matchCardTop: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  matchMainInfo: { flex: 1, minWidth: 0 },
  matchNameRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  matchName: {
    color: '#F7F8FF',
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '900',
  },
  unreadPill: {
    alignItems: 'center',
    backgroundColor: '#FF7AD9',
    borderRadius: 999,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 6,
  },
  unreadText: { color: '#10131F', fontSize: 11, fontWeight: '900' },
  matchSubtitle: {
    color: '#A8AFC6',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  kindPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(198,121,255,0.16)',
    borderColor: 'rgba(198,121,255,0.32)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  kindText: { color: '#E8D4FF', fontSize: 11, fontWeight: '900' },
  matchTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 13,
  },
  softTag: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  softTagText: { color: '#DDE6FF', fontSize: 12, fontWeight: '800' },
  matchFooter: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 13,
    paddingTop: 13,
  },
  matchMetaBlock: { flex: 1, minWidth: 0 },
  statusRow: { alignItems: 'center', flexDirection: 'row' },
  cardStatusDot: { borderRadius: 99, height: 7, width: 7 },
  statusLabel: { fontSize: 12, fontWeight: '900' },
  matchMeta: {
    color: '#8D96B3',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  cardActions: { flexDirection: 'row', gap: 8 },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  secondaryActionText: { color: '#DDE6FF', fontSize: 12, fontWeight: '900' },
  cardPrimaryAction: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  cardPrimaryActionGradient: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  cardPrimaryActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  emptyCard: {
    alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 28,
    borderWidth: 1,
    marginTop: 14,
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
  emptyTitle: {
    color: '#F7F8FF',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyBody: {
    color: '#A8AFC6',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 7,
    textAlign: 'center',
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
  emptyPreviewAvatar: {
    backgroundColor: 'rgba(198,121,255,0.45)',
    borderRadius: 999,
    height: 34,
    width: 34,
  },
  emptyPreviewLines: { flex: 1, gap: 7 },
  emptyPreviewLine: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 999,
    height: 8,
  },
  emptyPreviewLineLong: { width: '78%' },
  emptyPreviewLineShort: { width: '46%' },
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
  tabsShell: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(13,17,34,0.9)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 14,
    flexDirection: 'row',
    gap: 2,
    left: 12,
    overflow: 'hidden',
    padding: 5,
    position: 'absolute',
    right: 12,
  },
  tabItem: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 10,
  },
  tabItemActive: { backgroundColor: '#F7F8FF' },
  tabLabel: { color: '#A8AFC6', fontSize: 10, fontWeight: '900' },
  tabLabelActive: { color: '#10131F' },
  avatarRing: { alignItems: 'center', justifyContent: 'center' },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(6,8,18,0.95)',
    justifyContent: 'center',
  },
  avatarInitials: { color: '#F7F8FF', fontSize: 16, fontWeight: '900' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
