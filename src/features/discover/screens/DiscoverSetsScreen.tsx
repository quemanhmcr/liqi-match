import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  useWindowDimensions,
  type TextProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiquidCard, LiquidGlassSurface } from '@/shared/components/liquid';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import { DiscoverSetCard } from '../components/DiscoverSetCard';
import {
  DiscoverQueryState,
  DiscoverStaleBanner,
} from '../components/DiscoverQueryState';
import type {
  DiscoverFilterChip,
  DiscoverFilterId,
  DiscoverSetSortId,
} from '../model/discover-domain';
import { useDiscoverStore } from '../model/discover-store';
import {
  useDiscoverOverviewQuery,
  useDiscoverSetsQuery,
} from '../queries/discover-queries';

type IconName = keyof typeof Ionicons.glyphMap;
type DiscoverTextProps = TextProps;

const setFilterIds = new Set<DiscoverFilterId>([
  'all',
  'rank',
  'team-rank',
  'mic',
  'non-toxic',
]);

const sortOptions: readonly {
  id: DiscoverSetSortId;
  label: string;
}[] = [
  { id: 'best-match', label: 'Phù hợp nhất' },
  { id: 'newest', label: 'Mới mở' },
  { id: 'almost-full', label: 'Sắp đủ người' },
] as const;

function DiscoverText(props: DiscoverTextProps) {
  return <RNText maxFontSizeMultiplier={1} {...props} />;
}

export function DiscoverSetsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const inheritedActiveFilterIds = useDiscoverStore(
    (state) => state.activeFilterIds,
  );
  const inheritedQuery = useDiscoverStore((state) => state.query);
  const [activeFilterIds, setActiveFilterIds] = useState<DiscoverFilterId[]>(
    () => [...inheritedActiveFilterIds],
  );
  const [query, setQuery] = useState(inheritedQuery);
  const [sortId, setSortId] = useState<DiscoverSetSortId>('best-match');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const compact = width < 390;
  const horizontalPadding = compact ? 15 : 20;
  const activeSetFilterIds = useMemo(
    () => activeFilterIds.filter((filterId) => setFilterIds.has(filterId)),
    [activeFilterIds],
  );
  const filterOptionsQuery = useDiscoverOverviewQuery({
    facetIds: [],
    previewLimit: 1,
    query: '',
  });
  const setFilterChips = (filterOptionsQuery.data?.filterChips ?? []).filter(
    (chip) => setFilterIds.has(chip.id),
  );
  const setsQuery = useDiscoverSetsQuery({
    facetIds: activeSetFilterIds.filter(
      (filterId): filterId is Exclude<DiscoverFilterId, 'all'> =>
        filterId !== 'all',
    ),
    limit: 50,
    query: deferredQuery,
    sort:
      sortId === 'almost-full'
        ? 'almost_full'
        : sortId === 'best-match'
          ? 'best_match'
          : 'newest',
  });
  const visibleSets = setsQuery.data?.items ?? [];
  const selectedSort = sortOptions.find((option) => option.id === sortId);
  const searchUpdating = deferredQuery !== query;
  const clearQuery = () => setQuery('');
  const resetCriteria = () => {
    setActiveFilterIds([]);
    setQuery('');
  };
  const toggleFilter = (filterId: DiscoverFilterId) => {
    if (filterId === 'all') {
      setActiveFilterIds([]);
      return;
    }
    if (!setFilterIds.has(filterId)) return;
    setActiveFilterIds((current) =>
      current.includes(filterId)
        ? current.filter((value) => value !== filterId)
        : [...current, filterId],
    );
  };
  if (!setsQuery.data || !filterOptionsQuery.data) {
    return (
      <DiscoverQueryState
        error={setsQuery.error ?? filterOptionsQuery.error}
        onRetry={() => {
          void setsQuery.refetch();
          void filterOptionsQuery.refetch();
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      {setsQuery.isError || filterOptionsQuery.isError ? (
        <DiscoverStaleBanner />
      ) : null}
      <SetsBackground />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom + 32, 44),
            paddingTop: Math.max(insets.top + 2, 18),
          },
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          horizontalPadding={horizontalPadding}
          onBack={() => router.back()}
        />

        <SearchField
          horizontalPadding={horizontalPadding}
          onChangeQuery={setQuery}
          onClear={clearQuery}
          query={query}
        />

        <SetFilterRow
          activeFilterIds={activeSetFilterIds}
          chips={setFilterChips}
          horizontalPadding={horizontalPadding}
          onToggle={toggleFilter}
        />

        <View
          style={[styles.summaryRow, { paddingHorizontal: horizontalPadding }]}
        >
          <DiscoverText style={styles.resultCount}>
            <DiscoverText style={styles.resultCountAccent}>
              {visibleSets.length}
            </DiscoverText>{' '}
            {searchUpdating ? 'đang cập nhật…' : 'set phù hợp'}
          </DiscoverText>

          <Pressable
            accessibilityLabel="Sắp xếp danh sách set"
            accessibilityRole="button"
            accessibilityState={{ expanded: sortMenuOpen }}
            onPress={() => setSortMenuOpen((open) => !open)}
            style={({ pressed }) => [
              styles.sortPillHost,
              pressed && styles.pressed,
            ]}
            testID="discover-sets-sort-toggle"
          >
            <LiquidGlassSurface
              contentStyle={styles.sortPillContent}
              glowIntensity="none"
              radius={16}
              style={styles.sortPill}
              surfaceBackground="rgba(17,22,44,0.72)"
              variant="button"
              withInnerReflection={false}
              withShadow={false}
            >
              <DiscoverText numberOfLines={1} style={styles.sortPillText}>
                {selectedSort?.label ?? 'Phù hợp nhất'}
              </DiscoverText>
              <Ionicons
                color="rgba(207,183,255,0.86)"
                name={sortMenuOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
              />
            </LiquidGlassSurface>
          </Pressable>
        </View>

        {sortMenuOpen ? (
          <SortMenu
            horizontalPadding={horizontalPadding}
            onSelect={(nextSortId) => {
              setSortId(nextSortId);
              setSortMenuOpen(false);
            }}
            selectedId={sortId}
          />
        ) : null}

        {visibleSets.length ? (
          <View
            style={[styles.list, { paddingHorizontal: horizontalPadding }]}
            testID="discover-sets-list"
          >
            {visibleSets.map((card) => (
              <DiscoverSetCard
                card={card}
                compact={compact}
                inset={false}
                key={card.id}
                presentation="list"
              />
            ))}
          </View>
        ) : (
          <SetsEmptyState
            horizontalPadding={horizontalPadding}
            onReset={() => {
              resetCriteria();
              setSortId('best-match');
              setSortMenuOpen(false);
            }}
          />
        )}
      </ScrollView>

      <LinearGradient
        colors={['rgba(3,7,17,0.98)', 'rgba(3,7,17,0.76)', 'rgba(3,7,17,0)']}
        pointerEvents="none"
        style={[styles.statusGuard, { height: Math.max(insets.top + 20, 52) }]}
      />
    </View>
  );
}

function PageHeader({
  horizontalPadding,
  onBack,
}: {
  horizontalPadding: number;
  onBack: () => void;
}) {
  return (
    <View
      style={[styles.header, { paddingHorizontal: horizontalPadding }]}
      testID="discover-sets-header"
    >
      <HeaderOrb
        accessibilityLabel="Quay lại Khám phá"
        icon="chevron-back"
        onPress={onBack}
      />
      <View style={styles.headerCopy}>
        <DiscoverText
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.headerTitle}
        >
          Set đang cần người
        </DiscoverText>
        <DiscoverText numberOfLines={2} style={styles.headerSubtitle}>
          Các set đang mở phù hợp với bạn
        </DiscoverText>
      </View>
      <View style={styles.headerBalance} />
    </View>
  );
}

function HeaderOrb({
  accessibilityLabel,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerOrbPressable,
        pressed && styles.pressed,
      ]}
    >
      <LiquidGlassSurface
        contentStyle={styles.headerOrbSurface}
        glowIntensity="none"
        radius={22}
        style={styles.headerOrbGlass}
        surfaceBackground="rgba(13,18,36,0.62)"
        variant="button"
        withInnerReflection={false}
        withShadow={false}
      >
        <Ionicons color="rgba(236,241,255,0.88)" name={icon} size={23} />
      </LiquidGlassSurface>
    </Pressable>
  );
}

function SearchField({
  horizontalPadding,
  onChangeQuery,
  onClear,
  query,
}: {
  horizontalPadding: number;
  onChangeQuery: (value: string) => void;
  onClear: () => void;
  query: string;
}) {
  return (
    <View style={[styles.searchRow, { paddingHorizontal: horizontalPadding }]}>
      <LiquidGlassSurface
        contentStyle={styles.searchSurface}
        glowIntensity="low"
        radius={21}
        style={styles.searchShell}
        surfaceBackground="rgba(10,16,34,0.66)"
        variant="card"
        withInnerReflection={false}
        withShadow={false}
      >
        <Ionicons
          color="rgba(196,208,242,0.66)"
          name="search-outline"
          size={21}
        />
        <TextInput
          accessibilityLabel="Tìm kiếm set"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onChangeQuery}
          onSubmitEditing={() => Keyboard.dismiss()}
          placeholder="Tìm team, vị trí hoặc tướng..."
          placeholderTextColor="rgba(203,213,242,0.58)"
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
        {query ? (
          <Pressable
            accessibilityLabel="Xóa tìm kiếm set"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClear}
            style={({ pressed }) => [
              styles.searchClear,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color="rgba(215,224,248,0.66)"
              name="close-circle"
              size={19}
            />
          </Pressable>
        ) : null}
      </LiquidGlassSurface>
    </View>
  );
}

function SetFilterRow({
  activeFilterIds,
  chips,
  horizontalPadding,
  onToggle,
}: {
  activeFilterIds: readonly DiscoverFilterId[];
  chips: readonly DiscoverFilterChip[];
  horizontalPadding: number;
  onToggle: (filterId: DiscoverFilterId) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.chipList,
        {
          paddingHorizontal: horizontalPadding,
          paddingRight: horizontalPadding + 28,
        },
      ]}
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      testID="discover-sets-filter-row"
    >
      {chips.map((chip) => {
        const selected =
          chip.id === 'all'
            ? activeFilterIds.length === 0
            : activeFilterIds.includes(chip.id);
        return (
          <Pressable
            accessibilityLabel={`Lọc Set theo ${chip.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={chip.id}
            onPress={() => onToggle(chip.id)}
            style={({ pressed }) => [
              styles.filterChip,
              selected && styles.filterChipActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={selected ? '#FFFFFF' : 'rgba(210,220,246,0.70)'}
              name={chip.icon as IconName}
              size={16}
            />
            <DiscoverText
              numberOfLines={1}
              style={[
                styles.filterChipText,
                selected && styles.filterChipTextActive,
              ]}
            >
              {chip.label}
            </DiscoverText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SortMenu({
  horizontalPadding,
  onSelect,
  selectedId,
}: {
  horizontalPadding: number;
  onSelect: (sortId: DiscoverSetSortId) => void;
  selectedId: DiscoverSetSortId;
}) {
  return (
    <LiquidGlassSurface
      contentStyle={styles.sortMenuContent}
      glowIntensity="low"
      radius={18}
      style={[styles.sortMenu, { marginRight: horizontalPadding }]}
      surfaceBackground="rgba(11,16,34,0.90)"
      variant="modal"
      withInnerReflection={false}
      withShadow={false}
    >
      {sortOptions.map((option) => {
        const selected = option.id === selectedId;
        return (
          <Pressable
            accessibilityLabel={`Sắp xếp theo ${option.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.id}
            onPress={() => onSelect(option.id)}
            style={({ pressed }) => [
              styles.sortOption,
              selected && styles.sortOptionSelected,
              pressed && styles.pressed,
            ]}
          >
            <DiscoverText style={styles.sortOptionText}>
              {option.label}
            </DiscoverText>
            {selected ? (
              <Ionicons color="#C8A8FF" name="checkmark" size={16} />
            ) : null}
          </Pressable>
        );
      })}
    </LiquidGlassSurface>
  );
}

function SetsEmptyState({
  horizontalPadding,
  onReset,
}: {
  horizontalPadding: number;
  onReset: () => void;
}) {
  return (
    <LiquidCard
      contentStyle={styles.emptyContent}
      glowIntensity="low"
      radius={24}
      style={[styles.emptyCard, { marginHorizontal: horizontalPadding }]}
      surfaceBackground="rgba(10,16,34,0.64)"
      withInnerReflection={false}
      withShadow={false}
    >
      <Ionicons color="rgba(194,174,255,0.78)" name="search" size={27} />
      <DiscoverText style={styles.emptyTitle}>Chưa có set phù hợp</DiscoverText>
      <DiscoverText style={styles.emptyBody}>
        Thử bỏ bớt bộ lọc hoặc tìm bằng vị trí, tướng và tên team khác.
      </DiscoverText>
      <Pressable
        accessibilityLabel="Đặt lại tìm kiếm Set"
        accessibilityRole="button"
        onPress={onReset}
        style={({ pressed }) => [styles.emptyReset, pressed && styles.pressed]}
      >
        <DiscoverText style={styles.emptyResetText}>Đặt lại</DiscoverText>
      </Pressable>
    </LiquidCard>
  );
}

function SetsBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#030711', '#071326', '#04101D', '#030711']}
        locations={[0, 0.35, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[
          'rgba(65,69,205,0.20)',
          'rgba(36,58,153,0.07)',
          'rgba(3,7,17,0)',
        ]}
        end={{ x: 0.72, y: 0.62 }}
        start={{ x: 0, y: 0.12 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(3,7,17,0)', 'rgba(0,119,164,0.11)', 'rgba(3,7,17,0)']}
        end={{ x: 1, y: 0.55 }}
        start={{ x: 0.55, y: 0.2 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chipList: { gap: 8, paddingVertical: 1 },
  content: { paddingHorizontal: 0 },
  emptyBody: {
    color: liquidColors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    textAlign: 'center',
  },
  emptyCard: { marginTop: 18 },
  emptyContent: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  emptyReset: {
    backgroundColor: 'rgba(119,77,218,0.26)',
    borderColor: 'rgba(214,188,255,0.22)',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyResetText: { color: '#DDC9FF', fontSize: 11, fontWeight: '800' },
  emptyTitle: {
    color: liquidColors.text.primary,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 10,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(14,18,34,0.62)',
    borderColor: 'rgba(221,230,255,0.10)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    minHeight: 32,
    paddingHorizontal: 11,
  },
  filterChipActive: {
    backgroundColor: 'rgba(132,72,255,0.58)',
    borderColor: 'rgba(219,191,255,0.48)',
    shadowColor: '#A36CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.17,
    shadowRadius: 10,
  },
  filterChipText: {
    color: 'rgba(220,226,248,0.70)',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  headerBalance: { width: 44 },
  headerCopy: { alignItems: 'center', flex: 1, minWidth: 0 },
  headerOrbGlass: { height: 44, width: 44 },
  headerOrbPressable: { borderRadius: 22 },
  headerOrbSurface: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  headerSubtitle: {
    color: 'rgba(205,214,240,0.64)',
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center',
  },
  headerTitle: {
    color: liquidColors.text.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.45,
    textAlign: 'center',
  },
  list: { gap: 9, marginTop: 7 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  resultCount: {
    color: 'rgba(220,226,248,0.72)',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  resultCountAccent: { color: '#B891FF', fontSize: 13.5, fontWeight: '900' },
  screen: { backgroundColor: '#030711', flex: 1 },
  searchClear: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  searchInput: {
    color: liquidColors.text.primary,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    padding: 0,
  },
  searchRow: { marginBottom: 10, paddingHorizontal: 20 },
  searchShell: { width: '100%' },
  searchSurface: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 13,
  },
  sortMenu: { alignSelf: 'flex-end', marginTop: 2, width: 166, zIndex: 4 },
  sortMenuContent: { gap: 3, padding: 6 },
  sortOption: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
    paddingHorizontal: 10,
  },
  sortOptionSelected: { backgroundColor: 'rgba(125,76,224,0.18)' },
  sortOptionText: {
    color: 'rgba(229,233,250,0.82)',
    fontSize: 11,
    fontWeight: '700',
  },
  sortPill: { width: '100%' },
  sortPillContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 9,
  },
  sortPillHost: { borderRadius: 16, maxWidth: 136, minHeight: 30 },
  sortPillText: {
    color: '#D4BEFF',
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
  },
  statusGuard: { left: 0, position: 'absolute', right: 0, top: 0, zIndex: 8 },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 10,
  },
});
