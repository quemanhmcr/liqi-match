import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
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
  return <RNText maxFontSizeMultiplier={1.08} {...props} />;
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

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#040613', '#080B1F', '#050713']}
        locations={[0, 0.46, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, styles.orbPurple]} />
      <View style={[styles.orb, styles.orbCyan]} />
      <View style={[styles.orb, styles.orbOrange]} />

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
              style={({ pressed }) => [
                styles.notificationButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                color="#F7F8FF"
                name="notifications-outline"
                size={22}
              />
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
            <View style={styles.readyBoard}>
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
                      onPress={() => setSelectedModeId(mode.id)}
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
                  onPress={() => setReadyEnabled((value) => !value)}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    readyEnabled && styles.primaryActionActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <HomeText style={styles.primaryActionText}>
                    {readyEnabled ? 'Đang bật' : 'Bật ngay'}
                  </HomeText>
                  <Ionicons color="#10131F" name="arrow-forward" size={18} />
                </Pressable>
              </View>
            </View>
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
      style={({ pressed }) => [styles.matchCard, pressed && styles.pressed]}
    >
      <View style={styles.matchCardTop}>
        <Avatar name={set.name} size={48} uri={set.avatarUrl} />
        <View style={styles.matchMainInfo}>
          <View style={styles.matchNameRow}>
            <HomeText numberOfLines={1} style={styles.matchName}>
              {set.name}
            </HomeText>
            {set.unreadCount ? (
              <View style={styles.unreadPill}>
                <HomeText style={styles.unreadText}>{set.unreadCount}</HomeText>
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
            <HomeText style={[styles.statusLabel, { color: statusStyle.text }]}>
              {set.statusLabel}
            </HomeText>
          </View>
          <HomeText numberOfLines={1} style={styles.matchMeta}>
            {set.meta}
          </HomeText>
        </View>

        <View style={styles.cardActions}>
          <Pressable accessibilityRole="button" style={styles.secondaryAction}>
            <Ionicons color="#DDE6FF" name="chatbubble-outline" size={16} />
            <HomeText style={styles.secondaryActionText}>Nhắn</HomeText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.cardPrimaryAction}
          >
            <HomeText style={styles.cardPrimaryActionText}>
              {set.actionLabel}
            </HomeText>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function EmptyMatchedSets() {
  return (
    <View style={styles.emptyCard}>
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
    </View>
  );
}

function FloatingTabs() {
  return (
    <View style={styles.tabsShell}>
      {tabs.map((tab) => {
        const active = tab.key === 'home';
        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={tab.key}
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
    </View>
  );
}

function Avatar({
  name,
  size,
  uri,
}: {
  name: string;
  size: number;
  uri?: string;
}) {
  const initials = getInitials(name);

  return (
    <LinearGradient
      colors={['rgba(198,121,255,0.95)', 'rgba(100,230,255,0.85)']}
      style={[
        styles.avatarRing,
        { borderRadius: size / 2, height: size, width: size },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
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
  scrollContent: {
    paddingBottom: 172,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  orb: {
    borderRadius: 999,
    opacity: 0.2,
    position: 'absolute',
  },
  orbPurple: {
    backgroundColor: '#8B46FF',
    height: 260,
    left: -150,
    top: 128,
    width: 260,
  },
  orbCyan: {
    backgroundColor: '#28D7FF',
    height: 210,
    right: -146,
    top: 342,
    width: 210,
  },
  orbOrange: {
    backgroundColor: '#FF8A3D',
    bottom: 210,
    height: 210,
    left: 22,
    opacity: 0.16,
    width: 210,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  identityRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minWidth: 0,
  },
  greetingBlock: { flex: 1 },
  greeting: { color: '#9EA8C5', fontSize: 14, fontWeight: '700' },
  userName: {
    color: '#F7F8FF',
    fontSize: 27,
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
    backgroundColor: 'rgba(255,255,255,0.11)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 23,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    marginLeft: 12,
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
    borderRadius: 34,
    marginTop: 22,
    padding: 1,
  },
  readyBoard: {
    backgroundColor: 'rgba(11,15,32,0.88)',
    borderRadius: 33,
    overflow: 'hidden',
    padding: 18,
  },
  boardGlow: {
    backgroundColor: 'rgba(198,121,255,0.12)',
    borderRadius: 999,
    height: 190,
    position: 'absolute',
    right: -94,
    top: -76,
    width: 190,
  },
  boardHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  boardTitleBlock: { flex: 1, minWidth: 0, paddingRight: 4 },
  eyebrow: {
    color: '#C679FF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  boardTitle: {
    color: '#F7F8FF',
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 35,
    marginTop: 6,
  },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 7,
    marginTop: 2,
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 7,
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
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 10,
    maxWidth: 316,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 17,
  },
  modeChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modeChipSelected: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  modeAccent: { borderRadius: 99, height: 8, width: 8 },
  modeLabel: { color: '#A8AFC6', fontSize: 13, fontWeight: '900' },
  modeLabelSelected: { color: '#F7F8FF' },
  readyActionRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(255,255,255,0.1)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    paddingTop: 16,
  },
  readyCopyBlock: { flex: 1 },
  readyCopy: { color: '#F7F8FF', fontSize: 15, fontWeight: '900' },
  readyDescription: {
    color: '#A8AFC6',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: '#F7F8FF',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minWidth: 128,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  primaryActionActive: { backgroundColor: '#5DFFB3' },
  primaryActionText: { color: '#10131F', fontSize: 14, fontWeight: '900' },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 28,
  },
  sectionEyebrow: {
    color: '#697089',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  sectionTitle: {
    color: '#F7F8FF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 3,
  },
  matchList: { gap: 12, marginTop: 14 },
  matchCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 28,
    borderWidth: 1,
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
    backgroundColor: '#F7F8FF',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  cardPrimaryActionText: {
    color: '#10131F',
    fontSize: 12,
    fontWeight: '900',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 28,
    borderWidth: 1,
    marginTop: 14,
    padding: 22,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(198,121,255,0.14)',
    borderRadius: 999,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  emptyTitle: {
    color: '#F7F8FF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },
  emptyBody: {
    color: '#A8AFC6',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  tabsShell: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(13,17,34,0.88)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 18,
    flexDirection: 'row',
    gap: 3,
    left: 14,
    padding: 5,
    position: 'absolute',
    right: 14,
  },
  tabItem: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 11,
  },
  tabItemActive: { backgroundColor: '#F7F8FF' },
  tabLabel: { color: '#A8AFC6', fontSize: 11, fontWeight: '900' },
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
