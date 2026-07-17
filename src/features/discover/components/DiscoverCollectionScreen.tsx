import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useDeferredValue, useState } from 'react';
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

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  LiquidButton,
  LiquidCard,
  LiquidGlassSurface,
} from '@/shared/components/liquid';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import { DiscoverQueryState, DiscoverStaleBanner } from './DiscoverQueryState';
import { DiscoverResolvedImage } from './DiscoverResolvedImage';

import type {
  DiscoverFilterChip,
  DiscoverFilterId,
  DiscoverProfileCard,
  DiscoverResolvedMedia,
  DiscoverSetCard,
  DiscoverVibeCard,
} from '../model/discover-domain';
import { useDiscoverStore } from '../model/discover-store';
import { useDiscoverCapabilities } from '../runtime/DiscoverRepositoryProvider';
import {
  useDiscoverCollectionQuery,
  useDiscoverOverviewQuery,
  useInvitePlayerMutation,
  usePlayerDecisionMutation,
  useRequestSetJoinMutation,
  type DiscoverCollectionKind,
  type DiscoverCollectionSortId,
} from '../queries/discover-queries';

type CollectionKind = DiscoverCollectionKind;
type SortId = DiscoverCollectionSortId;
type IconName = keyof typeof Ionicons.glyphMap;
type Tone = 'cyan' | 'mint' | 'orange' | 'pink' | 'purple';

type CollectionConfig = {
  kind: CollectionKind;
  searchPlaceholder: string;
  subtitle: string;
  title: string;
};

type SortOption = { id: SortId; label: string };
type VibeVisualTreatment = {
  accent: readonly [string, string];
};

const configs: Record<CollectionKind, CollectionConfig> = {
  matches: {
    kind: 'matches',
    searchPlaceholder: 'Tìm người chơi, vai trò, rank...',
    subtitle: 'Gợi ý theo vai trò và thói quen chơi',
    title: 'Hợp vibe với bạn',
  },
  sets: {
    kind: 'sets',
    searchPlaceholder: 'Tìm team, vị trí hoặc tướng...',
    subtitle: 'Các set đang mở phù hợp với bạn',
    title: 'Set đang cần người',
  },
  vibes: {
    kind: 'vibes',
    searchPlaceholder: 'Tìm vibe hoặc hoạt động...',
    subtitle: 'Hoạt động được quan tâm trong cộng đồng',
    title: 'Vibe hot tối nay',
  },
};

const sortOptions: Record<CollectionKind, readonly SortOption[]> = {
  matches: [
    { id: 'best', label: 'Hợp nhất' },
    { id: 'online', label: 'Đang online' },
    { id: 'newest', label: 'Mới gợi ý' },
  ],
  sets: [
    { id: 'best', label: 'Phù hợp nhất' },
    { id: 'ready', label: 'Sắp đủ người' },
    { id: 'newest', label: 'Mới mở' },
  ],
  vibes: [
    { id: 'popular', label: 'Đang nổi' },
    { id: 'newest', label: 'Mới nhất' },
    { id: 'best', label: 'Phù hợp nhất' },
  ],
};

const defaultVibeVisualTreatment: VibeVisualTreatment = {
  accent: ['rgba(117,78,255,0)', 'rgba(117,78,255,0.10)'],
};

const vibeVisualTreatments: Record<string, VibeVisualTreatment> = {
  'casual-night-chill': {
    accent: ['rgba(37,205,255,0)', 'rgba(37,205,255,0.13)'],
  },
  'duo-support': {
    accent: ['rgba(255,88,174,0)', 'rgba(255,88,174,0.11)'],
  },
  'five-stack-sprint': {
    accent: ['rgba(56,225,196,0)', 'rgba(56,225,196,0.11)'],
  },
  'late-night-rank': defaultVibeVisualTreatment,
  'team-needs-mid': {
    accent: ['rgba(255,145,64,0)', 'rgba(255,145,64,0.10)'],
  },
  'weekend-soulmate': {
    accent: ['rgba(255,95,181,0)', 'rgba(255,95,181,0.14)'],
  },
};

const toneColors: Record<
  Tone,
  { background: string; border: string; text: string }
> = {
  cyan: {
    background: 'rgba(41,183,255,0.13)',
    border: 'rgba(92,220,255,0.28)',
    text: '#85E8FF',
  },
  mint: {
    background: 'rgba(16,226,171,0.12)',
    border: 'rgba(73,255,205,0.24)',
    text: '#72F6D4',
  },
  orange: {
    background: 'rgba(255,133,46,0.12)',
    border: 'rgba(255,160,82,0.24)',
    text: '#FFB36C',
  },
  pink: {
    background: 'rgba(255,80,154,0.12)',
    border: 'rgba(255,121,180,0.25)',
    text: '#FF8DBD',
  },
  purple: {
    background: 'rgba(142,82,255,0.16)',
    border: 'rgba(201,155,255,0.32)',
    text: '#D9C2FF',
  },
};

function DiscoverText(props: TextProps) {
  return <RNText maxFontSizeMultiplier={1} {...props} />;
}

export function DiscoverCollectionScreen({ kind }: { kind: CollectionKind }) {
  const config = configs[kind];
  const capability = useDiscoverCapabilities().collections[kind];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const inheritedFilters = useDiscoverStore((state) => state.activeFilterIds);
  const inheritedQuery = useDiscoverStore((state) => state.query);
  const [activeFilterIds, setActiveFilterIds] = useState<DiscoverFilterId[]>(
    () => (capability.filters ? [...inheritedFilters] : []),
  );
  const [query, setQuery] = useState(capability.search ? inheritedQuery : '');
  const supportedSortOptions = sortOptions[kind].filter((option) =>
    capability.sorts.includes(option.id),
  );
  const defaultSort = supportedSortOptions[0] ?? sortOptions[kind][0]!;
  const [sortExpanded, setSortExpanded] = useState(false);
  const [sortId, setSortId] = useState<SortId>(defaultSort.id);
  const deferredQuery = useDeferredValue(query);
  const compact = width < 390;
  const horizontalPadding = compact ? 15 : 20;
  const cardWidth = width - horizontalPadding * 2;

  const activeFacetIds = capability.filters
    ? activeFilterIds.filter(
        (filterId): filterId is Exclude<DiscoverFilterId, 'all'> =>
          filterId !== 'all',
      )
    : [];
  const filterOptionsQuery = useDiscoverOverviewQuery({
    facetIds: [],
    previewLimit: 1,
    query: '',
  });
  const collectionQuery = useDiscoverCollectionQuery(kind, {
    facetIds: activeFacetIds,
    query: capability.search ? deferredQuery : '',
    sort: capability.sorts.includes(sortId) ? sortId : defaultSort.id,
  });
  const items = collectionQuery.data?.items ?? [];
  const discoverFilterChips = filterOptionsQuery.data?.filterChips ?? [];

  const selectedSort =
    supportedSortOptions.find((option) => option.id === sortId) ?? defaultSort;
  const criteriaActive =
    (capability.filters && activeFilterIds.length > 0) ||
    (capability.search && query.trim().length > 0);
  const searchUpdating = capability.search && query !== deferredQuery;
  const sortEnabled = supportedSortOptions.length > 1;

  const toggleFilter = (filterId: DiscoverFilterId) => {
    if (filterId === 'all') {
      setActiveFilterIds([]);
      return;
    }
    setActiveFilterIds((current) =>
      current.includes(filterId)
        ? current.filter((value) => value !== filterId)
        : [...current, filterId],
    );
  };

  const resetCriteria = () => {
    setActiveFilterIds([]);
    setQuery('');
    setSortId(defaultSort.id);
    setSortExpanded(false);
  };

  if (!collectionQuery.data || !filterOptionsQuery.data) {
    return (
      <DiscoverQueryState
        error={collectionQuery.error ?? filterOptionsQuery.error}
        onRetry={() => {
          void collectionQuery.refetch();
          void filterOptionsQuery.refetch();
        }}
      />
    );
  }

  return (
    <View style={styles.screen} testID={`discover-collection-${kind}`}>
      <StatusBar style="light" />
      <CollectionBackground />
      {collectionQuery.isError || filterOptionsQuery.isError ? (
        <DiscoverStaleBanner />
      ) : null}
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
        <CollectionHeader
          config={config}
          horizontalPadding={horizontalPadding}
        />
        {capability.search ? (
          <CollectionSearch
            onChangeQuery={setQuery}
            onClear={() => setQuery('')}
            placeholder={config.searchPlaceholder}
            query={query}
            horizontalPadding={horizontalPadding}
          />
        ) : null}
        {capability.filters ? (
          <CollectionFilterRow
            activeFilterIds={activeFilterIds}
            chips={discoverFilterChips}
            horizontalPadding={horizontalPadding}
            onToggle={toggleFilter}
          />
        ) : null}
        <CollectionToolbar
          count={items.length}
          horizontalPadding={horizontalPadding}
          kind={kind}
          isUpdating={searchUpdating}
          onToggleSort={() => setSortExpanded((value) => !value)}
          selectedSort={selectedSort.label}
          sortEnabled={sortEnabled}
          sortExpanded={sortExpanded}
        />
        {sortEnabled && sortExpanded ? (
          <SortOptions
            horizontalPadding={horizontalPadding}
            kind={kind}
            onSelect={(nextSortId) => {
              setSortId(nextSortId);
              setSortExpanded(false);
            }}
            selectedId={sortId}
            supportedSortIds={capability.sorts}
          />
        ) : null}
        {items.length ? (
          <View style={styles.list}>
            {kind === 'vibes'
              ? (items as readonly DiscoverVibeCard[]).map((card) => (
                  <CollectionVibeCard
                    card={card}
                    key={card.id}
                    width={cardWidth}
                  />
                ))
              : null}
            {kind === 'sets'
              ? (items as readonly DiscoverSetCard[]).map((card) => (
                  <CollectionSetCard
                    card={card}
                    compact={compact}
                    key={card.id}
                  />
                ))
              : null}
            {kind === 'matches'
              ? (items as readonly DiscoverProfileCard[]).map((card) => (
                  <CollectionProfileCard
                    card={card}
                    compact={compact}
                    key={card.id}
                  />
                ))
              : null}
          </View>
        ) : (
          <CollectionEmptyState
            criteriaActive={criteriaActive}
            horizontalPadding={horizontalPadding}
            onReset={resetCriteria}
          />
        )}
      </ScrollView>
      <LinearGradient
        colors={[
          'rgba(3,7,17,0.98)',
          'rgba(3,7,17,0.80)',
          'rgba(3,7,17,0.30)',
          'rgba(3,7,17,0)',
        ]}
        pointerEvents="none"
        style={[styles.statusGuard, { height: Math.max(insets.top + 52, 88) }]}
      />
    </View>
  );
}

function CollectionBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#040814', '#07142A', '#030711']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[
          'rgba(74,118,255,0.20)',
          'rgba(104,52,198,0.070)',
          'rgba(3,7,17,0)',
        ]}
        end={{ x: 0.82, y: 0.52 }}
        start={{ x: 0.16, y: 0 }}
        style={styles.topSheen}
      />
      <LinearGradient
        colors={['rgba(43,205,255,0)', 'rgba(43,205,255,0.075)']}
        end={{ x: 1, y: 0.5 }}
        start={{ x: 0, y: 0.5 }}
        style={styles.rightSheen}
      />
    </View>
  );
}

function CollectionHeader({
  config,
  horizontalPadding,
}: {
  config: CollectionConfig;
  horizontalPadding: number;
}) {
  return (
    <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
      <Pressable
        accessibilityLabel="Quay lại Khám phá"
        accessibilityRole="button"
        hitSlop={10}
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Ionicons
          color="rgba(235,239,255,0.86)"
          name="chevron-back"
          size={22}
        />
      </Pressable>
      <View style={styles.headerCopy}>
        <DiscoverText accessibilityRole="header" style={styles.headerTitle}>
          {config.title}
        </DiscoverText>
        <DiscoverText numberOfLines={2} style={styles.headerSubtitle}>
          {config.subtitle}
        </DiscoverText>
      </View>
      <View style={styles.headerBalance} />
    </View>
  );
}

function CollectionSearch({
  horizontalPadding,
  onChangeQuery,
  onClear,
  placeholder,
  query,
}: {
  horizontalPadding: number;
  onChangeQuery: (value: string) => void;
  onClear: () => void;
  placeholder: string;
  query: string;
}) {
  return (
    <View style={[styles.searchRow, { paddingHorizontal: horizontalPadding }]}>
      <LiquidGlassSurface
        baseStrokeOpacity={0.12}
        contentStyle={styles.searchSurfaceContent}
        glowIntensity="low"
        radius={22}
        style={styles.searchSurface}
        surfaceBackground="rgba(9,13,30,0.62)"
        variant="card"
        withInnerReflection={false}
        withShadow={false}
      >
        <Ionicons color="rgba(202,211,242,0.62)" name="search" size={20} />
        <TextInput
          accessibilityLabel="Tìm trong danh sách Khám phá"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onChangeQuery}
          onSubmitEditing={() => Keyboard.dismiss()}
          placeholder={placeholder}
          placeholderTextColor="rgba(190,200,232,0.54)"
          returnKeyType="search"
          selectionColor="#B996FF"
          style={styles.searchInput}
          value={query}
        />
        {query ? (
          <Pressable
            accessibilityLabel="Xoá tìm kiếm danh sách"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClear}
            style={({ pressed }) => [
              styles.clearButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color="rgba(213,221,247,0.62)" name="close" size={16} />
          </Pressable>
        ) : null}
      </LiquidGlassSurface>
    </View>
  );
}

function CollectionFilterRow({
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
        styles.filterList,
        {
          paddingHorizontal: horizontalPadding,
          paddingRight: horizontalPadding + 28,
        },
      ]}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {chips.map((chip) => {
        const selected =
          chip.id === 'all'
            ? activeFilterIds.length === 0
            : activeFilterIds.includes(chip.id);
        return (
          <Pressable
            accessibilityLabel={`Lọc danh sách theo ${chip.label}`}
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
              color={selected ? '#FFFFFF' : 'rgba(215,222,245,0.64)'}
              name={chip.icon as IconName}
              size={15}
            />
            <DiscoverText
              numberOfLines={1}
              style={[styles.filterText, selected && styles.filterTextActive]}
            >
              {chip.label}
            </DiscoverText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function CollectionToolbar({
  count,
  horizontalPadding,
  isUpdating,
  kind,
  onToggleSort,
  selectedSort,
  sortEnabled,
  sortExpanded,
}: {
  count: number;
  horizontalPadding: number;
  isUpdating: boolean;
  kind: CollectionKind;
  onToggleSort: () => void;
  selectedSort: string;
  sortEnabled: boolean;
  sortExpanded: boolean;
}) {
  return (
    <View style={[styles.toolbar, { paddingHorizontal: horizontalPadding }]}>
      <View style={styles.resultCopy}>
        <DiscoverText style={styles.resultCount}>
          {isUpdating ? 'Đang cập nhật…' : collectionResultLabel(kind, count)}
        </DiscoverText>
      </View>
      {sortEnabled ? (
        <Pressable
          accessibilityLabel={sortExpanded ? 'Đóng sắp xếp' : 'Mở sắp xếp'}
          accessibilityRole="button"
          accessibilityState={{ expanded: sortExpanded }}
          onPress={onToggleSort}
          style={({ pressed }) => [
            styles.sortButton,
            pressed && styles.pressed,
          ]}
        >
          <DiscoverText numberOfLines={1} style={styles.sortLabel}>
            {selectedSort}
          </DiscoverText>
          <Ionicons
            color="rgba(215,223,247,0.58)"
            name={sortExpanded ? 'chevron-up' : 'chevron-down'}
            size={13}
          />
        </Pressable>
      ) : (
        <View
          accessibilityLabel={`Đang sắp xếp theo ${selectedSort}`}
          style={styles.sortButton}
        >
          <DiscoverText numberOfLines={1} style={styles.sortLabel}>
            {selectedSort}
          </DiscoverText>
        </View>
      )}
    </View>
  );
}

function SortOptions({
  horizontalPadding,
  kind,
  onSelect,
  selectedId,
  supportedSortIds,
}: {
  horizontalPadding: number;
  kind: CollectionKind;
  onSelect: (sortId: SortId) => void;
  selectedId: SortId;
  supportedSortIds: readonly SortId[];
}) {
  return (
    <View
      style={[styles.sortPanelWrap, { paddingHorizontal: horizontalPadding }]}
    >
      <LiquidGlassSurface
        contentStyle={styles.sortPanel}
        glowIntensity="low"
        radius={18}
        surfaceBackground="rgba(11,16,34,0.88)"
        withInnerReflection={false}
        withShadow={false}
      >
        {sortOptions[kind]
          .filter((option) => supportedSortIds.includes(option.id))
          .map((option) => {
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
                  selected && styles.sortOptionActive,
                  pressed && styles.pressed,
                ]}
              >
                <DiscoverText
                  style={[
                    styles.sortOptionText,
                    selected && styles.sortOptionTextActive,
                  ]}
                >
                  {option.label}
                </DiscoverText>
                {selected ? (
                  <Ionicons color="#D9C2FF" name="checkmark" size={15} />
                ) : null}
              </Pressable>
            );
          })}
      </LiquidGlassSurface>
    </View>
  );
}

function CollectionVibeCard({
  card,
  width,
}: {
  card: DiscoverVibeCard;
  width: number;
}) {
  const selected = useDiscoverStore(
    (state) => state.selectedVibeId === card.id,
  );
  const selectVibe = useDiscoverStore((state) => state.selectVibe);
  const height = 150;
  const treatment = vibeVisualTreatments[card.id] ?? defaultVibeVisualTreatment;
  return (
    <Pressable
      accessibilityLabel={`Chọn vibe ${card.title}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => selectVibe(card.id)}
      testID={`discover-vibe-card-${card.id}`}
      style={({ pressed }) => [
        styles.vibeCard,
        { height, width },
        selected && styles.selectedCard,
        pressed && styles.pressed,
      ]}
    >
      <DiscoverResolvedImage
        media={card.background}
        resizeMode="cover"
        style={styles.vibeBackdrop}
        testID={`discover-vibe-backdrop-${card.id}`}
      />
      <DiscoverResolvedImage
        media={card.background}
        resizeMode="contain"
        style={[styles.vibeArtwork, { height, width: height }]}
        testID={`discover-vibe-artwork-${card.id}`}
      />
      <LinearGradient
        colors={treatment.accent}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[
          'rgba(3,6,15,0.84)',
          'rgba(3,6,15,0.70)',
          'rgba(3,6,15,0.40)',
          'rgba(3,6,15,0.14)',
          'rgba(3,6,15,0)',
        ]}
        end={{ x: 0.94, y: 0.5 }}
        locations={[0, 0.24, 0.52, 0.78, 1]}
        pointerEvents="none"
        start={{ x: 0, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        testID={`discover-vibe-horizontal-fade-${card.id}`}
      />
      <LinearGradient
        colors={[
          'rgba(3,6,15,0.02)',
          'rgba(3,6,15,0.12)',
          'rgba(3,6,15,0.76)',
          'rgba(3,6,15,0.96)',
        ]}
        locations={[0, 0.5, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />
      {selected ? (
        <View style={styles.vibeSelection}>
          <View style={styles.selectedPill}>
            <Ionicons color="#FFFFFF" name="checkmark" size={12} />
            <DiscoverText style={styles.selectedPillText}>Đã chọn</DiscoverText>
          </View>
        </View>
      ) : null}
      <View style={styles.vibeBottom}>
        <DiscoverText numberOfLines={1} style={styles.vibeTitle}>
          {card.title}
        </DiscoverText>
        <DiscoverText numberOfLines={1} style={styles.vibeMeta}>
          {card.interestedLabel}
        </DiscoverText>
        <AvatarStack
          sources={card.participantSources}
          surplus={card.surplusLabel}
        />
      </View>
    </Pressable>
  );
}

function CollectionSetCard({
  card,
  compact,
}: {
  card: DiscoverSetCard;
  compact: boolean;
}) {
  const selected = useDiscoverStore((state) => state.selectedSetId === card.id);
  const openSet = useDiscoverStore((state) => state.openSet);
  const requestMutation = useRequestSetJoinMutation();
  const requesting =
    requestMutation.isPending && requestMutation.variables?.setId === card.id;
  const requested = card.actionState === 'pending' || requesting;
  const actionText =
    card.actionKind === 'request' && requested ? 'Đã gửi' : card.actionLabel;
  const onAction = () => {
    if (card.actionKind === 'request') {
      requestMutation.mutate({ setId: card.id, version: card.version });
      return;
    }
    openSet(card.id);
  };
  return (
    <LiquidCard
      baseStrokeOpacity={0.12}
      contentStyle={styles.setCardContent}
      density="compact"
      glowIntensity="low"
      radius={24}
      style={[styles.collectionCard, selected && styles.selectedCard]}
      surfaceBackground={
        card.actionTone === 'cyan'
          ? 'rgba(8,23,42,0.66)'
          : 'rgba(16,14,36,0.66)'
      }
      variant={card.actionTone}
      withInnerReflection={false}
      withShadow={false}
    >
      <View style={styles.setTopRow}>
        <View style={styles.setImageShell}>
          <DiscoverResolvedImage media={card.image} style={styles.setImage} />
        </View>
        <View style={styles.setCopy}>
          <View style={styles.titleBadgeRow}>
            <DiscoverText numberOfLines={2} style={styles.setTitle}>
              {card.title}
            </DiscoverText>
            <ToneBadge label={card.badgeLabel} tone={card.badgeTone} />
          </View>
          <View style={styles.metaRow}>
            <DiscoverText numberOfLines={1} style={styles.metaText}>
              {card.meta}
            </DiscoverText>
            <DiscoverText style={styles.metaDot}>·</DiscoverText>
            <DiscoverText style={styles.metaText}>{card.slots}</DiscoverText>
            <DiscoverText style={styles.metaDot}>·</DiscoverText>
            <Ionicons
              color="#4EF2C7"
              name={card.statusKind === 'mic' ? 'mic' : 'ellipse'}
              size={card.statusKind === 'mic' ? 13 : 8}
            />
            <DiscoverText style={styles.micText}>
              {card.statusLabel}
            </DiscoverText>
          </View>
        </View>
      </View>
      <View style={styles.tagsRow}>
        {card.tags.slice(0, compact ? 3 : 4).map((tag) => (
          <TinyTag key={tag} label={tag} tone={card.badgeTone} />
        ))}
      </View>
      <View style={styles.cardFooter}>
        <AvatarStack sources={card.avatarSources.slice(0, 4)} surplus="+1" />
        <LiquidButton
          accessibilityLabel={`${card.actionLabel} ${card.title}`}
          contentStyle={styles.actionButtonContent}
          disabled={card.actionKind === 'request' && requested}
          glowIntensity="low"
          onPress={onAction}
          radius={17}
          style={styles.actionButton}
          variant={card.actionTone === 'cyan' ? 'rank' : 'primary'}
          withShadow={false}
        >
          <DiscoverText style={styles.actionButtonText}>
            {actionText}
          </DiscoverText>
        </LiquidButton>
      </View>
    </LiquidCard>
  );
}

function CollectionProfileCard({
  card,
  compact,
}: {
  card: DiscoverProfileCard;
  compact: boolean;
}) {
  const selected = useDiscoverStore(
    (state) => state.selectedProfileId === card.id,
  );
  const openProfile = useDiscoverStore((state) => state.openProfile);
  const inviteMutation = useInvitePlayerMutation();
  const decisionMutation = usePlayerDecisionMutation();
  const inviting =
    inviteMutation.isPending && inviteMutation.variables?.profileId === card.id;
  const invited = card.actionState === 'pending' || inviting;
  const deciding =
    decisionMutation.isPending &&
    decisionMutation.variables?.playerId === card.playerId;
  const actionText =
    card.actionKind === 'invite' && invited
      ? 'Đã mời'
      : card.actionKind === 'like' && deciding
        ? 'Đang thích'
        : card.actionLabel;
  const decide = (decision: 'like' | 'pass') => {
    if (
      !card.playerId ||
      card.profileVersion === undefined ||
      card.intentVersion === undefined
    ) {
      return;
    }
    decisionMutation.mutate({
      decision,
      intentVersion: card.intentVersion,
      playerId: card.playerId,
      profileVersion: card.profileVersion,
    });
  };
  const onAction = () => {
    if (card.actionKind === 'invite' && card.targetSetId) {
      inviteMutation.mutate({ profileId: card.id, setId: card.targetSetId });
      return;
    }
    if (card.actionKind === 'like') {
      decide('like');
      return;
    }
    openProfile(card.id);
    router.push(
      card.playerId
        ? appRoutes.profile.playerDetail(card.playerId)
        : appRoutes.profile.detail(card.id),
    );
  };
  return (
    <LiquidCard
      baseStrokeOpacity={0.11}
      contentStyle={styles.profileCardContent}
      density="compact"
      glowIntensity="low"
      radius={23}
      style={[styles.collectionCard, selected && styles.selectedCard]}
      surfaceBackground={
        card.actionTone === 'cyan'
          ? 'rgba(6,25,44,0.62)'
          : 'rgba(15,16,42,0.64)'
      }
      variant={card.actionTone}
      withInnerReflection={false}
      withShadow={false}
    >
      <View style={styles.profileTopRow}>
        <View style={styles.profileAvatarShell}>
          <DiscoverResolvedImage
            media={card.avatar}
            style={styles.profileAvatar}
          />
          {card.online ? (
            <View
              style={styles.onlineDot}
              testID={`discover-profile-online-${card.id}`}
            />
          ) : null}
        </View>
        <View style={styles.profileCopy}>
          <View
            style={styles.profileNameRow}
            testID={`discover-profile-name-${card.id}`}
          >
            <DiscoverText numberOfLines={1} style={styles.profileName}>
              {card.name}
            </DiscoverText>
          </View>
          <DiscoverText numberOfLines={1} style={styles.profileSubtitle}>
            {card.subtitle}
          </DiscoverText>
          <View style={styles.profileTagsRow}>
            {card.tags.slice(0, compact ? 1 : 2).map((tag, index) => (
              <TinyTag
                key={tag}
                label={tag}
                tone={index === 0 ? card.actionTone : 'purple'}
              />
            ))}
          </View>
        </View>
        <View
          style={styles.matchPill}
          testID={`discover-profile-match-${card.id}`}
        >
          <Ionicons color="#C6A7FF" name="heart" size={10} />
          <DiscoverText numberOfLines={1} style={styles.matchText}>
            {card.match.replace('Hợp vibe ', '')}
          </DiscoverText>
        </View>
      </View>
      <View style={styles.profileFooter}>
        <Pressable
          accessibilityLabel={
            card.playerId ? `Bỏ qua ${card.name}` : `Nhắn ${card.name}`
          }
          accessibilityRole="button"
          disabled={card.playerId ? !card.canPass || deciding : false}
          onPress={() => {
            if (card.playerId) {
              decide('pass');
              return;
            }
            router.push(
              card.conversationId
                ? appRoutes.messages.detail(card.conversationId)
                : appRoutes.main.messages,
            );
          }}
          style={({ pressed }) => [
            styles.messageButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            color="rgba(230,235,255,0.80)"
            name={card.playerId ? 'close' : 'chatbubble-ellipses-outline'}
            size={17}
          />
        </Pressable>
        <View
          style={[
            styles.profileActionWrap,
            card.actionKind === 'view' && styles.profileViewActionWrap,
          ]}
          testID={`discover-profile-action-${card.id}`}
        >
          <LiquidButton
            accessibilityLabel={`${card.actionLabel} ${card.name}`}
            contentStyle={styles.profileActionContent}
            disabled={
              (card.actionKind === 'invite' && invited) ||
              card.actionKind === 'liked' ||
              deciding
            }
            glowIntensity={
              card.actionKind === 'view' || card.actionKind === 'liked'
                ? 'none'
                : 'low'
            }
            onPress={onAction}
            radius={17}
            style={styles.profileActionButton}
            variant={
              card.actionKind === 'view' || card.actionKind === 'liked'
                ? 'secondary'
                : card.actionTone === 'cyan'
                  ? 'rank'
                  : 'primary'
            }
            withShadow={false}
          >
            <DiscoverText style={styles.actionButtonText}>
              {actionText}
            </DiscoverText>
          </LiquidButton>
        </View>
      </View>
    </LiquidCard>
  );
}

function CollectionEmptyState({
  criteriaActive,
  horizontalPadding,
  onReset,
}: {
  criteriaActive: boolean;
  horizontalPadding: number;
  onReset: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: horizontalPadding }}>
      <LiquidCard
        contentStyle={styles.emptyContent}
        density="compact"
        glowIntensity="low"
        radius={22}
        style={styles.emptyCard}
        withShadow={false}
      >
        <Ionicons color="rgba(190,203,242,0.72)" name="search" size={26} />
        <DiscoverText style={styles.emptyTitle}>
          Không có kết quả phù hợp
        </DiscoverText>
        <DiscoverText style={styles.emptyText}>
          {criteriaActive
            ? 'Thử bỏ bớt điều kiện hoặc dùng từ khoá rộng hơn.'
            : 'Danh sách này chưa có nội dung phù hợp.'}
        </DiscoverText>
        {criteriaActive ? (
          <Pressable
            accessibilityLabel="Đặt lại danh sách Khám phá"
            accessibilityRole="button"
            onPress={onReset}
            style={({ pressed }) => [
              styles.emptyReset,
              pressed && styles.pressed,
            ]}
          >
            <DiscoverText style={styles.emptyResetText}>Đặt lại</DiscoverText>
          </Pressable>
        ) : null}
      </LiquidCard>
    </View>
  );
}

function AvatarStack({
  sources,
  surplus,
}: {
  sources: readonly DiscoverResolvedMedia[];
  surplus?: string;
}) {
  return (
    <View style={styles.avatarStack}>
      {sources.map((source, index) => (
        <DiscoverResolvedImage
          key={index}
          media={source}
          style={[styles.stackAvatar, index > 0 && styles.stackAvatarOverlap]}
        />
      ))}
      {surplus ? (
        <View style={styles.stackSurplus}>
          <DiscoverText style={styles.stackSurplusText}>{surplus}</DiscoverText>
        </View>
      ) : null}
    </View>
  );
}

function ToneBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'cyan' | 'orange';
}) {
  const resolved = toneColors[tone];
  return (
    <View
      style={[
        styles.toneBadge,
        { backgroundColor: resolved.background, borderColor: resolved.border },
      ]}
    >
      <Ionicons
        color={resolved.text}
        name={tone === 'orange' ? 'people-outline' : 'trophy-outline'}
        size={11}
      />
      <DiscoverText style={[styles.toneBadgeText, { color: resolved.text }]}>
        {label}
      </DiscoverText>
    </View>
  );
}

function TinyTag({ label, tone }: { label: string; tone: Tone }) {
  const resolved = toneColors[tone];
  return (
    <View
      style={[
        styles.tinyTag,
        { backgroundColor: resolved.background, borderColor: resolved.border },
      ]}
    >
      <DiscoverText
        numberOfLines={1}
        style={[styles.tinyTagText, { color: resolved.text }]}
      >
        {label}
      </DiscoverText>
    </View>
  );
}

function collectionResultLabel(kind: CollectionKind, count: number) {
  if (kind === 'vibes') return `${count} vibe đang nổi`;
  if (kind === 'matches') return `${count} người phù hợp`;
  return `${count} set phù hợp`;
}

const styles = StyleSheet.create({
  actionButton: { minWidth: 116 },
  actionButtonContent: {
    minHeight: 35,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  actionButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  avatarStack: { alignItems: 'center', flexDirection: 'row' },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(13,18,36,0.58)',
    borderColor: 'rgba(225,232,255,0.12)',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  cardFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  collectionCard: { marginHorizontal: 0 },
  content: { paddingHorizontal: 0 },
  emptyCard: { marginTop: 20 },
  emptyContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  emptyReset: {
    backgroundColor: 'rgba(117,79,220,0.22)',
    borderColor: 'rgba(199,168,255,0.22)',
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyResetText: { color: '#F0E9FF', fontSize: 11, fontWeight: '800' },
  emptyText: {
    color: 'rgba(196,207,238,0.62)',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
    textAlign: 'center',
  },
  emptyTitle: {
    color: liquidColors.text.primary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 9,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(14,18,34,0.56)',
    borderColor: 'rgba(221,230,255,0.10)',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 31,
    paddingHorizontal: 10,
  },
  filterChipActive: {
    backgroundColor: 'rgba(132,72,255,0.58)',
    borderColor: 'rgba(219,191,255,0.48)',
    shadowColor: '#A36CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
  },
  filterList: { gap: 8, paddingTop: 9 },
  filterText: {
    color: 'rgba(220,226,248,0.70)',
    fontSize: 11.5,
    fontWeight: '600',
  },
  filterTextActive: { color: '#FFFFFF', fontWeight: '800' },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  headerBalance: { width: 44 },
  headerCopy: { alignItems: 'center', flex: 1, minWidth: 0 },
  headerSubtitle: {
    color: 'rgba(205,214,240,0.64)',
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center',
  },
  headerTitle: {
    color: liquidColors.text.primary,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
  list: { gap: 12, paddingHorizontal: 18, paddingTop: 4 },
  matchPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(126,86,255,0.11)',
    borderColor: 'rgba(197,166,255,0.18)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  matchText: { color: '#D6C1FF', fontSize: 9.25, fontWeight: '900' },
  messageButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(14,18,34,0.58)',
    borderColor: 'rgba(225,234,255,0.13)',
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 38,
  },
  metaDot: { color: liquidColors.text.muted, fontSize: 12 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 6 },
  metaText: {
    color: 'rgba(205,213,239,0.68)',
    fontSize: 11.5,
    fontWeight: '600',
  },
  micText: { color: 'rgba(112,244,208,0.88)', fontSize: 11, fontWeight: '700' },
  onlineDot: {
    backgroundColor: '#17F4B7',
    borderColor: '#07111D',
    borderRadius: 999,
    borderWidth: 1.25,
    bottom: 3,
    height: 9,
    left: 3,
    position: 'absolute',
    width: 9,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  profileActionButton: { minWidth: 0, width: '100%' },
  profileActionWrap: { width: '58%' },
  profileActionContent: {
    minHeight: 34,
    paddingHorizontal: 13,
    paddingVertical: 4,
  },
  profileAvatar: { height: '100%', width: '100%' },
  profileAvatarShell: {
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 62,
    overflow: 'hidden',
    width: 62,
  },
  profileCardContent: { paddingHorizontal: 12, paddingVertical: 11 },
  profileCopy: { flex: 1, minWidth: 0 },
  profileFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  profileName: {
    color: liquidColors.text.primary,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  profileNameRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  profileTagsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    minWidth: 0,
    overflow: 'hidden',
  },
  profileSubtitle: {
    color: 'rgba(202,211,239,0.66)',
    fontSize: 11.5,
    marginTop: 4,
  },
  profileTopRow: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  profileViewActionWrap: { width: '54%' },
  resultCopy: { flex: 1, minWidth: 0 },
  resultCount: {
    color: 'rgba(235,239,255,0.88)',
    fontSize: 12,
    fontWeight: '800',
  },
  rightSheen: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 180,
    width: '44%',
  },
  screen: { backgroundColor: '#030711', flex: 1 },
  searchInput: {
    color: liquidColors.text.primary,
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    minWidth: 0,
    paddingVertical: 0,
  },
  searchRow: { flexDirection: 'row' },
  searchSurface: { flex: 1 },
  searchSurfaceContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minHeight: 41,
    paddingHorizontal: 13,
  },
  selectedCard: { opacity: 0.97, transform: [{ scale: 0.997 }] },
  selectedPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(126,76,238,0.80)',
    borderColor: 'rgba(234,220,255,0.42)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  selectedPillText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' },
  setCardContent: { paddingHorizontal: 13, paddingVertical: 13 },
  setCopy: { flex: 1, minWidth: 0 },
  setImage: { height: '100%', width: '100%' },
  setImageShell: {
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 66,
    overflow: 'hidden',
    width: 66,
  },
  setTitle: {
    color: liquidColors.text.primary,
    flex: 1,
    fontSize: 15.5,
    fontWeight: '900',
    lineHeight: 18,
  },
  setTopRow: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  sortButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(13,18,36,0.58)',
    borderColor: 'rgba(217,224,247,0.12)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 5,
    maxWidth: '46%',
    minHeight: 29,
    paddingHorizontal: 8,
  },
  sortLabel: {
    color: 'rgba(224,229,249,0.76)',
    flexShrink: 1,
    fontSize: 10.5,
    fontWeight: '700',
  },
  sortOption: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingHorizontal: 11,
  },
  sortOptionActive: { backgroundColor: 'rgba(127,78,228,0.18)' },
  sortOptionText: {
    color: 'rgba(207,216,242,0.66)',
    fontSize: 11,
    fontWeight: '600',
  },
  sortOptionTextActive: { color: '#E5D7FF', fontWeight: '800' },
  sortPanel: { gap: 2, padding: 7 },
  sortPanelWrap: { marginBottom: 8, marginTop: -4 },
  stackAvatar: {
    borderColor: 'rgba(233,237,255,0.56)',
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    width: 30,
  },
  stackAvatarOverlap: { marginLeft: -8 },
  stackSurplus: {
    alignItems: 'center',
    backgroundColor: 'rgba(36,43,73,0.94)',
    borderColor: 'rgba(220,225,255,0.12)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    marginLeft: -6,
    minWidth: 36,
    paddingHorizontal: 7,
  },
  stackSurplusText: {
    color: 'rgba(238,240,255,0.84)',
    fontSize: 10.5,
    fontWeight: '900',
  },
  statusGuard: { left: 0, position: 'absolute', right: 0, top: 0, zIndex: 8 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tinyTag: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tinyTagText: { fontSize: 9.5, fontWeight: '700' },
  titleBadgeRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  toneBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  toneBadgeText: { fontSize: 9, fontWeight: '800' },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 11,
    paddingBottom: 8,
  },
  topSheen: { height: 480, left: 0, position: 'absolute', right: 0, top: 0 },
  vibeBottom: { bottom: 13, left: 14, position: 'absolute', right: 14 },
  vibeCard: {
    borderColor: 'rgba(220,225,255,0.12)',
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
  },
  vibeArtwork: { bottom: 0, position: 'absolute', right: 0, top: 0 },
  vibeBackdrop: {
    bottom: 0,
    left: 0,
    opacity: 0.42,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  vibeMeta: {
    color: 'rgba(226,230,247,0.76)',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 3,
  },
  vibeTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  vibeSelection: {
    alignItems: 'flex-end',
    left: 12,
    position: 'absolute',
    right: 12,
    top: 12,
  },
});
