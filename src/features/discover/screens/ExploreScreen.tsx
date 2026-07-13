import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useDeferredValue } from 'react';
import {
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Text as RNText,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appRoutes } from '@/app-shell/navigation/routes';
import {
  LiquidButton,
  LiquidCard,
  LiquidGlassSurface,
} from '@/shared/components/liquid';
import { liquidColors, liquidLayout } from '@/shared/theme/liquid-glass.tokens';

import { DiscoverSetCard } from '../components/DiscoverSetCard';
import { DiscoverQueryState } from '../components/DiscoverQueryState';
import type {
  DiscoverFilterChip,
  DiscoverFilterId,
  DiscoverMetricCard,
  DiscoverProfileCard,
  DiscoverVibeCard,
} from '../model/discover-domain';
import {
  countDiscoverResults,
  useDiscoverStore,
} from '../model/discover-store';
import {
  useDiscoverOverviewQuery,
  useInvitePlayerMutation,
} from '../queries/discover-queries';

type IconName = keyof typeof Ionicons.glyphMap;

type Tone = 'cyan' | 'mint' | 'orange' | 'pink' | 'purple';

type DiscoverTextProps = TextProps;

function DiscoverText(props: DiscoverTextProps) {
  return <RNText maxFontSizeMultiplier={1} {...props} />;
}

const toneColors: Record<
  Tone,
  { background: string; border: string; glow: string; text: string }
> = {
  cyan: {
    background: 'rgba(41,183,255,0.13)',
    border: 'rgba(92,220,255,0.28)',
    glow: 'rgba(43,199,255,0.23)',
    text: '#85E8FF',
  },
  mint: {
    background: 'rgba(16,226,171,0.12)',
    border: 'rgba(73,255,205,0.24)',
    glow: 'rgba(24,238,181,0.22)',
    text: '#72F6D4',
  },
  orange: {
    background: 'rgba(255,133,46,0.12)',
    border: 'rgba(255,160,82,0.24)',
    glow: 'rgba(255,132,48,0.17)',
    text: '#FFB36C',
  },
  pink: {
    background: 'rgba(255,80,154,0.12)',
    border: 'rgba(255,121,180,0.25)',
    glow: 'rgba(255,77,151,0.18)',
    text: '#FF8DBD',
  },
  purple: {
    background: 'rgba(142,82,255,0.16)',
    border: 'rgba(201,155,255,0.32)',
    glow: 'rgba(160,91,255,0.24)',
    text: '#D9C2FF',
  },
};

const VIBE_CARD_HEIGHT = 134;

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const activeFilterIds = useDiscoverStore((state) => state.activeFilterIds);
  const filtersExpanded = useDiscoverStore((state) => state.filtersExpanded);
  const query = useDiscoverStore((state) => state.query);
  const selectedVibeId = useDiscoverStore((state) => state.selectedVibeId);
  const clearQuery = useDiscoverStore((state) => state.clearQuery);
  const resetCriteria = useDiscoverStore((state) => state.resetCriteria);
  const selectVibe = useDiscoverStore((state) => state.selectVibe);
  const setQuery = useDiscoverStore((state) => state.setQuery);
  const toggleFilter = useDiscoverStore((state) => state.toggleFilter);
  const toggleFiltersExpanded = useDiscoverStore(
    (state) => state.toggleFiltersExpanded,
  );
  const deferredQuery = useDeferredValue(query);
  const compact = width < 390;
  const horizontalPadding = compact ? 15 : 20;
  const vibeCardWidth = Math.min(
    compact ? 144 : 154,
    Math.max(136, width * 0.38),
  );
  const overviewQuery = useDiscoverOverviewQuery({
    facetIds: activeFilterIds.filter(
      (filterId): filterId is Exclude<DiscoverFilterId, 'all'> =>
        filterId !== 'all',
    ),
    previewLimit: 3,
    query: deferredQuery,
  });
  const overview = overviewQuery.data;
  const filteredContent = {
    profiles: overview?.profiles ?? [],
    sets: overview?.sets ?? [],
    vibes: overview?.vibes ?? [],
  };
  const discoverFilterChips = overview?.filterChips ?? [];
  const discoverMetricCards = overview?.metrics ?? [];
  const resultCount = countDiscoverResults(filteredContent);
  const hasResults = resultCount > 0;
  const activeFilterLabels = discoverFilterChips
    .filter((chip) => chip.id !== 'all' && activeFilterIds.includes(chip.id))
    .map((chip) => chip.label);
  const criteriaActive = activeFilterIds.length > 0 || query.trim().length > 0;
  const searchUpdating = deferredQuery !== query;

  if (!overview) {
    return (
      <DiscoverQueryState
        error={overviewQuery.error}
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <BackgroundAtmosphere />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: liquidLayout.bottomNavSpacer + insets.bottom + 32,
            paddingTop: Math.max(insets.top + 4, 20),
          },
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Header horizontalPadding={horizontalPadding} />
        <SearchAndFilters
          activeFilterCount={activeFilterIds.length}
          filtersExpanded={filtersExpanded}
          horizontalPadding={horizontalPadding}
          onChangeQuery={setQuery}
          onClearQuery={clearQuery}
          onToggleFilters={toggleFiltersExpanded}
          query={query}
        />
        {filtersExpanded ? (
          <>
            <ChipRow
              activeFilterIds={activeFilterIds}
              chips={discoverFilterChips}
              horizontalPadding={horizontalPadding}
              onToggle={toggleFilter}
            />
            <FilterSummary
              activeFilterLabels={activeFilterLabels}
              criteriaActive={criteriaActive}
              horizontalPadding={horizontalPadding}
              isUpdating={searchUpdating}
              onReset={resetCriteria}
              query={query}
              resultCount={resultCount}
            />
          </>
        ) : null}
        {hasResults ? (
          <>
            {filteredContent.vibes.length ? (
              <>
                <SectionHeader
                  horizontalPadding={horizontalPadding}
                  icon="flame"
                  iconTone="pink"
                  onShowAll={() => router.push(appRoutes.discover.vibes)}
                  title="Vibe hot tối nay"
                />
                <ScrollView
                  contentContainerStyle={[
                    styles.vibeList,
                    {
                      paddingHorizontal: horizontalPadding,
                      paddingRight: horizontalPadding + 6,
                    },
                  ]}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {filteredContent.vibes.map((card) => (
                    <VibeCard
                      card={card}
                      key={card.id}
                      onPress={() => selectVibe(card.id)}
                      selected={selectedVibeId === card.id}
                      width={vibeCardWidth}
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}
            {filteredContent.sets.length ? (
              <>
                <SectionHeader
                  horizontalPadding={horizontalPadding}
                  icon="people-outline"
                  iconTone="purple"
                  onShowAll={() => router.push(appRoutes.discover.sets)}
                  title="Set đang cần người"
                  titleLines={2}
                />
                <View style={styles.sectionStack}>
                  {filteredContent.sets.map((card) => (
                    <DiscoverSetCard
                      card={card}
                      compact={compact}
                      key={card.id}
                    />
                  ))}
                </View>
              </>
            ) : null}
            {filteredContent.profiles.length ? (
              <>
                <SectionHeader
                  horizontalPadding={horizontalPadding}
                  icon="heart-outline"
                  iconTone="purple"
                  onShowAll={() => router.push(appRoutes.discover.matches)}
                  title="Hợp vibe với bạn"
                />
                <View style={styles.sectionStack}>
                  {filteredContent.profiles.map((card) => (
                    <ProfileMatchCard
                      card={card}
                      compact={compact}
                      key={card.id}
                    />
                  ))}
                </View>
              </>
            ) : null}
            {!criteriaActive ? (
              <>
                <SectionHeader
                  horizontalPadding={horizontalPadding}
                  icon="trending-up-outline"
                  iconTone="purple"
                  title="Hot hôm nay"
                />
                <View
                  style={[
                    styles.metricsRow,
                    { paddingHorizontal: horizontalPadding },
                  ]}
                >
                  {discoverMetricCards.map((metric) => (
                    <MetricCard key={metric.id} metric={metric} />
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : (
          <DiscoverEmptyState
            activeFilterLabels={activeFilterLabels}
            onReset={resetCriteria}
            query={query}
          />
        )}
      </ScrollView>
      <LinearGradient
        colors={[
          'rgba(3,7,17,0.98)',
          'rgba(3,7,17,0.80)',
          'rgba(3,7,17,0.34)',
          'rgba(3,7,17,0)',
        ]}
        pointerEvents="none"
        style={[
          styles.statusBarGuard,
          { height: Math.max(insets.top + 52, 88) },
        ]}
      />
    </View>
  );
}

function BackgroundAtmosphere() {
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
        colors={['rgba(43,205,255,0)', 'rgba(43,205,255,0.08)']}
        end={{ x: 1, y: 0.5 }}
        start={{ x: 0, y: 0.5 }}
        style={styles.rightEdgeSheen}
      />
    </View>
  );
}

function Header({ horizontalPadding }: { horizontalPadding: number }) {
  return (
    <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
      <DiscoverText accessibilityRole="header" style={styles.headerTitle}>
        Khám phá
      </DiscoverText>
    </View>
  );
}

function SearchAndFilters({
  activeFilterCount,
  filtersExpanded,
  horizontalPadding,
  onChangeQuery,
  onClearQuery,
  onToggleFilters,
  query,
}: {
  activeFilterCount: number;
  filtersExpanded: boolean;
  horizontalPadding: number;
  onChangeQuery: (query: string) => void;
  onClearQuery: () => void;
  onToggleFilters: () => void;
  query: string;
}) {
  return (
    <View style={[styles.searchRow, { paddingHorizontal: horizontalPadding }]}>
      <LiquidGlassSurface
        baseStrokeOpacity={0.13}
        blurIntensity={18}
        contentStyle={styles.searchSurface}
        glowIntensity="low"
        radius={18}
        style={styles.searchShell}
        variant="card"
        withInnerReflection={false}
        withShadow={false}
      >
        <Ionicons
          color="rgba(198,211,244,0.68)"
          name="search-outline"
          size={22}
        />
        <TextInput
          accessibilityHint="Tìm theo tên, vị trí, tướng hoặc phong cách chơi"
          accessibilityLabel="Tìm trong Khám phá"
          autoCapitalize="none"
          autoCorrect={false}
          maxFontSizeMultiplier={1}
          onChangeText={onChangeQuery}
          onSubmitEditing={Keyboard.dismiss}
          placeholder="Tìm người chơi, set, vibe..."
          placeholderTextColor="rgba(211,220,248,0.52)"
          returnKeyType="search"
          style={styles.searchPlaceholder}
          value={query}
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityLabel="Xoá tìm kiếm Khám phá"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClearQuery}
            style={({ pressed }) => [
              styles.searchClearButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color="rgba(211,220,248,0.62)"
              name="close-circle"
              size={18}
            />
          </Pressable>
        ) : null}
      </LiquidGlassSurface>
      <Pressable
        accessibilityHint="Mở hoặc thu gọn các tiêu chí lọc"
        accessibilityLabel={
          filtersExpanded ? 'Ẩn bộ lọc Khám phá' : 'Mở bộ lọc Khám phá'
        }
        accessibilityRole="button"
        accessibilityState={{ expanded: filtersExpanded }}
        android_ripple={null}
        hitSlop={6}
        onPress={onToggleFilters}
        style={({ pressed }) => [
          styles.sliderShell,
          filtersExpanded && styles.sliderShellActive,
          pressed && styles.pressed,
        ]}
        testID="discover-filter-toggle"
      >
        <View pointerEvents="none">
          <LiquidGlassSurface
            baseStrokeOpacity={filtersExpanded ? 0.32 : 0.13}
            blurIntensity={18}
            contentStyle={styles.sliderSurface}
            glowIntensity={filtersExpanded ? 'medium' : 'low'}
            height={40}
            radius={18}
            surfaceBackground={
              filtersExpanded ? 'rgba(78,45,142,0.46)' : 'rgba(13,18,37,0.62)'
            }
            variant="card"
            width={40}
            withInnerReflection={false}
            withShadow={false}
          >
            <Ionicons
              color={filtersExpanded ? '#E4D5FF' : 'rgba(222,230,255,0.82)'}
              name="options-outline"
              size={21}
            />
          </LiquidGlassSurface>
        </View>
        {activeFilterCount > 0 ? (
          <View
            pointerEvents="none"
            style={styles.filterCountBadge}
            testID="discover-filter-count"
          >
            <DiscoverText style={styles.filterCountText}>
              {activeFilterCount}
            </DiscoverText>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

function ChipRow({
  activeFilterIds,
  chips,
  horizontalPadding,
  onToggle,
}: {
  activeFilterIds: readonly DiscoverFilterId[];
  chips: readonly DiscoverFilterChip[];
  horizontalPadding: number;
  onToggle: (filter: DiscoverFilterId) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.chipList,
        {
          paddingHorizontal: horizontalPadding,
          paddingRight: horizontalPadding + 8,
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
            accessibilityHint={
              chip.id === 'all'
                ? 'Xoá tất cả bộ lọc đang chọn'
                : 'Có thể chọn cùng lúc nhiều bộ lọc'
            }
            accessibilityLabel={`Lọc Khám phá theo ${chip.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            android_ripple={null}
            key={chip.id}
            onPress={() => onToggle(chip.id)}
            style={({ pressed }) => [
              styles.filterChip,
              selected && styles.filterChipActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={selected ? '#FFFFFF' : 'rgba(220,226,248,0.78)'}
              name={chip.icon as IconName}
              size={17}
            />
            <DiscoverText
              style={[styles.filterChipText, selected && styles.chipTextActive]}
            >
              {chip.label}
            </DiscoverText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function FilterSummary({
  activeFilterLabels,
  criteriaActive,
  horizontalPadding,
  isUpdating,
  onReset,
  query,
  resultCount,
}: {
  activeFilterLabels: readonly string[];
  criteriaActive: boolean;
  horizontalPadding: number;
  isUpdating: boolean;
  onReset: () => void;
  query: string;
  resultCount: number;
}) {
  const filterLabel = activeFilterLabels.length
    ? activeFilterLabels.join(' + ')
    : 'Tất cả nội dung';

  return (
    <View
      style={[styles.filterSummary, { marginHorizontal: horizontalPadding }]}
    >
      <View style={styles.filterSummaryCopy}>
        <DiscoverText style={styles.filterSummaryLabel}>
          {isUpdating ? 'Đang cập nhật…' : `${resultCount} kết quả`}
        </DiscoverText>
        <DiscoverText numberOfLines={1} style={styles.filterSummaryQuery}>
          {filterLabel}
          {query.trim() ? ` · “${query.trim()}”` : ''}
        </DiscoverText>
      </View>
      {criteriaActive ? (
        <Pressable
          accessibilityLabel="Đặt lại bộ lọc Khám phá"
          accessibilityRole="button"
          onPress={onReset}
          style={({ pressed }) => [
            styles.filterSummaryReset,
            pressed && styles.pressed,
          ]}
        >
          <DiscoverText style={styles.filterSummaryResetText}>
            Đặt lại
          </DiscoverText>
        </Pressable>
      ) : null}
    </View>
  );
}

function SectionHeader({
  horizontalPadding,
  icon,
  iconTone,
  onShowAll,
  title,
  titleLines = 1,
}: {
  horizontalPadding: number;
  icon: IconName;
  iconTone: Tone;
  onShowAll?: () => void;
  title: string;
  titleLines?: 1 | 2;
}) {
  const tone = toneColors[iconTone];
  return (
    <View
      style={[styles.sectionHeader, { paddingHorizontal: horizontalPadding }]}
    >
      <View style={[styles.sectionIconGlow, { shadowColor: tone.text }]}>
        <Ionicons color={tone.text} name={icon} size={22} />
      </View>
      <DiscoverText numberOfLines={titleLines} style={styles.sectionTitle}>
        {title}
      </DiscoverText>
      <View style={styles.sectionSpacer} />
      {onShowAll ? (
        <Pressable
          accessibilityLabel={`Xem tất cả ${title}`}
          accessibilityRole="button"
          onPress={onShowAll}
          style={({ pressed }) => [
            styles.seeAllButton,
            pressed && styles.pressed,
          ]}
        >
          <DiscoverText numberOfLines={1} style={styles.seeAllText}>
            Xem tất cả
          </DiscoverText>
          <Ionicons
            color="rgba(214,222,246,0.44)"
            name="chevron-forward"
            size={14}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function VibeCard({
  card,
  onPress,
  selected,
  width,
}: {
  card: DiscoverVibeCard;
  onPress: () => void;
  selected: boolean;
  width: number;
}) {
  return (
    <Pressable
      accessibilityLabel={`Chọn vibe ${card.title}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      android_ripple={null}
      onPress={onPress}
      style={({ pressed }) => [
        styles.vibeCard,
        selected && styles.vibeCardSelected,
        { width },
        pressed && styles.pressed,
      ]}
      testID={`vibe-card-${card.title}`}
    >
      <Image
        resizeMode="cover"
        source={card.background}
        style={[
          styles.vibeBackgroundLayer,
          { height: VIBE_CARD_HEIGHT, width },
        ]}
        testID={`vibe-background-${card.title}`}
      />
      <LinearGradient
        colors={[
          'rgba(4,7,16,0.03)',
          'rgba(4,7,16,0.08)',
          'rgba(4,7,16,0.54)',
          'rgba(4,7,16,0.94)',
        ]}
        end={{ x: 0.5, y: 1 }}
        locations={[0, 0.42, 0.7, 1]}
        pointerEvents="none"
        start={{ x: 0.5, y: 0 }}
        style={styles.vibeGradientLayer}
        testID={`vibe-gradient-${card.title}`}
      />
      <View
        style={styles.vibeContentCluster}
        testID={`vibe-content-${card.title}`}
      >
        <View style={styles.vibeTextBlock}>
          <DiscoverText numberOfLines={1} style={styles.vibeTitle}>
            {card.title}
          </DiscoverText>
          <DiscoverText numberOfLines={1} style={styles.vibeMeta}>
            {card.interestedLabel}
          </DiscoverText>
        </View>
        <View style={styles.vibeAvatarWrap}>
          <AvatarStack
            size="compact"
            sources={card.participantSources}
            surplus={card.surplusLabel}
          />
        </View>
      </View>
      {selected ? (
        <View style={styles.selectedBadge}>
          <Ionicons color="#FFFFFF" name="checkmark" size={12} />
        </View>
      ) : null}
    </Pressable>
  );
}

function ProfileMatchCard({
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
  const inviting =
    inviteMutation.isPending && inviteMutation.variables?.profileId === card.id;
  const invited = card.actionState === 'pending' || inviting;
  const visibleTags = card.tags.slice(0, compact ? 1 : 2);
  const actionText =
    card.actionKind === 'invite'
      ? invited
        ? 'Đã mời'
        : card.actionLabel
      : selected
        ? 'Đang xem'
        : card.actionLabel;
  const onAction = () => {
    if (card.actionKind === 'invite' && card.targetSetId) {
      inviteMutation.mutate({ profileId: card.id, setId: card.targetSetId });
      return;
    }
    openProfile(card.id);
  };

  return (
    <LiquidCard
      baseStrokeOpacity={0.11}
      contentStyle={[
        styles.profileCardContent,
        compact && styles.profileCardContentCompact,
      ]}
      density="compact"
      glowIntensity="low"
      radius={22}
      style={[styles.fullCard, selected && styles.fullCardSelected]}
      surfaceBackground={
        card.actionTone === 'cyan'
          ? 'rgba(6,25,44,0.56)'
          : 'rgba(15,16,42,0.58)'
      }
      variant={card.actionTone}
      withInnerReflection={false}
      withShadow={false}
    >
      <View style={styles.profileAvatarShell}>
        <Image source={card.avatar} style={styles.profileAvatar} />
        {card.online ? <View style={styles.onlineDot} /> : null}
      </View>

      <View style={styles.profileBody}>
        <View style={styles.profileNameRow}>
          <DiscoverText numberOfLines={1} style={styles.profileName}>
            {card.name}
          </DiscoverText>
          <Ionicons
            color="rgba(127,139,255,0.82)"
            name="shield-checkmark"
            size={14}
          />
        </View>
        <DiscoverText numberOfLines={1} style={styles.profileSubtitle}>
          {card.subtitle}
        </DiscoverText>
        <View style={styles.tagRow}>
          {visibleTags.map((tag, index) => (
            <TinyTag
              key={tag}
              label={tag}
              tone={index === 0 ? card.actionTone : 'purple'}
            />
          ))}
        </View>
      </View>

      <View style={styles.profileActions}>
        <View style={styles.profileMatchPill}>
          <Ionicons color="rgba(163,108,255,0.76)" name="heart" size={10} />
          <DiscoverText numberOfLines={1} style={styles.profileMatchText}>
            {card.match}
          </DiscoverText>
        </View>
        <View style={styles.profileActionRow}>
          <Pressable
            accessibilityLabel={`Nhắn ${card.name}`}
            accessibilityRole="button"
            android_ripple={null}
            onPress={() => router.push(appRoutes.main.messages)}
            style={({ pressed }) => [styles.chatOrb, pressed && styles.pressed]}
          >
            <Ionicons
              color="rgba(230,235,255,0.80)"
              name="chatbubble-ellipses-outline"
              size={17}
            />
          </Pressable>
          <LiquidButton
            accessibilityLabel={`${card.actionLabel} ${card.name}`}
            contentStyle={styles.profileButtonContent}
            disabled={card.actionKind === 'invite' && invited}
            glowIntensity="low"
            onPress={onAction}
            radius={16}
            style={styles.profileButton}
            variant={card.actionTone === 'cyan' ? 'rank' : 'primary'}
            withShadow={false}
          >
            <DiscoverText numberOfLines={1} style={styles.profileButtonText}>
              {actionText}
            </DiscoverText>
          </LiquidButton>
        </View>
      </View>
    </LiquidCard>
  );
}

function DiscoverEmptyState({
  activeFilterLabels,
  onReset,
  query,
}: {
  activeFilterLabels: readonly string[];
  onReset: () => void;
  query: string;
}) {
  const criteria = [
    query.trim() ? `“${query.trim()}”` : null,
    activeFilterLabels.length ? activeFilterLabels.join(' + ') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <LiquidCard
      contentStyle={styles.emptyContent}
      density="compact"
      glowIntensity="low"
      radius={22}
      style={styles.emptyCard}
      withShadow={false}
    >
      <Ionicons color="rgba(190,203,242,0.74)" name="search" size={24} />
      <DiscoverText style={styles.emptyTitle}>
        Không có kết quả phù hợp
      </DiscoverText>
      <DiscoverText style={styles.emptyText}>
        {criteria
          ? `Không tìm thấy nội dung cho ${criteria}.`
          : 'Thử từ khoá hoặc bộ lọc khác.'}
      </DiscoverText>
      <Pressable
        accessibilityLabel="Đặt lại tìm kiếm Khám phá"
        accessibilityRole="button"
        onPress={onReset}
        style={({ pressed }) => [styles.emptyReset, pressed && styles.pressed]}
      >
        <DiscoverText style={styles.emptyResetText}>Đặt lại</DiscoverText>
      </Pressable>
    </LiquidCard>
  );
}

function MetricCard({ metric }: { metric: DiscoverMetricCard }) {
  const tone = toneColors[metric.accent];
  return (
    <LiquidCard
      baseStrokeOpacity={0.09}
      contentStyle={styles.metricCardContent}
      density="compact"
      glowIntensity="low"
      radius={22}
      style={styles.metricCard}
      surfaceBackground="rgba(10,18,36,0.56)"
      withInnerReflection={false}
      withShadow={false}
    >
      <View
        style={[
          styles.metricIcon,
          {
            backgroundColor: tone.background,
            borderColor: tone.border,
            shadowColor: tone.text,
          },
        ]}
      >
        {metric.accent === 'mint' ? (
          <View style={styles.metricOnlineOrb} />
        ) : (
          <Ionicons
            color={tone.text}
            name={metric.accent === 'pink' ? 'game-controller' : 'people'}
            size={20}
          />
        )}
      </View>
      <View style={styles.metricTextBlock}>
        <DiscoverText numberOfLines={1} style={styles.metricTitle}>
          {metric.title}
        </DiscoverText>
        <DiscoverText numberOfLines={1} style={styles.metricLabel}>
          {metric.label}
        </DiscoverText>
      </View>
    </LiquidCard>
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

function AvatarStack({
  size = 'regular',
  sources,
  surplus,
}: {
  size?: 'compact' | 'regular';
  sources: readonly ImageSourcePropType[];
  surplus?: string;
}) {
  const compact = size === 'compact';
  return (
    <View style={[styles.avatarStack, compact && styles.avatarStackCompact]}>
      {sources.map((source, index) => (
        <Image
          key={index}
          source={source}
          style={[
            styles.stackAvatar,
            compact && styles.stackAvatarCompact,
            index > 0 &&
              (compact
                ? styles.stackAvatarOverlapCompact
                : styles.stackAvatarOverlap),
          ]}
        />
      ))}
      {surplus ? (
        <View
          style={[styles.stackSurplus, compact && styles.stackSurplusCompact]}
        >
          <DiscoverText
            style={[
              styles.stackSurplusText,
              compact && styles.stackSurplusTextCompact,
            ]}
          >
            {surplus}
          </DiscoverText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyCard: { marginHorizontal: 18, marginTop: 22 },
  emptyContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  emptyReset: {
    backgroundColor: 'rgba(117,79,220,0.22)',
    borderColor: 'rgba(199,168,255,0.22)',
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 13,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  emptyResetText: {
    color: 'rgba(242,238,255,0.90)',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    color: 'rgba(196,207,238,0.62)',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
    textAlign: 'center',
  },
  emptyTitle: {
    color: liquidColors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  filterSummary: {
    alignItems: 'center',
    backgroundColor: 'rgba(12,18,38,0.54)',
    borderColor: 'rgba(161,145,230,0.14)',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  filterSummaryCopy: { flex: 1, minWidth: 0 },
  filterSummaryLabel: {
    color: 'rgba(230,234,252,0.82)',
    fontSize: 10.5,
    fontWeight: '700',
  },
  filterSummaryQuery: {
    color: 'rgba(194,205,236,0.58)',
    fontSize: 9.5,
    marginTop: 2,
  },
  filterSummaryReset: {
    borderColor: 'rgba(208,188,255,0.18)',
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  filterSummaryResetText: {
    color: 'rgba(222,209,255,0.82)',
    fontSize: 9.5,
    fontWeight: '700',
  },
  fullCardSelected: {
    opacity: 0.96,
    transform: [{ scale: 0.995 }],
  },
  selectedBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(128,82,239,0.88)',
    borderColor: 'rgba(232,218,255,0.54)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 20,
  },
  avatarStack: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 14,
  },
  avatarStackCompact: {
    justifyContent: 'flex-start',
    marginBottom: 0,
    marginTop: 9,
  },
  chatOrb: {
    alignItems: 'center',
    backgroundColor: 'rgba(14,18,34,0.58)',
    borderColor: 'rgba(225,234,255,0.13)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  chipList: {
    gap: 8,
    paddingHorizontal: 22,
    paddingRight: 30,
  },
  chipTextActive: { color: '#FFFFFF', fontWeight: '700' },
  compactButtonContent: {
    minHeight: 27,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
  },
  compactButtonText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' },
  content: {
    paddingHorizontal: 0,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(14,18,34,0.56)',
    borderColor: 'rgba(221,230,255,0.10)',
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 32,
    overflow: 'hidden',
    paddingHorizontal: 11,
  },
  filterChipActive: {
    backgroundColor: 'rgba(132,72,255,0.58)',
    borderColor: 'rgba(219,191,255,0.48)',
    shadowColor: '#A36CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
  },
  filterChipText: {
    color: 'rgba(220,226,248,0.70)',
    fontSize: 12,
    fontWeight: '600',
  },
  fullCard: { marginHorizontal: 18 },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    paddingHorizontal: 22,
  },
  headerTitle: {
    color: liquidColors.text.primary,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  matchCenter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginLeft: 8,
    minWidth: 96,
  },
  matchText: {
    color: '#C9B2FF',
    fontSize: 12,
    fontWeight: '800',
  },
  metaDot: { color: liquidColors.text.muted, fontSize: 12 },
  metricCard: { flex: 1, minWidth: 0 },
  metricCardContent: {
    alignItems: 'center',
    gap: 6,
    minHeight: 80,
    paddingHorizontal: 7,
    paddingVertical: 8,
  },
  metricIcon: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    width: 36,
  },
  metricLabel: {
    color: liquidColors.text.secondary,
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1,
    textAlign: 'center',
  },
  metricOnlineOrb: {
    backgroundColor: '#18EFB6',
    borderRadius: 999,
    height: 18,
    shadowColor: '#18EFB6',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 10,
    width: 18,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 22,
  },
  metricTextBlock: { alignItems: 'center', minWidth: 0, width: '100%' },
  metricTitle: {
    color: liquidColors.text.primary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  micText: { color: 'rgba(112,244,208,0.88)', fontSize: 11, fontWeight: '600' },
  onlineDot: {
    backgroundColor: '#17F4B7',
    borderColor: '#07111D',
    borderRadius: 999,
    borderWidth: 1.5,
    bottom: 3,
    height: 10,
    left: 3,
    position: 'absolute',
    width: 10,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  profileAvatar: { height: '100%', width: '100%' },
  profileActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    width: '100%',
  },
  profileActions: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 5,
    width: 112,
  },
  profileAvatarShell: {
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    height: 56,
    overflow: 'hidden',
    width: 56,
  },
  profileBody: { flex: 1, justifyContent: 'center', minWidth: 0 },
  profileButton: { flex: 1, minWidth: 0 },
  profileButtonContent: {
    minHeight: 32,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  profileButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  profileCardContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 88,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  profileCardContentCompact: {
    gap: 8,
    minHeight: 88,
    paddingHorizontal: 10,
  },
  profileMatchPill: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(126,86,255,0.075)',
    borderColor: 'rgba(197,166,255,0.13)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    minHeight: 18,
    paddingHorizontal: 5,
  },
  profileMatchText: {
    color: 'rgba(205,185,255,0.84)',
    fontSize: 9,
    fontWeight: '800',
  },
  profileName: {
    color: liquidColors.text.primary,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.25,
  },
  profileNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minWidth: 0,
  },
  profileSubtitle: {
    color: liquidColors.text.secondary,
    fontSize: 12,
    marginTop: 2,
  },
  rightEdgeSheen: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 120,
    width: 180,
  },
  screen: { backgroundColor: '#030711', flex: 1 },
  statusBarGuard: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 5,
  },
  searchClearButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    marginRight: -5,
    width: 28,
  },
  searchPlaceholder: {
    color: 'rgba(211,220,248,0.66)',
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 22,
  },
  searchShell: { flex: 1 },
  searchSurface: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 36,
    paddingHorizontal: 11,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 9,
    marginTop: 18,
    paddingHorizontal: 22,
  },
  sectionIconGlow: {
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  sectionSpacer: { flex: 1 },
  sectionStack: { gap: 10 },
  sectionTitle: {
    color: liquidColors.text.primary,
    flexShrink: 1,
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.32,
  },
  seeAllButton: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  seeAllText: {
    color: 'rgba(198,207,232,0.66)',
    fontSize: 10,
    fontWeight: '600',
  },
  setActionButton: { minWidth: 70 },
  setBody: { flex: 1, minWidth: 0 },
  setCompactRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  setTrailingCompact: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 62,
  },
  setCardContent: {
    minHeight: 98,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  setCardContentCompact: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  setImage: { height: '100%', width: '100%' },
  setImageShell: {
    borderColor: 'rgba(212,223,255,0.20)',
    borderRadius: 999,
    borderWidth: 1,
    height: 46,
    overflow: 'hidden',
    width: 46,
  },
  setMeta: {
    color: liquidColors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  setMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    marginTop: 3,
  },
  setTitle: {
    color: liquidColors.text.primary,
    flex: 1,
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: -0.28,
    lineHeight: 15,
  },
  setTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minWidth: 0,
  },
  sliderShell: {
    borderRadius: 18,
    position: 'relative',
    width: 40,
  },
  sliderShellActive: {
    shadowColor: '#A36CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
  },
  filterCountBadge: {
    alignItems: 'center',
    backgroundColor: '#8C5BFF',
    borderColor: 'rgba(242,234,255,0.78)',
    borderRadius: 8,
    borderWidth: 1,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -5,
    top: -5,
  },
  filterCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  sliderSurface: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    padding: 0,
  },
  stackAvatar: {
    borderColor: 'rgba(232,238,255,0.38)',
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    width: 30,
  },
  stackAvatarCompact: {
    borderColor: 'rgba(245,248,255,0.62)',
    borderWidth: 1.2,
    height: 21,
    width: 21,
  },
  stackAvatarOverlap: { marginLeft: -9 },
  stackAvatarOverlapCompact: { marginLeft: -6 },
  stackSurplus: {
    alignItems: 'center',
    backgroundColor: 'rgba(31,36,62,0.86)',
    borderColor: 'rgba(220,228,255,0.16)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    marginLeft: -9,
    minWidth: 30,
    paddingHorizontal: 7,
  },
  stackSurplusCompact: {
    height: 21,
    marginLeft: -5,
    minWidth: 28,
    paddingHorizontal: 7,
  },
  stackSurplusText: {
    color: liquidColors.text.secondary,
    fontSize: 11,
    fontWeight: '800',
  },
  stackSurplusTextCompact: {
    color: 'rgba(237,242,255,0.84)',
    fontSize: 10,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  tagRowTight: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  tinyTag: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
    maxWidth: '100%',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tinyTagText: { fontSize: 9, fontWeight: '700' },
  toneBadge: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 3,
    paddingHorizontal: 3.25,
    paddingVertical: 1.75,
  },
  toneBadgeText: { fontSize: 7.6, fontWeight: '800' },
  topSheen: {
    height: 260,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  vibeAvatarWrap: { marginTop: 4 },
  vibeBackgroundLayer: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  vibeCard: {
    backgroundColor: 'rgba(4,7,16,0.92)',
    borderColor: 'rgba(204,222,255,0.18)',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    height: VIBE_CARD_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
  },
  vibeCardSelected: {
    borderColor: 'rgba(211,183,255,0.66)',
    borderWidth: 1,
  },
  vibeContentCluster: {
    bottom: 0,
    left: 0,
    padding: 11,
    position: 'absolute',
    right: 0,
  },
  vibeGradientLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  vibeList: {
    gap: 10,
    paddingHorizontal: 22,
    paddingRight: 28,
  },
  vibeMeta: {
    color: 'rgba(239,243,255,0.78)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.48)',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 3,
  },
  vibeTextBlock: { justifyContent: 'flex-end' },
  vibeTitle: {
    color: liquidColors.text.primary,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.34,
    textShadowColor: 'rgba(0,0,0,0.62)',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 4,
  },
});
