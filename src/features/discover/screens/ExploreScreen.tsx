import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useDeferredValue } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Text as RNText,
  View,
  useWindowDimensions,
  type TextProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appRoutes } from '@/app-shell/navigation/routes';
import { LiqiButton, LiqiCard, LiqiSurface } from '@/shared/components/liqi';
import { liqiComponents } from '@/shared/theme/liqi-design-system';

import { DiscoverSetCard } from '../components/DiscoverSetCard';
import { DiscoverMatchIntentGate } from '../components/DiscoverMatchIntentGate';
import { useDiscoverCapabilities } from '../runtime/DiscoverRepositoryProvider';
import {
  DiscoverQueryState,
  DiscoverStaleBanner,
} from '../components/DiscoverQueryState';
import { DiscoverResolvedImage } from '../components/DiscoverResolvedImage';
import { exploreStyles as styles, VIBE_CARD_HEIGHT } from './explore.styles';
import type {
  DiscoverFilterChip,
  DiscoverFilterId,
  DiscoverMetricCard,
  DiscoverProfileCard,
  DiscoverResolvedMedia,
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

export function ExploreScreen() {
  return (
    <DiscoverMatchIntentGate>
      <ExploreContent />
    </DiscoverMatchIntentGate>
  );
}

function ExploreContent() {
  const capabilities = useDiscoverCapabilities().overview;
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
    facetIds: capabilities.filters
      ? activeFilterIds.filter(
          (filterId): filterId is Exclude<DiscoverFilterId, 'all'> =>
            filterId !== 'all',
        )
      : [],
    previewLimit: 3,
    query: capabilities.search ? deferredQuery : '',
  });
  const overview = overviewQuery.data;
  const filteredContent = {
    profiles: overview?.profiles ?? [],
    sets: overview?.sets ?? [],
    vibes: capabilities.vibes ? (overview?.vibes ?? []) : [],
  };
  const discoverFilterChips = overview?.filterChips ?? [];
  const discoverMetricCards = overview?.metrics ?? [];
  const resultCount = countDiscoverResults(filteredContent);
  const hasResults = resultCount > 0;
  const activeFilterLabels = discoverFilterChips
    .filter((chip) => chip.id !== 'all' && activeFilterIds.includes(chip.id))
    .map((chip) => chip.label);
  const criteriaActive =
    (capabilities.filters && activeFilterIds.length > 0) ||
    (capabilities.search && query.trim().length > 0);
  const searchUpdating = capabilities.search && deferredQuery !== query;

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
            paddingBottom:
              liqiComponents.screen.bottomNavSpacer + insets.bottom + 32,
            paddingTop: Math.max(insets.top + 4, 20),
          },
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Header horizontalPadding={horizontalPadding} />
        {overviewQuery.isError ? <DiscoverStaleBanner /> : null}
        {capabilities.search || capabilities.filters ? (
          <SearchAndFilters
            activeFilterCount={
              capabilities.filters ? activeFilterIds.length : 0
            }
            filtersExpanded={capabilities.filters && filtersExpanded}
            horizontalPadding={horizontalPadding}
            onChangeQuery={capabilities.search ? setQuery : () => undefined}
            onClearQuery={clearQuery}
            onToggleFilters={
              capabilities.filters ? toggleFiltersExpanded : () => undefined
            }
            query={capabilities.search ? query : ''}
          />
        ) : null}
        {capabilities.filters && filtersExpanded ? (
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
      <LiqiSurface
        borderOpacity={0.13}
        contentStyle={styles.searchSurface}
        emphasis="low"
        radius={18}
        style={styles.searchShell}
        variant="card"
        withHighlight={false}
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
      </LiqiSurface>
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
          <LiqiSurface
            borderOpacity={filtersExpanded ? 0.32 : 0.13}
            contentStyle={styles.sliderSurface}
            emphasis={filtersExpanded ? 'medium' : 'low'}
            height={40}
            radius={18}
            backgroundColor={
              filtersExpanded ? 'rgba(78,45,142,0.46)' : 'rgba(13,18,37,0.62)'
            }
            variant="card"
            width={40}
            withHighlight={false}
            withShadow={false}
          >
            <Ionicons
              color={filtersExpanded ? '#E4D5FF' : 'rgba(222,230,255,0.82)'}
              name="options-outline"
              size={21}
            />
          </LiqiSurface>
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
      <DiscoverResolvedImage
        media={card.background}
        resizeMode="cover"
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
    router.push(
      card.playerId
        ? appRoutes.profile.playerDetail(card.playerId)
        : appRoutes.profile.detail(card.id),
    );
  };

  return (
    <LiqiCard
      borderOpacity={0.11}
      contentStyle={[
        styles.profileCardContent,
        compact && styles.profileCardContentCompact,
      ]}
      density="compact"
      emphasis="low"
      radius={22}
      style={[styles.fullCard, selected && styles.fullCardSelected]}
      backgroundColor={
        card.actionTone === 'cyan'
          ? 'rgba(6,25,44,0.56)'
          : 'rgba(15,16,42,0.58)'
      }
      variant={card.actionTone}
      withHighlight={false}
      withShadow={false}
    >
      <View style={styles.profileAvatarShell}>
        <DiscoverResolvedImage
          media={card.avatar}
          style={styles.profileAvatar}
        />
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
            onPress={() =>
              router.push(
                card.conversationId
                  ? appRoutes.messages.detail(card.conversationId)
                  : appRoutes.main.messages,
              )
            }
            style={({ pressed }) => [styles.chatOrb, pressed && styles.pressed]}
          >
            <Ionicons
              color="rgba(230,235,255,0.80)"
              name="chatbubble-ellipses-outline"
              size={17}
            />
          </Pressable>
          <LiqiButton
            accessibilityLabel={`${card.actionLabel} ${card.name}`}
            contentStyle={styles.profileButtonContent}
            disabled={card.actionKind === 'invite' && invited}
            emphasis="low"
            onPress={onAction}
            radius={16}
            style={styles.profileButton}
            variant={card.actionTone === 'cyan' ? 'rank' : 'primary'}
            withShadow={false}
          >
            <DiscoverText numberOfLines={1} style={styles.profileButtonText}>
              {actionText}
            </DiscoverText>
          </LiqiButton>
        </View>
      </View>
    </LiqiCard>
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
    <LiqiCard
      contentStyle={styles.emptyContent}
      density="compact"
      emphasis="low"
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
    </LiqiCard>
  );
}

function MetricCard({ metric }: { metric: DiscoverMetricCard }) {
  const tone = toneColors[metric.accent];
  return (
    <LiqiCard
      borderOpacity={0.09}
      contentStyle={styles.metricCardContent}
      density="compact"
      emphasis="low"
      radius={22}
      style={styles.metricCard}
      backgroundColor="rgba(10,18,36,0.56)"
      withHighlight={false}
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
    </LiqiCard>
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
  sources: readonly DiscoverResolvedMedia[];
  surplus?: string;
}) {
  const compact = size === 'compact';
  return (
    <View style={[styles.avatarStack, compact && styles.avatarStackCompact]}>
      {sources.map((source, index) => (
        <DiscoverResolvedImage
          key={index}
          media={source}
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
