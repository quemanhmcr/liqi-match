import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Activity,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  Image,
  Modal,
  ScrollView,
  View,
  type ImageSourcePropType,
} from 'react-native';

import {
  HEROES,
  HERO_DOMAIN_CATALOG,
  HERO_CLASS_CATALOG,
  heroDefinitionById,
  type HeroId,
} from '@/entities/hero';
import {
  COMEBACK_RESPONSE_CATALOG,
  COMMUNICATION_PREFERENCE_CATALOG,
  DECISION_STYLE_CATALOG,
  FEEDBACK_STYLE_CATALOG,
  GENDER_CATALOG,
  LANE_CATALOG,
  LOSS_RESPONSE_CATALOG,
  PROFILE_LIMITS,
  RANK_CATALOG,
  SERIOUSNESS_CATALOG,
  SESSION_LENGTH_CATALOG,
  STRATEGY_STYLE_CATALOG,
  TEAM_ATMOSPHERE_CATALOG,
  TEAM_GOAL_CATALOG,
  TIME_PREFERENCE_CATALOG,
  buildRecurringAvailabilityFromTimePreferences,
  catalogOptionById,
  type AvailabilityDayOfWeek,
  type HabitAnswersDraft,
  type LaneSelection,
  type LaneSlug,
  type TimePreferenceId,
} from '@/entities/player-profile';
import {
  AppButton,
  AppCard,
  AppChip,
  AppIconButton,
  AppNotice,
  AppPressableCard,
  AppSurface,
  AppText,
  AppTextField,
  appColors,
} from '@/shared/ui';

import {
  presentProfilePlayStyleHabits,
  type ProfilePlayStyleSlot,
} from '../../model/profile-play-style-presenter';
import { profileEditUi } from '../../ui/profile-edit-ui';
import { ProfilePlayStyleEditPreview } from './ProfilePlayStyleEditPreview';
import { scrollToProfilePlayStyleAnchor } from './profile-play-style-scroll';
import { profileEditExperienceStyles as styles } from './profile-edit-experience.styles';
import {
  Divider,
  EditPanel,
  FieldLabel,
  MultiOptionGroup,
  OptionWrap,
  ProfileEditAvatar,
  SingleOptionGroup,
  Subsection,
} from './ProfileEditFormPrimitives';
import {
  inferProfileEditSelectedDays,
  inferProfileEditSelectedPreferences,
  profileEditDayLabel,
  profileEditDayOptions,
  profileEditDeviceTimezone,
  profileEditFormatMinute,
  profileEditMediaPreviewUrl,
  profileEditMediaStatusLabel,
} from './profile-edit-experience-model';
import type {
  ProfileEditDraft,
  ProfileEditForm,
  ProfileEditHero,
  ProfileEditMediaSlot,
  ProfileEditSectionId,
} from '../model/profile-edit-model';

export type ProfileEditCategoryId =
  'identity' | 'game' | 'playStyle' | 'availability';

type EditCategory = Readonly<{
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  id: ProfileEditCategoryId;
  label: string;
  sections: readonly ProfileEditSectionId[];
}>;

const categories: readonly EditCategory[] = [
  {
    description: 'Ảnh, tên, bio và trạng thái',
    icon: 'person-circle-outline',
    id: 'identity',
    label: 'Hồ sơ',
    sections: ['media', 'identity'],
  },
  {
    description: 'Handle, rank, lane và tướng',
    icon: 'game-controller-outline',
    id: 'game',
    label: 'Trong game',
    sections: ['gameProfile', 'lanes', 'heroes'],
  },
  {
    description: 'Nhịp chơi và cách phối hợp',
    icon: 'sparkles-outline',
    id: 'playStyle',
    label: 'Phong cách',
    sections: ['habits'],
  },
  {
    description: 'Ngày và khung giờ thường chơi',
    icon: 'calendar-outline',
    id: 'availability',
    label: 'Lịch chơi',
    sections: ['availability'],
  },
] as const;

const statusOptions = [
  { label: 'Sẵn sàng', value: 'ready' },
  { label: 'Đang bận', value: 'busy' },
  { label: 'Offline', value: 'offline' },
  { label: 'Chỉ bạn bè', value: 'friends' },
] as const;

const heroImageById = new Map<string, ImageSourcePropType>(
  HEROES.map((hero) => [hero.id, hero.image]),
);
const fallbackHeroImage =
  require('../../../../../assets/anh_mau2/heroes/aya.webp') as ImageSourcePropType;

export {
  ProfileEditErrorState,
  ProfileEditHeader,
  ProfileEditLoadingState,
  ProfileEditSaveDock,
} from './ProfileEditExperienceChrome';

export function ProfileEditBody({
  activeCategory,
  disabled,
  dirtySections,
  draft,
  form,
  onActiveCategoryChange,
  onChange,
  onLimitReached,
  onPickMedia,
  scrollViewRef,
}: Readonly<{
  activeCategory: ProfileEditCategoryId;
  disabled: boolean;
  dirtySections: readonly ProfileEditSectionId[];
  draft: ProfileEditDraft;
  form: ProfileEditForm;
  onActiveCategoryChange: (category: ProfileEditCategoryId) => void;
  onChange: (form: ProfileEditForm) => void;
  onLimitReached: () => void;
  onPickMedia: (slot: ProfileEditMediaSlot) => void;
  scrollViewRef: RefObject<ScrollView | null>;
}>) {
  const changeHabits = useCallback(
    (habits: HabitAnswersDraft) => onChange({ ...form, habits }),
    [form, onChange],
  );
  const changeAvailability = useCallback(
    (availability: ProfileEditForm['availability']) =>
      onChange({ ...form, availability }),
    [form, onChange],
  );

  return (
    <>
      <ProfileEditPreview
        gameProfile={form.gameProfile}
        identity={form.identity}
        laneSelection={form.laneSelection}
        media={form.media}
      />
      <CategoryGrid
        activeCategory={activeCategory}
        dirtySections={dirtySections}
        onSelect={onActiveCategoryChange}
      />
      {/*
        React 19.2 Activity prepares hidden editor panels at lower priority and
        preserves their local draft state. This avoids rebuilding a dense native
        view tree on the same interaction that changes the selected category.
      */}
      <Activity
        mode={activeCategory === 'identity' ? 'visible' : 'hidden'}
        name="profile-edit-identity"
      >
        <IdentityPanel
          disabled={disabled}
          form={form}
          onChange={onChange}
          onPickMedia={onPickMedia}
        />
      </Activity>
      <Activity
        mode={activeCategory === 'game' ? 'visible' : 'hidden'}
        name="profile-edit-game"
      >
        <GamePanel
          disabled={disabled}
          draft={draft}
          form={form}
          onChange={onChange}
          onLimitReached={onLimitReached}
        />
      </Activity>
      <Activity
        mode={activeCategory === 'playStyle' ? 'visible' : 'hidden'}
        name="profile-edit-play-style"
      >
        <PlayStylePanel
          habits={form.habits}
          onChange={changeHabits}
          onLimitReached={onLimitReached}
          scrollViewRef={scrollViewRef}
        />
      </Activity>
      <Activity
        mode={activeCategory === 'availability' ? 'visible' : 'hidden'}
        name="profile-edit-availability"
      >
        <AvailabilityPanel
          availability={form.availability}
          onChange={changeAvailability}
        />
      </Activity>
    </>
  );
}

type ProfileEditPreviewProps = Readonly<{
  gameProfile: ProfileEditForm['gameProfile'];
  identity: ProfileEditForm['identity'];
  laneSelection: ProfileEditForm['laneSelection'];
  media: ProfileEditForm['media'];
}>;

const ProfileEditPreview = memo(function ProfileEditPreview({
  gameProfile,
  identity,
  laneSelection,
  media,
}: ProfileEditPreviewProps) {
  const rank = gameProfile.rankId
    ? catalogOptionById(RANK_CATALOG, gameProfile.rankId)?.label
    : undefined;
  const lane = laneSelection
    ? [laneSelection.primary, laneSelection.secondary]
        .filter((value): value is LaneSlug => Boolean(value))
        .map((id) => catalogOptionById(LANE_CATALOG, id)?.label)
        .filter(Boolean)
        .join(' / ')
    : undefined;
  const avatarUrl = profileEditMediaPreviewUrl(
    media.staged.avatar,
    media.avatarUrl,
  );
  const coverUrl = profileEditMediaPreviewUrl(
    media.staged.cover,
    media.coverUrl,
  );

  return (
    <View style={styles.preview} testID="profile-edit-preview">
      {coverUrl ? (
        <Image
          resizeMode="cover"
          source={{ uri: coverUrl }}
          style={styles.fill}
        />
      ) : (
        <LinearGradient
          colors={profileEditUi.gradients.fallbackCover}
          style={styles.fill}
        />
      )}
      <LinearGradient
        colors={[
          profileEditUi.colors.previewScrimSoft,
          profileEditUi.colors.previewScrim,
        ]}
        style={styles.fill}
      />
      <View style={styles.previewContent}>
        <ProfileEditAvatar
          displayName={identity.displayName}
          size={profileEditUi.preview.avatar}
          uri={avatarUrl}
        />
        <View style={styles.previewCopy}>
          <AppText numberOfLines={1} variant="h2">
            {identity.displayName.trim() || 'Tên hiển thị'}
          </AppText>
          <AppText numberOfLines={1} tone="tertiary" variant="caption">
            {[rank, lane].filter(Boolean).join(' · ') ||
              'Chưa đủ thông tin game'}
          </AppText>
          <AppText numberOfLines={2} tone="secondary" variant="bodySmall">
            {identity.bio.trim() || 'Chưa có lời giới thiệu.'}
          </AppText>
        </View>
      </View>
    </View>
  );
});

function CategoryGrid({
  activeCategory,
  dirtySections,
  onSelect,
}: Readonly<{
  activeCategory: ProfileEditCategoryId;
  dirtySections: readonly ProfileEditSectionId[];
  onSelect: (category: ProfileEditCategoryId) => void;
}>) {
  return (
    <View style={styles.categoryGrid}>
      {categories.map((category) => {
        const active = category.id === activeCategory;
        const dirty = category.sections.some((section) =>
          dirtySections.includes(section),
        );
        return (
          <AppPressableCard
            accessibilityLabel={`Mở mục ${category.label}`}
            contentStyle={styles.categoryContent}
            density="compact"
            key={category.id}
            onPress={() => onSelect(category.id)}
            selected={active}
            style={styles.category}
            withShadow={false}
          >
            <View style={styles.categoryIcon}>
              <Ionicons
                color={
                  active ? appColors.accent.purpleIcon : appColors.icon.inactive
                }
                name={category.icon}
                size={19}
              />
            </View>
            <View style={styles.categoryCopy}>
              <View style={styles.categoryTitleRow}>
                <AppText variant="label">{category.label}</AppText>
                {dirty ? <View style={styles.categoryDirtyDot} /> : null}
              </View>
              <AppText numberOfLines={2} tone="muted" variant="caption">
                {category.description}
              </AppText>
            </View>
          </AppPressableCard>
        );
      })}
    </View>
  );
}

const IdentityPanel = memo(function IdentityPanel({
  disabled,
  form,
  onChange,
  onPickMedia,
}: Readonly<{
  disabled: boolean;
  form: ProfileEditForm;
  onChange: (form: ProfileEditForm) => void;
  onPickMedia: (slot: ProfileEditMediaSlot) => void;
}>) {
  const identity = form.identity;
  return (
    <EditPanel
      description="Những gì người khác nhìn thấy đầu tiên trên hồ sơ của bạn."
      icon="person-circle-outline"
      title="Thông tin cá nhân"
    >
      <MediaEditor
        disabled={disabled}
        displayName={identity.displayName}
        form={form}
        onPick={onPickMedia}
      />
      <Divider />
      <AppTextField
        accessibilityLabel="Tên hiển thị"
        errorText={
          identity.displayName.trim().length < 2
            ? 'Tên cần ít nhất 2 ký tự.'
            : undefined
        }
        label="Tên hiển thị"
        maxLength={PROFILE_LIMITS.displayName}
        meta={`${identity.displayName.length}/${PROFILE_LIMITS.displayName}`}
        onChangeText={(displayName) =>
          onChange({ ...form, identity: { ...identity, displayName } })
        }
        placeholder="Tên của bạn"
        value={identity.displayName}
      />

      <FieldLabel label="Giới tính" meta="không bắt buộc" />
      <OptionWrap>
        {GENDER_CATALOG.map((option) => (
          <AppChip
            accessibilityLabel={`Giới tính ${option.label}`}
            accessibilityState={{ selected: identity.genderId === option.id }}
            density="compact"
            withSheen={false}
            key={option.id}
            onPress={() =>
              onChange({
                ...form,
                identity: { ...identity, genderId: option.id },
              })
            }
            selected={identity.genderId === option.id}
            variant="purple"
          >
            {option.label}
          </AppChip>
        ))}
      </OptionWrap>

      <FieldLabel label="Trạng thái" meta="không bắt buộc" />
      <OptionWrap>
        {statusOptions.map((option) => (
          <AppChip
            accessibilityLabel={`Trạng thái ${option.label}`}
            accessibilityState={{ selected: identity.status === option.value }}
            density="compact"
            withSheen={false}
            key={option.value}
            onPress={() =>
              onChange({
                ...form,
                identity: { ...identity, status: option.value },
              })
            }
            selected={identity.status === option.value}
            variant="purple"
          >
            {option.label}
          </AppChip>
        ))}
      </OptionWrap>

      <AppTextField
        accessibilityLabel="Câu giới thiệu"
        label="Giới thiệu"
        maxLength={80}
        meta={`${identity.bio.length}/80`}
        multiline
        onChangeText={(bio) =>
          onChange({ ...form, identity: { ...identity, bio } })
        }
        placeholder="Teamwork, giao tranh sạch, không toxic."
        value={identity.bio}
      />

      <AppNotice icon="shield-checkmark-outline" title="Số liệu được bảo vệ">
        Lượt thích, số match, số buổi đã chơi và uy tín đến từ projection hệ
        thống; editor không cho phép tự khai.
      </AppNotice>
    </EditPanel>
  );
});

function MediaEditor({
  disabled,
  displayName,
  form,
  onPick,
}: Readonly<{
  disabled: boolean;
  displayName: string;
  form: ProfileEditForm;
  onPick: (slot: ProfileEditMediaSlot) => void;
}>) {
  const avatar = form.media.staged.avatar;
  const cover = form.media.staged.cover;
  const avatarUrl = profileEditMediaPreviewUrl(avatar, form.media.avatarUrl);
  const coverUrl = profileEditMediaPreviewUrl(cover, form.media.coverUrl);
  return (
    <View style={styles.mediaRow}>
      <View style={styles.avatarEditor}>
        <ProfileEditAvatar
          displayName={displayName}
          size={72}
          uri={avatarUrl}
        />
        <AppButton
          accessibilityLabel="Đổi ảnh đại diện"
          disabled={disabled}
          onPress={() => onPick('avatar')}
          style={styles.mediaButton}
          variant="secondary"
          withShadow={false}
        >
          <Ionicons
            color={appColors.icon.primary}
            name="camera-outline"
            size={16}
          />
          <AppText variant="label">Avatar</AppText>
        </AppButton>
        {avatar ? (
          <AppText tone="muted" variant="caption">
            {profileEditMediaStatusLabel(avatar.status)}
          </AppText>
        ) : null}
      </View>
      <AppPressableCard
        accessibilityLabel="Đổi ảnh nền hồ sơ"
        backgroundSlot={
          <>
            {coverUrl ? (
              <Image
                resizeMode="cover"
                source={{ uri: coverUrl }}
                style={styles.fill}
              />
            ) : (
              <LinearGradient
                colors={profileEditUi.gradients.fallbackCover}
                style={styles.fill}
              />
            )}
            <LinearGradient
              colors={[
                profileEditUi.colors.previewScrimSoft,
                profileEditUi.colors.previewScrim,
              ]}
              style={styles.fill}
            />
          </>
        }
        contentStyle={styles.coverEditorContent}
        density="list"
        disabled={disabled}
        onPress={() => onPick('cover')}
        radius={profileEditUi.radii.category}
        style={styles.coverEditor}
        withShadow={false}
      >
        <View style={styles.coverCopy}>
          <AppText variant="label">Ảnh bìa</AppText>
          <AppText tone="muted" variant="caption">
            {cover ? profileEditMediaStatusLabel(cover.status) : 'Tỉ lệ 16:9'}
          </AppText>
        </View>
        <View style={styles.coverAction}>
          <Ionicons
            color={appColors.icon.primary}
            name="image-outline"
            size={16}
          />
        </View>
      </AppPressableCard>
      {avatar?.failure || cover?.failure ? (
        <AppText style={styles.fullWidth} tone="warning" variant="caption">
          {avatar?.failure?.message ?? cover?.failure?.message}
        </AppText>
      ) : null}
    </View>
  );
}

const GamePanel = memo(function GamePanel({
  disabled,
  draft,
  form,
  onChange,
  onLimitReached,
}: Readonly<{
  disabled: boolean;
  draft: ProfileEditDraft;
  form: ProfileEditForm;
  onChange: (form: ProfileEditForm) => void;
  onLimitReached: () => void;
}>) {
  return (
    <EditPanel
      description="Thông tin giúp người khác đánh giá độ phù hợp trước khi match."
      icon="game-controller-outline"
      title="Hồ sơ trong game"
    >
      {!draft.meta.hasGameProfileRecord ? (
        <AppNotice
          icon="warning-outline"
          title="Chưa có game profile"
          tone="warning"
        >
          Server chưa có record game profile nên handle và rank đang khoá. Các
          phần khác vẫn lưu độc lập.
        </AppNotice>
      ) : null}
      <AppTextField
        accessibilityLabel="Game handle"
        editable={draft.meta.hasGameProfileRecord && !disabled}
        label="Game handle"
        maxLength={64}
        meta="khác tên hiển thị"
        onChangeText={(handle) =>
          onChange({
            ...form,
            gameProfile: { ...form.gameProfile, handle },
          })
        }
        placeholder="Tên trong game"
        value={form.gameProfile.handle}
      />
      <SingleOptionGroup
        disabled={!draft.meta.hasGameProfileRecord || disabled}
        label="Cấp độ"
        onSelect={(rankId) =>
          onChange({
            ...form,
            gameProfile: { ...form.gameProfile, rankId },
          })
        }
        options={RANK_CATALOG}
        selectedId={form.gameProfile.rankId}
      />
      <Divider />
      <LaneEditor
        onChange={(laneSelection) => onChange({ ...form, laneSelection })}
        onLimitReached={onLimitReached}
        selection={form.laneSelection}
      />
      <Divider />
      <HeroEditor
        heroes={form.heroes}
        onChange={(heroes) => onChange({ ...form, heroes })}
      />
    </EditPanel>
  );
});

function LaneEditor({
  onChange,
  onLimitReached,
  selection,
}: Readonly<{
  onChange: (selection: LaneSelection | null) => void;
  onLimitReached: () => void;
  selection: LaneSelection | null;
}>) {
  const selected = selection
    ? [selection.primary, selection.secondary].filter(
        (value): value is LaneSlug => Boolean(value),
      )
    : [];
  const toggle = (laneId: LaneSlug) => {
    if (!selection) return onChange({ primary: laneId, secondary: null });
    if (selection.primary === laneId) {
      return onChange(
        selection.secondary
          ? { primary: selection.secondary, secondary: null }
          : null,
      );
    }
    if (selection.secondary === laneId) {
      return onChange({ ...selection, secondary: null });
    }
    if (selection.secondary) return onLimitReached();
    onChange({ ...selection, secondary: laneId });
  };
  return (
    <View>
      <FieldLabel
        label="Lane ưu tiên"
        meta={`${selected.length}/${PROFILE_LIMITS.lanes}`}
      />
      <OptionWrap>
        {LANE_CATALOG.map((lane) => {
          const selectedLane = selected.includes(lane.id);
          return (
            <AppChip
              accessibilityLabel={`Vai trò ${lane.label}`}
              accessibilityState={{ selected: selectedLane }}
              density="compact"
              withSheen={false}
              key={lane.id}
              onPress={() => toggle(lane.id)}
              selected={selectedLane}
              variant="cyan"
            >
              {lane.label}
            </AppChip>
          );
        })}
      </OptionWrap>
      {selected.length ? (
        <AppText tone="muted" variant="caption">
          Thứ tự chọn thể hiện ưu tiên; backend hiện chỉ round-trip tập vai trò.
        </AppText>
      ) : null}
    </View>
  );
}

function HeroEditor({
  heroes,
  onChange,
}: Readonly<{
  heroes: ProfileEditHero[];
  onChange: (heroes: ProfileEditHero[]) => void;
}>) {
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  return (
    <View>
      <FieldLabel
        label="Tướng tủ"
        meta={`${heroes.length}/${PROFILE_LIMITS.favoriteHeroes}`}
      />
      <AppText tone="muted" variant="caption">
        Chỉ chọn và sắp thứ tự tướng. Số trận hoặc tỉ lệ thắng tự khai không còn
        được chỉnh tại đây.
      </AppText>
      <View style={styles.heroList}>
        {Array.from({ length: PROFILE_LIMITS.favoriteHeroes }).map(
          (_, index) => {
            const hero = heroes[index];
            const definition = hero
              ? heroDefinitionById(hero.heroId)
              : undefined;
            return (
              <AppCard
                contentStyle={styles.heroRow}
                density="list"
                key={index}
                withShadow={false}
              >
                <Image
                  source={heroImage(hero?.heroId)}
                  style={styles.heroImage}
                />
                <View style={styles.heroCopy}>
                  <AppText numberOfLines={1} variant="label">
                    {definition?.name ?? `Vị trí ${index + 1}`}
                  </AppText>
                  <AppText tone="muted" variant="caption">
                    {definition ? `Ưu tiên ${index + 1}` : 'Chưa chọn tướng'}
                  </AppText>
                </View>
                <AppIconButton
                  accessibilityLabel={`Đổi tướng tủ slot ${index + 1}`}
                  emphasis="none"
                  onPress={() => setPickerSlot(index)}
                  size={38}
                  surfaceTone="low"
                  withHighlight={false}
                >
                  <Ionicons
                    color={appColors.icon.primary}
                    name="swap-horizontal"
                    size={17}
                  />
                </AppIconButton>
                {hero ? (
                  <>
                    <AppIconButton
                      accessibilityLabel={`Ưu tiên ${definition?.name ?? 'tướng'} cao hơn`}
                      disabled={index === 0}
                      emphasis="none"
                      onPress={() =>
                        onChange(moveHero(heroes, index, index - 1))
                      }
                      size={36}
                      surfaceTone="low"
                      withHighlight={false}
                    >
                      <Ionicons
                        color={appColors.icon.primary}
                        name="arrow-up"
                        size={15}
                      />
                    </AppIconButton>
                    <AppIconButton
                      accessibilityLabel={`Bỏ tướng ${definition?.name ?? ''}`}
                      emphasis="none"
                      onPress={() =>
                        onChange(
                          normalizePriorities(
                            heroes.filter(
                              (_, heroIndex) => heroIndex !== index,
                            ),
                          ),
                        )
                      }
                      size={36}
                      surfaceTone="low"
                      withHighlight={false}
                    >
                      <Ionicons
                        color={appColors.status.warning}
                        name="close"
                        size={16}
                      />
                    </AppIconButton>
                  </>
                ) : null}
              </AppCard>
            );
          },
        )}
      </View>
      <HeroPickerModal
        heroes={heroes}
        onClose={() => setPickerSlot(null)}
        onSelect={(heroId) => {
          if (pickerSlot !== null) {
            onChange(replaceHero(heroes, pickerSlot, heroId));
          }
          setPickerSlot(null);
        }}
        slot={pickerSlot}
      />
    </View>
  );
}

function HeroPickerModal({
  heroes,
  onClose,
  onSelect,
  slot,
}: Readonly<{
  heroes: ProfileEditHero[];
  onClose: () => void;
  onSelect: (heroId: HeroId) => void;
  slot: number | null;
}>) {
  const [search, setSearch] = useState('');
  const selectedIds = heroes.map((hero) => hero.heroId);
  const currentId = slot === null ? undefined : heroes[slot]?.heroId;
  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      HERO_DOMAIN_CATALOG.filter((hero) => {
        const classLabel = heroClassLabel(hero.classSlug);
        return query
          ? `${hero.name} ${classLabel}`.toLowerCase().includes(query)
          : true;
      }).slice(0, 80),
    [query],
  );
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={slot !== null}
    >
      <View style={styles.modalBackdrop}>
        <AppSurface
          contentStyle={styles.heroSheetContent}
          emphasis="none"
          radius={profileEditUi.radii.sheet}
          style={styles.heroSheet}
          surfaceTone="high"
          variant="modal"
          withHighlight={false}
          withShadow={false}
        >
          <View style={styles.sheetHeader}>
            <View style={styles.sheetCopy}>
              <AppText variant="h2">Chọn tướng tủ</AppText>
              <AppText tone="muted" variant="caption">
                Một tướng chỉ xuất hiện ở một vị trí.
              </AppText>
            </View>
            <AppIconButton
              accessibilityLabel="Đóng chọn tướng"
              emphasis="none"
              onPress={onClose}
              size={42}
              surfaceTone="low"
              withHighlight={false}
            >
              <Ionicons color={appColors.icon.primary} name="close" size={20} />
            </AppIconButton>
          </View>
          <AppTextField
            accessibilityLabel="Tìm tướng"
            leading={
              <Ionicons
                color={appColors.icon.inactive}
                name="search-outline"
                size={18}
              />
            }
            onChangeText={setSearch}
            placeholder="Tìm theo tên hoặc lớp tướng"
            value={search}
          />
          <ScrollView showsVerticalScrollIndicator={false}>
            {filtered.map((hero) => {
              const alreadySelected =
                selectedIds.includes(hero.id) && hero.id !== currentId;
              return (
                <AppPressableCard
                  accessibilityLabel={`Chọn tướng ${hero.name}`}
                  contentStyle={styles.heroPickerRow}
                  density="list"
                  disabled={alreadySelected}
                  key={hero.id}
                  onPress={() => onSelect(hero.id)}
                  style={styles.heroPickerCard}
                  withShadow={false}
                >
                  <Image
                    source={heroImage(hero.id)}
                    style={styles.heroPickerImage}
                  />
                  <View style={styles.heroCopy}>
                    <AppText variant="label">{hero.name}</AppText>
                    <AppText tone="muted" variant="caption">
                      {heroClassLabel(hero.classSlug)}
                      {alreadySelected ? ' · Đã chọn' : ''}
                    </AppText>
                  </View>
                  <Ionicons
                    color={appColors.icon.inactive}
                    name="chevron-forward"
                    size={17}
                  />
                </AppPressableCard>
              );
            })}
          </ScrollView>
        </AppSurface>
      </View>
    </Modal>
  );
}

const PlayStylePanel = memo(function PlayStylePanel({
  habits,
  onChange,
  onLimitReached,
  scrollViewRef,
}: Readonly<{
  habits: HabitAnswersDraft;
  onChange: (habits: HabitAnswersDraft) => void;
  onLimitReached: () => void;
  scrollViewRef: RefObject<ScrollView | null>;
}>) {
  const goalAnchorRef = useRef<View>(null);
  const coordinationAnchorRef = useRef<View>(null);
  const tacticsAnchorRef = useRef<View>(null);
  const previewTiles = useMemo(
    () => presentProfilePlayStyleHabits(habits),
    [habits],
  );
  const scrollToSlot = useCallback(
    (slot: ProfilePlayStyleSlot) => {
      const anchor =
        slot === 'goal'
          ? goalAnchorRef.current
          : slot === 'coordination'
            ? coordinationAnchorRef.current
            : tacticsAnchorRef.current;
      scrollToProfilePlayStyleAnchor(scrollViewRef.current, anchor);
    },
    [scrollViewRef],
  );

  return (
    <EditPanel
      description="Xem trước ba thẻ trên hồ sơ, rồi điều chỉnh các tín hiệu tạo nên chúng."
      icon="sparkles-outline"
      title="Phong cách chơi"
    >
      <ProfilePlayStyleEditPreview
        onSelectSlot={scrollToSlot}
        tiles={previewTiles}
      />
      <Divider />
      <Subsection title="Thiết lập ba thẻ">
        <View
          collapsable={false}
          ref={goalAnchorRef}
          style={styles.playStyleEditorGroup}
          testID="profile-play-style-edit-anchor-goal"
        >
          <AppText tone="accent" variant="label">
            MỤC TIÊU CHƠI
          </AppText>
          <SingleOptionGroup
            label="Mức độ nghiêm túc"
            onSelect={(seriousnessId) => onChange({ ...habits, seriousnessId })}
            options={SERIOUSNESS_CATALOG}
            selectedId={habits.seriousnessId}
          />
          <MultiOptionGroup
            label="Mục tiêu đội"
            limit={PROFILE_LIMITS.teamGoals}
            onLimitReached={onLimitReached}
            onToggle={(teamGoalIds) => onChange({ ...habits, teamGoalIds })}
            options={TEAM_GOAL_CATALOG}
            selectedIds={habits.teamGoalIds}
          />
        </View>

        <View
          collapsable={false}
          ref={coordinationAnchorRef}
          style={styles.playStyleEditorGroup}
          testID="profile-play-style-edit-anchor-coordination"
        >
          <AppText tone="accent" variant="label">
            CÁCH PHỐI HỢP
          </AppText>
          <SingleOptionGroup
            label="Ra quyết định"
            onSelect={(decisionStyleId) =>
              onChange({ ...habits, decisionStyleId })
            }
            options={DECISION_STYLE_CATALOG}
            selectedId={habits.decisionStyleId}
          />
          <MultiOptionGroup
            label="Giao tiếp"
            limit={PROFILE_LIMITS.communicationPreferences}
            onLimitReached={onLimitReached}
            onToggle={(communicationPreferenceIds) =>
              onChange({ ...habits, communicationPreferenceIds })
            }
            options={COMMUNICATION_PREFERENCE_CATALOG}
            selectedIds={habits.communicationPreferenceIds}
          />
        </View>

        <View
          collapsable={false}
          ref={tacticsAnchorRef}
          style={styles.playStyleEditorGroup}
          testID="profile-play-style-edit-anchor-tactics"
        >
          <AppText tone="accent" variant="label">
            BẢN SẮC CHIẾN THUẬT
          </AppText>
          <MultiOptionGroup
            label="Chiến thuật"
            limit={PROFILE_LIMITS.strategyStyles}
            onLimitReached={onLimitReached}
            onToggle={(strategyStyleIds) =>
              onChange({ ...habits, strategyStyleIds })
            }
            options={STRATEGY_STYLE_CATALOG}
            selectedIds={habits.strategyStyleIds}
          />
        </View>
      </Subsection>
      <Divider />
      <Subsection title="Thói quen giúp ghép đội">
        <AppText tone="muted" variant="bodySmall">
          Các lựa chọn dưới đây giúp đánh giá độ hợp nhau; chúng không tự đổi ba
          thẻ minh hoạ phía trên.
        </AppText>
        <SingleOptionGroup
          label="Độ dài phiên"
          onSelect={(sessionLengthId) =>
            onChange({ ...habits, sessionLengthId })
          }
          options={SESSION_LENGTH_CATALOG}
          selectedId={habits.sessionLengthId}
        />
        <MultiOptionGroup
          label="Không khí đội"
          limit={PROFILE_LIMITS.teamAtmospheres}
          onLimitReached={onLimitReached}
          onToggle={(teamAtmosphereIds) =>
            onChange({ ...habits, teamAtmosphereIds })
          }
          options={TEAM_ATMOSPHERE_CATALOG}
          selectedIds={habits.teamAtmosphereIds}
        />
        <SingleOptionGroup
          label="Cách góp ý"
          onSelect={(feedbackStyleId) =>
            onChange({ ...habits, feedbackStyleId })
          }
          options={FEEDBACK_STYLE_CATALOG}
          selectedId={habits.feedbackStyleId}
        />
        <SingleOptionGroup
          label="Sau trận thua"
          onSelect={(lossResponseId) => onChange({ ...habits, lossResponseId })}
          options={LOSS_RESPONSE_CATALOG}
          selectedId={habits.lossResponseId}
        />
        <SingleOptionGroup
          label="Khi bị dẫn trước"
          onSelect={(comebackResponseId) =>
            onChange({ ...habits, comebackResponseId })
          }
          options={COMEBACK_RESPONSE_CATALOG}
          selectedId={habits.comebackResponseId}
        />
      </Subsection>
    </EditPanel>
  );
});

const AvailabilityPanel = memo(function AvailabilityPanel({
  availability,
  onChange,
}: Readonly<{
  availability: ProfileEditForm['availability'];
  onChange: (availability: ProfileEditForm['availability']) => void;
}>) {
  const [selectedDays, setSelectedDays] = useState<AvailabilityDayOfWeek[]>(
    () => inferProfileEditSelectedDays(availability),
  );
  const [selectedPreferences, setSelectedPreferences] = useState<
    TimePreferenceId[]
  >(() => inferProfileEditSelectedPreferences(availability));
  const timezone = availability?.timezone ?? profileEditDeviceTimezone();
  const update = (
    days: AvailabilityDayOfWeek[],
    preferences: TimePreferenceId[],
  ) => {
    setSelectedDays(days);
    setSelectedPreferences(preferences);
    if (!days.length || !preferences.length) {
      onChange(null);
      return;
    }
    onChange(
      buildRecurringAvailabilityFromTimePreferences({
        daysOfWeek: days,
        timePreferenceIds: preferences,
        timezone,
      }),
    );
  };
  return (
    <EditPanel
      description="Lịch lặp lại giúp lời mời và đề xuất phù hợp với thời gian của bạn."
      icon="calendar-outline"
      title="Thời gian thường chơi"
    >
      <FieldLabel label="Múi giờ" meta={timezone} />
      <MultiOptionGroup
        label="Ngày trong tuần"
        limit={profileEditDayOptions.length}
        onToggle={(days) =>
          update(days as AvailabilityDayOfWeek[], selectedPreferences)
        }
        options={profileEditDayOptions}
        selectedIds={selectedDays}
      />
      <MultiOptionGroup
        label="Khung giờ"
        limit={TIME_PREFERENCE_CATALOG.length}
        onToggle={(preferences) =>
          update(selectedDays, preferences as TimePreferenceId[])
        }
        options={TIME_PREFERENCE_CATALOG}
        selectedIds={selectedPreferences}
      />
      {availability ? (
        <AppNotice icon="time-outline" title="Lịch sẽ được lưu">
          {availability.slots
            .map(
              (slot) =>
                `${profileEditDayLabel(slot.dayOfWeek)} ${profileEditFormatMinute(
                  slot.startMinute,
                )}–${profileEditFormatMinute(slot.endMinute)}`,
            )
            .join(' · ')}
        </AppNotice>
      ) : (
        <AppText tone="muted" variant="bodySmall">
          Chọn ít nhất một ngày và một khung giờ để tạo lịch chơi.
        </AppText>
      )}
      {availability ? (
        <AppButton
          accessibilityLabel="Xóa lịch chơi"
          onPress={() => onChange(null)}
          variant="ghost"
          withShadow={false}
        >
          Xóa lịch
        </AppButton>
      ) : null}
    </EditPanel>
  );
});

function replaceHero(heroes: ProfileEditHero[], slot: number, heroId: HeroId) {
  const next = [...heroes];
  const existing = next.findIndex((hero) => hero.heroId === heroId);
  if (existing >= 0 && existing !== slot) return heroes;
  const current = next[slot];
  next[slot] = {
    heroId,
    priority: slot + 1,
    ...(current?.heroId === heroId
      ? { matches: current.matches, winRate: current.winRate }
      : {}),
  };
  return normalizePriorities(next.filter(Boolean));
}

function moveHero(heroes: ProfileEditHero[], from: number, to: number) {
  if (to < 0 || to >= heroes.length) return heroes;
  const next = [...heroes];
  const [item] = next.splice(from, 1);
  if (!item) return heroes;
  next.splice(to, 0, item);
  return normalizePriorities(next);
}

function normalizePriorities(heroes: ProfileEditHero[]) {
  return heroes.map((hero, index) => ({ ...hero, priority: index + 1 }));
}

function heroImage(heroId: HeroId | undefined) {
  return (heroId && heroImageById.get(heroId)) || fallbackHeroImage;
}

function heroClassLabel(classSlug: string) {
  return (
    HERO_CLASS_CATALOG.find((item) => item.id === classSlug)?.label ?? classSlug
  );
}
