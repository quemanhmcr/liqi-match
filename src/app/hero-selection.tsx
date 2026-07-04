import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Keyboard,
  type ListRenderItemInfo,
  Modal,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  HEROES,
  HERO_ROLES,
  type Hero,
  type HeroRole,
} from '@/features/onboarding/hero-selection-data';

const MAX_SELECTED = 3;
const DEFAULT_SELECTED = ['edras', 'goverra', 'heino'];
const ROSTER_COLUMNS_BREAKPOINT = 390;

const colors = {
  bg: '#050713',
  card: '#0E1327',
  border: 'rgba(151,166,214,0.14)',
  text: '#F7F8FF',
  textMuted: '#9299AF',
  textSoft: '#BEC4D8',
  violet: '#B44CFF',
} as const;

const roleColors: Record<Exclude<HeroRole, 'Tất cả'>, string> = {
  'Đấu sĩ': '#FF9C4A',
  'Đỡ đòn': '#FFD35A',
  'Pháp sư': '#51D1FF',
  'Sát thủ': '#C96FFF',
  'Trợ thủ': '#55E19A',
  'Xạ thủ': '#FF7EA5',
};

const roleIcon: Record<
  Exclude<HeroRole, 'Tất cả'>,
  keyof typeof MaterialCommunityIcons.glyphMap
> = {
  'Đấu sĩ': 'sword-cross',
  'Đỡ đòn': 'shield-outline',
  'Pháp sư': 'magic-staff',
  'Sát thủ': 'knife-military',
  'Trợ thủ': 'account-heart-outline',
  'Xạ thủ': 'bow-arrow',
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function Glow({
  children,
  intensity = 'soft',
}: {
  children: ReactNode;
  intensity?: 'soft' | 'strong';
}) {
  return (
    <View
      style={[styles.glowWrap, intensity === 'strong' && styles.glowStrong]}
    >
      {children}
    </View>
  );
}

function RoleBadge({
  compact = false,
  role,
}: {
  compact?: boolean;
  role: Exclude<HeroRole, 'Tất cả'>;
}) {
  const color = roleColors[role];

  return (
    <View style={[styles.roleBadge, compact && styles.roleBadgeCompact]}>
      <MaterialCommunityIcons
        color={color}
        name={roleIcon[role]}
        size={compact ? 11 : 13}
      />
      {!compact ? (
        <Text style={[styles.roleText, { color }]}>{role}</Text>
      ) : null}
    </View>
  );
}

function HeadingLabel({ children }: { children: ReactNode }) {
  return (
    <View style={styles.headingLabel}>
      <LinearGradient
        colors={['#C348FF', '#5E66FF', '#25A9FF']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.headingRail}
      />
      <Text style={styles.sectionHeading}>{children}</Text>
    </View>
  );
}

const HeroCard = memo(function HeroCard({
  hero,
  onPress,
  selected,
  width,
}: {
  hero: Hero;
  onPress: (hero: Hero) => void;
  selected: boolean;
  width: number;
}) {
  const body = (
    <Pressable
      accessibilityLabel={`${selected ? 'Bỏ chọn' : 'Chọn'} ${hero.name}, ${hero.role}`}
      accessibilityRole="button"
      onPress={() => onPress(hero)}
      style={({ pressed }) => [
        styles.heroCard,
        { width },
        selected && styles.heroCardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.heroImageWrap}>
        <Image
          resizeMode="cover"
          source={hero.image}
          style={styles.heroImage}
        />
        <View style={styles.heroImageShade} />
        <View
          style={[styles.roleDot, { backgroundColor: roleColors[hero.role] }]}
        />
        <View
          style={[styles.cardAction, selected && styles.cardActionSelected]}
        >
          <Ionicons
            color={selected ? '#07101F' : '#F7F8FF'}
            name={selected ? 'checkmark' : 'add'}
            size={15}
          />
        </View>
      </View>
      <Text numberOfLines={1} style={styles.heroName}>
        {hero.name}
      </Text>
      <RoleBadge role={hero.role} />
    </Pressable>
  );

  return selected ? <Glow intensity="strong">{body}</Glow> : body;
});

function SelectedHeroCard({
  hero,
  onRemove,
  width,
}: {
  hero: Hero;
  onRemove: (hero: Hero) => void;
  width: number;
}) {
  return (
    <Glow>
      <View style={[styles.selectedCard, { width }]}>
        <View style={styles.selectedImageRing}>
          <Image
            resizeMode="cover"
            source={hero.image}
            style={styles.heroImage}
          />
        </View>
        <Pressable
          accessibilityLabel={`Bỏ chọn ${hero.name}`}
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => onRemove(hero)}
          style={styles.removeButton}
        >
          <Ionicons color="#EAF0FF" name="close" size={18} />
        </Pressable>
        <Text numberOfLines={1} style={styles.selectedName}>
          {hero.name}
        </Text>
        <RoleBadge role={hero.role} />
        <View
          style={[
            styles.selectedBottomGlow,
            { backgroundColor: roleColors[hero.role] },
          ]}
        />
      </View>
    </Glow>
  );
}

function CompactSelectionBar({
  onClear,
  onRemove,
  selectedHeroes,
  style,
}: {
  onClear: () => void;
  onRemove: (hero: Hero) => void;
  selectedHeroes: Hero[];
  style: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.compactSelectionBar, style]}>
      <View style={styles.compactSlots}>
        {selectedHeroes.map((hero) => (
          <Pressable
            accessibilityLabel={`Bỏ chọn ${hero.name}`}
            accessibilityRole="button"
            hitSlop={8}
            key={hero.id}
            onPress={() => onRemove(hero)}
            style={styles.compactAvatarWrap}
          >
            <Image source={hero.image} style={styles.compactAvatar} />
            <View style={styles.compactRemove}>
              <Ionicons color="#FFFFFF" name="close" size={11} />
            </View>
          </Pressable>
        ))}
        {Array.from({ length: MAX_SELECTED - selectedHeroes.length }).map(
          (_, index) => (
            <View key={`compact-empty-${index}`} style={styles.compactEmpty}>
              <Ionicons color="#858DA6" name="add" size={18} />
            </View>
          ),
        )}
      </View>
      <Text style={styles.compactCount}>{selectedHeroes.length}/3</Text>
      {selectedHeroes.length > 0 ? (
        <Pressable
          accessibilityLabel="Xóa tất cả"
          accessibilityRole="button"
          onPress={onClear}
        >
          <Text style={styles.compactClear}>Xóa</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReplacementSheet({
  candidate,
  onCancel,
  onReplace,
  selectedHeroes,
}: {
  candidate: Hero | null;
  onCancel: () => void;
  onReplace: (hero: Hero) => void;
  selectedHeroes: Hero[];
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={Boolean(candidate)}
    >
      <Pressable
        accessibilityLabel="Hủy thay tướng"
        onPress={onCancel}
        style={styles.sheetScrim}
      >
        <Pressable
          style={styles.sheet}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>
            Thay tướng nào bằng{' '}
            <Text style={styles.sheetAccent}>{candidate?.name}</Text>?
          </Text>
          <View style={styles.sheetOptions}>
            {selectedHeroes.map((hero) => (
              <Pressable
                accessibilityLabel={`Thay ${hero.name} bằng ${candidate?.name}`}
                accessibilityRole="button"
                key={hero.id}
                onPress={() => onReplace(hero)}
                style={({ pressed }) => [
                  styles.sheetOption,
                  pressed && styles.pressed,
                ]}
              >
                <Image source={hero.image} style={styles.sheetAvatar} />
                <Text numberOfLines={1} style={styles.sheetName}>
                  {hero.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityLabel="Hủy"
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.sheetCancel}
          >
            <Text style={styles.sheetCancelText}>Hủy</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function HeroSelectionScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [selectedIds, setSelectedIds] = useState<string[]>(DEFAULT_SELECTED);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<HeroRole>('Tất cả');
  const [notice, setNotice] = useState('');
  const [pendingReplacement, setPendingReplacement] = useState<Hero | null>(
    null,
  );
  const [showCompactSelection, setShowCompactSelection] = useState(false);

  const pageWidth = Math.min(width, 430);
  const pagePadding = width < 380 ? 14 : 18;
  const gridGap = width < 380 ? 8 : 10;
  const columnCount = pageWidth < ROSTER_COLUMNS_BREAKPOINT ? 3 : 4;
  const cardWidth = Math.floor(
    (pageWidth - pagePadding * 2 - gridGap * (columnCount - 1)) / columnCount,
  );
  const selectedGap = width < 380 ? 9 : 12;
  const selectedWidth = Math.floor(
    (pageWidth - pagePadding * 2 - selectedGap * 2) / 3,
  );

  const selectedHeroes = useMemo(
    () =>
      selectedIds
        .map((id) => HEROES.find((hero) => hero.id === id))
        .filter(Boolean) as Hero[],
    [selectedIds],
  );

  const filteredHeroes = useMemo(() => {
    const normalizedQuery = normalize(query);

    return HEROES.filter((hero) => {
      const roleMatches = role === 'Tất cả' || hero.role === role;
      const queryMatches =
        !normalizedQuery || normalize(hero.name).includes(normalizedQuery);

      return roleMatches && queryMatches && !selectedIds.includes(hero.id);
    });
  }, [query, role, selectedIds]);

  const selectHero = useCallback(
    (hero: Hero) => {
      if (selectedIds.includes(hero.id)) {
        setNotice('');
        setSelectedIds((current) => current.filter((id) => id !== hero.id));
        return;
      }

      if (selectedIds.length >= MAX_SELECTED) {
        setPendingReplacement(hero);
        setNotice('');
        return;
      }

      setNotice('');
      setSelectedIds((current) => [...current, hero.id]);
    },
    [selectedIds],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setNotice('');
  }, []);

  const removeHero = useCallback((hero: Hero) => {
    setSelectedIds((current) => current.filter((id) => id !== hero.id));
    setNotice('');
  }, []);

  const replaceHero = useCallback(
    (slotHero: Hero) => {
      if (!pendingReplacement) return;

      setSelectedIds((current) =>
        current.map((id) => (id === slotHero.id ? pendingReplacement.id : id)),
      );
      setPendingReplacement(null);
      setNotice('');
    },
    [pendingReplacement],
  );

  const submit = () => {
    if (selectedIds.length !== MAX_SELECTED) return;
    router.push('/habits' as never);
  };

  const renderHero = useCallback(
    ({ index, item }: ListRenderItemInfo<Hero>) => (
      <View
        style={{
          marginBottom: gridGap,
          marginRight: index % columnCount === columnCount - 1 ? 0 : gridGap,
        }}
      >
        <HeroCard
          hero={item}
          onPress={selectHero}
          selected={selectedIds.includes(item.id)}
          width={cardWidth}
        />
      </View>
    ),
    [cardWidth, columnCount, gridGap, selectHero, selectedIds],
  );

  const ListHeader = (
    <View>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Quay lại"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.roundButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons color={colors.textSoft} name="chevron-back" size={25} />
        </Pressable>

        <Text style={styles.logo}>
          <Text style={styles.logoAccent}>Liqi</Text> Match
        </Text>

        <View style={styles.progressWrap}>
          <Text style={styles.progressLabel}>Bước</Text>
          <Text style={styles.progressText}>3/5</Text>
          <LinearGradient
            colors={['#C348FF', '#6557FF']}
            end={{ x: 1, y: 0 }}
            start={{ x: 0, y: 0 }}
            style={styles.progressLine}
          />
        </View>
      </View>

      <View style={styles.titleWrap}>
        <View style={styles.titleLine}>
          <Text style={styles.title}>Chọn</Text>
          <LinearGradient
            colors={['#C84BFF', '#7E55FF', '#2D87FF']}
            end={{ x: 1, y: 0.5 }}
            start={{ x: 0, y: 0.5 }}
            style={styles.titleBadge}
          >
            <Text style={styles.titleBadgeText}>3 tướng tủ</Text>
          </LinearGradient>
        </View>
        <View style={styles.titleUnderlineShell}>
          <LinearGradient
            colors={[
              'rgba(200,75,255,0)',
              'rgba(200,75,255,0.72)',
              'rgba(45,135,255,0)',
            ]}
            end={{ x: 1, y: 0 }}
            start={{ x: 0, y: 0 }}
            style={styles.titleUnderline}
          />
        </View>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>
            Chọn 3 tướng bạn chơi tự tin nhất{'\n'}để hệ thống ghép đội chính
            xác hơn.
          </Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons color={colors.textMuted} name="search-outline" size={24} />
          <TextInput
            autoCorrect={false}
            onChangeText={setQuery}
            onSubmitEditing={Keyboard.dismiss}
            placeholder="Tìm theo tên tướng"
            placeholderTextColor="#747C95"
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
          {query ? (
            <Pressable
              accessibilityLabel="Xóa tìm kiếm"
              accessibilityRole="button"
              onPress={() => setQuery('')}
            >
              <Ionicons color="#747C95" name="close-circle" size={19} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        contentContainerStyle={styles.roleList}
        data={HERO_ROLES}
        horizontal
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          const active = item === role;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setRole(item)}
              style={[styles.roleChip, active && styles.roleChipActive]}
            >
              {active ? (
                <LinearGradient
                  colors={['rgba(179,68,255,0.36)', 'rgba(91,86,255,0.18)']}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <Text
                style={[
                  styles.roleChipText,
                  active && styles.roleChipTextActive,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          );
        }}
        showsHorizontalScrollIndicator={false}
      />

      <View style={styles.sectionHeadingRow}>
        <HeadingLabel>
          <Text style={styles.selectionCount}>{selectedIds.length}</Text> tướng
          đã chọn
        </HeadingLabel>
        {selectedIds.length > 0 ? (
          <Pressable
            accessibilityLabel="Xóa tất cả"
            accessibilityRole="button"
            onPress={clearSelection}
          >
            <Text style={styles.clearText}>Xóa tất cả</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.selectedRow, { columnGap: selectedGap }]}>
        {selectedHeroes.map((hero) => (
          <SelectedHeroCard
            hero={hero}
            key={hero.id}
            onRemove={removeHero}
            width={selectedWidth}
          />
        ))}
        {Array.from({ length: MAX_SELECTED - selectedHeroes.length }).map(
          (_, index) => (
            <View
              key={`empty-${index}`}
              style={[styles.emptySelected, { width: selectedWidth }]}
            >
              <Ionicons color="#69718A" name="add" size={25} />
              <Text style={styles.emptyText}>Thêm tướng</Text>
            </View>
          ),
        )}
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={styles.listTitleRow}>
        <HeadingLabel>
          {query
            ? `Kết quả (${filteredHeroes.length})`
            : role === 'Tất cả'
              ? 'Danh sách tướng'
              : `Tướng ${role}`}
        </HeadingLabel>
        <Text style={styles.totalText}>{HEROES.length} tướng</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#090B1A', '#050713', '#050713']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowTop} />
      <View style={styles.glowLeft} />
      <View style={styles.glowRight} />

      <FlatList
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons color="#737B95" name="search-outline" size={32} />
            <Text style={styles.emptyStateTitle}>Không tìm thấy tướng</Text>
            <Text style={styles.emptyStateText}>
              Thử tên khác hoặc đổi bộ lọc vai trò.
            </Text>
            <Pressable
              accessibilityLabel="Xóa bộ lọc"
              accessibilityRole="button"
              onPress={() => {
                setQuery('');
                setRole('Tất cả');
              }}
              style={styles.emptyAction}
            >
              <Text style={styles.emptyActionText}>Xóa bộ lọc</Text>
            </Pressable>
          </View>
        }
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 132,
          paddingHorizontal: pagePadding,
          paddingTop: insets.top + 5,
        }}
        data={filteredHeroes}
        initialNumToRender={24}
        keyboardShouldPersistTaps="handled"
        key={columnCount}
        keyExtractor={(item) => item.id}
        maxToRenderPerBatch={24}
        numColumns={columnCount}
        onScroll={(event) => {
          const shouldShow = event.nativeEvent.contentOffset.y > 330;
          if (shouldShow !== showCompactSelection) {
            setShowCompactSelection(shouldShow);
          }
        }}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={renderHero}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        style={[styles.list, { width: pageWidth }]}
        windowSize={7}
      />

      {showCompactSelection ? (
        <CompactSelectionBar
          onClear={clearSelection}
          onRemove={removeHero}
          selectedHeroes={selectedHeroes}
          style={{
            top: insets.top + 8,
            width: pageWidth - pagePadding * 2,
          }}
        />
      ) : null}

      <LinearGradient
        colors={['rgba(5,7,19,0)', 'rgba(5,7,19,0.96)', '#050713']}
        locations={[0, 0.28, 0.56]}
        pointerEvents="box-none"
        style={[
          styles.bottomDock,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <Pressable
          accessibilityLabel={
            selectedIds.length === MAX_SELECTED
              ? 'Tiếp tục'
              : `Cần chọn thêm ${MAX_SELECTED - selectedIds.length} tướng`
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: selectedIds.length !== MAX_SELECTED }}
          disabled={selectedIds.length !== MAX_SELECTED}
          onPress={submit}
          style={({ pressed }) => [
            styles.ctaOuter,
            pressed && selectedIds.length === MAX_SELECTED && styles.ctaPressed,
          ]}
        >
          <LinearGradient
            colors={
              selectedIds.length === MAX_SELECTED
                ? ['#B846FF', '#2F72FF']
                : ['rgba(126,75,255,0.32)', 'rgba(35,66,145,0.24)']
            }
            end={{ x: 1, y: 0.5 }}
            start={{ x: 0, y: 0.5 }}
            style={styles.cta}
          >
            <Text
              style={[
                styles.ctaText,
                selectedIds.length !== MAX_SELECTED && styles.ctaTextDisabled,
              ]}
            >
              {selectedIds.length === MAX_SELECTED
                ? 'Tiếp tục'
                : `Chọn thêm ${MAX_SELECTED - selectedIds.length} tướng`}
            </Text>
            <View style={styles.ctaArrow}>
              <Ionicons color="#4D4AF1" name="arrow-forward" size={20} />
            </View>
          </LinearGradient>
        </Pressable>
        <Text style={styles.footerHint}>
          ⓘ Bạn có thể đổi lại tướng tủ trong hồ sơ sau.
        </Text>
      </LinearGradient>

      <ReplacementSheet
        candidate={pendingReplacement}
        onCancel={() => setPendingReplacement(null)}
        onReplace={replaceHero}
        selectedHeroes={selectedHeroes}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: colors.bg,
    flex: 1,
  },
  list: {
    flex: 1,
  },
  glowTop: {
    alignSelf: 'center',
    backgroundColor: '#28206F',
    borderRadius: 180,
    height: 240,
    opacity: 0.09,
    position: 'absolute',
    top: -120,
    transform: [{ scaleX: 1.7 }],
    width: 340,
  },
  glowLeft: {
    backgroundColor: '#6B28E6',
    borderRadius: 240,
    height: 520,
    left: -190,
    opacity: 0.05,
    position: 'absolute',
    top: 430,
    width: 310,
  },
  glowRight: {
    backgroundColor: '#1759FA',
    borderRadius: 260,
    bottom: 170,
    height: 500,
    opacity: 0.045,
    position: 'absolute',
    right: -210,
    width: 330,
  },
  glowWrap: {
    elevation: 4,
    shadowColor: '#9B4DFF',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  glowStrong: {
    elevation: 8,
    shadowOpacity: 0.34,
    shadowRadius: 16,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 55,
  },
  roundButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(18,24,43,0.78)',
    borderColor: 'rgba(255,255,255,0.045)',
    borderRadius: 23,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.975 }],
  },
  logo: {
    color: colors.text,
    fontSize: 25,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(142,66,255,0.38)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 8,
  },
  logoAccent: {
    color: '#C06BFF',
  },
  progressWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,22,42,0.84)',
    borderColor: 'rgba(255,255,255,0.055)',
    borderRadius: 22,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 64,
  },
  progressLabel: {
    color: '#838BA3',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  progressText: {
    color: '#D28CFF',
    fontSize: 14,
    fontWeight: '800',
  },
  progressLine: {
    borderRadius: 9,
    bottom: 6,
    height: 2.5,
    position: 'absolute',
    width: 24,
  },
  titleWrap: {
    alignItems: 'center',
    paddingBottom: 22,
    paddingTop: 28,
  },
  titleLine: {
    alignItems: 'center',
    columnGap: 10,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 38,
  },
  titleBadge: {
    borderColor: 'rgba(234,220,255,0.30)',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 4,
    shadowColor: '#7E55FF',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
  },
  titleBadgeText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  titleUnderlineShell: {
    height: 8,
    justifyContent: 'center',
    marginTop: 8,
    width: 220,
  },
  titleUnderline: {
    borderRadius: 999,
    height: 2,
    width: '100%',
  },
  subtitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 13,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
  },
  spark: {
    color: colors.violet,
    fontSize: 18,
  },
  searchRow: {
    alignItems: 'center',
    columnGap: 10,
    flexDirection: 'row',
    marginBottom: 12,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#0C1123',
    borderColor: 'rgba(137,153,202,0.13)',
    borderRadius: 20,
    borderWidth: 1,
    columnGap: 10,
    flex: 1,
    flexDirection: 'row',
    height: 54,
    paddingHorizontal: 15,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    height: '100%',
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: '#0E1327',
    borderColor: 'rgba(137,153,202,0.15)',
    borderRadius: 19,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  roleList: {
    columnGap: 8,
    paddingBottom: 19,
  },
  roleChip: {
    alignItems: 'center',
    backgroundColor: '#0F1426',
    borderColor: 'rgba(151,166,214,0.12)',
    borderRadius: 13,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    minWidth: 63,
    overflow: 'hidden',
    paddingHorizontal: 15,
  },
  roleChipActive: {
    borderColor: '#B954FF',
    elevation: 2,
    shadowColor: '#AC46FF',
    shadowOpacity: 0.16,
    shadowRadius: 5,
  },
  roleChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  roleChipTextActive: {
    color: '#F2E8FF',
  },
  sectionHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 13,
  },
  sectionHeading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  headingLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 0,
  },
  headingRail: {
    borderRadius: 999,
    height: 20,
    marginRight: 9,
    width: 4,
  },
  selectionCount: {
    color: '#B465FF',
  },
  clearText: {
    color: '#989FB6',
    fontSize: 12,
    fontWeight: '600',
  },
  selectedRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    marginBottom: 23,
  },
  selectedCard: {
    alignItems: 'center',
    backgroundColor: '#12122B',
    borderColor: 'rgba(183,99,255,0.75)',
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 154,
    overflow: 'hidden',
    padding: 9,
  },
  selectedImageRing: {
    aspectRatio: 1,
    backgroundColor: '#090B18',
    borderColor: '#B258FF',
    borderRadius: 999,
    borderWidth: 1.8,
    overflow: 'hidden',
    width: '100%',
  },
  removeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,11,24,0.92)',
    borderColor: 'rgba(255,255,255,0.20)',
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 34,
  },
  selectedName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
    marginTop: 9,
  },
  selectedBottomGlow: {
    borderRadius: 20,
    bottom: -9,
    height: 14,
    opacity: 0.23,
    position: 'absolute',
    width: 70,
  },
  emptySelected: {
    alignItems: 'center',
    backgroundColor: 'rgba(12,16,32,0.55)',
    borderColor: 'rgba(151,166,214,0.24)',
    borderRadius: 19,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 154,
    rowGap: 7,
  },
  emptyText: {
    color: '#8B94AD',
    fontSize: 12,
    fontWeight: '600',
  },
  notice: {
    color: '#C9A8FF',
    fontSize: 12,
    marginBottom: 18,
    marginTop: -13,
    textAlign: 'center',
  },
  listTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  totalText: {
    color: '#707891',
    fontSize: 12,
    fontWeight: '600',
  },
  heroCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 142,
    padding: 7,
  },
  heroCardSelected: {
    backgroundColor: 'rgba(19,18,44,0.94)',
    borderColor: 'rgba(180,76,255,0.82)',
  },
  heroImageWrap: {
    aspectRatio: 1,
    backgroundColor: '#080B18',
    borderColor: 'rgba(189,109,255,0.40)',
    borderRadius: 999,
    borderWidth: 1.5,
    overflow: 'hidden',
    width: '100%',
  },
  heroImage: {
    height: '100%',
    width: '100%',
  },
  heroImageShade: {
    backgroundColor: 'rgba(3,5,15,0.06)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  roleDot: {
    borderRadius: 99,
    bottom: 6,
    height: 7,
    left: 6,
    position: 'absolute',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    width: 7,
  },
  cardAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,22,43,0.95)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 13,
    borderWidth: 1,
    height: 25,
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
    top: 2,
    width: 25,
  },
  cardActionSelected: {
    backgroundColor: '#8E5BFF',
    borderColor: '#B28BFF',
  },
  heroName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
    marginTop: 8,
  },
  roleBadge: {
    alignItems: 'center',
    columnGap: 5,
    flexDirection: 'row',
  },
  roleBadgeCompact: {
    columnGap: 0,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 54,
  },
  emptyStateTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyStateText: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 5,
  },
  emptyAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(149,83,255,0.14)',
    borderColor: 'rgba(177,112,255,0.26)',
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
  },
  emptyActionText: {
    color: '#C7A4FF',
    fontSize: 13,
    fontWeight: '700',
  },
  compactSelectionBar: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(10,14,30,0.94)',
    borderColor: 'rgba(151,166,214,0.16)',
    borderRadius: 24,
    borderWidth: 1,
    elevation: 9,
    flexDirection: 'row',
    height: 60,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 14,
    zIndex: 20,
  },
  compactSlots: {
    alignItems: 'center',
    columnGap: 8,
    flexDirection: 'row',
  },
  compactAvatarWrap: {
    borderColor: 'rgba(180,93,255,0.55)',
    borderRadius: 21,
    borderWidth: 1,
    height: 42,
    width: 42,
  },
  compactAvatar: {
    borderRadius: 20,
    height: '100%',
    width: '100%',
  },
  compactRemove: {
    alignItems: 'center',
    backgroundColor: 'rgba(9,12,25,0.92)',
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: -4,
    top: -4,
    width: 18,
  },
  compactEmpty: {
    alignItems: 'center',
    backgroundColor: 'rgba(18,24,43,0.84)',
    borderColor: 'rgba(151,166,214,0.20)',
    borderRadius: 21,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  compactCount: {
    color: '#E6E9F5',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 'auto',
    marginRight: 12,
  },
  compactClear: {
    color: '#A9B2CA',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomDock: {
    bottom: 0,
    left: 0,
    paddingHorizontal: 18,
    paddingTop: 46,
    position: 'absolute',
    right: 0,
  },
  ctaOuter: {
    borderRadius: 28,
    elevation: 8,
    shadowColor: '#744BFF',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.26,
    shadowRadius: 14,
  },
  ctaPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.987 }],
  },
  cta: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    height: 62,
    justifyContent: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  ctaTextDisabled: {
    color: '#C4CAE0',
    fontSize: 16,
  },
  ctaArrow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.83)',
    borderRadius: 18,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 20,
    width: 34,
  },
  footerHint: {
    color: '#747B91',
    fontSize: 11,
    marginTop: 9,
    textAlign: 'center',
  },
  sheetScrim: {
    backgroundColor: 'rgba(0,0,0,0.58)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0A0E1E',
    borderColor: 'rgba(151,166,214,0.16)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingBottom: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#3A415B',
    borderRadius: 2,
    height: 4,
    marginBottom: 18,
    width: 42,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    textAlign: 'center',
  },
  sheetAccent: {
    color: '#B978FF',
  },
  sheetOptions: {
    columnGap: 10,
    flexDirection: 'row',
    marginTop: 18,
  },
  sheetOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(18,24,43,0.82)',
    borderColor: 'rgba(151,166,214,0.14)',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    minHeight: 120,
    padding: 10,
  },
  sheetAvatar: {
    borderColor: 'rgba(184,102,255,0.50)',
    borderRadius: 30,
    borderWidth: 1,
    height: 60,
    width: 60,
  },
  sheetName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'center',
  },
  sheetCancel: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    marginTop: 12,
  },
  sheetCancelText: {
    color: '#A9B2CA',
    fontSize: 15,
    fontWeight: '700',
  },
});
