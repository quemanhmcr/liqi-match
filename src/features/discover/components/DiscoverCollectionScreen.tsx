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

import { DiscoverQueryState, DiscoverStaleBanner } from './DiscoverQueryState';
import { DiscoverResolvedImage } from './DiscoverResolvedImage';
import { discoverCollectionStyles as styles } from './discover-collection.styles';

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
