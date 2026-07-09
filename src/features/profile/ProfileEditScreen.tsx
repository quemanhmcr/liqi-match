import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  ToastAndroid,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { HEROES } from '@/features/onboarding/hero-selection-data';
import {
  LiquidButton,
  LiquidCard,
  LiquidChip,
  LiquidOrbButton,
} from '@/shared/components/liquid';
import { useAuth } from '@/shared/auth/auth-context';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import { ProfileText } from './components/ProfileShared';
import {
  fetchProfileEditDraft,
  profileMediaUrl,
  saveProfileEdit,
  uploadEditableProfileMedia,
  type ProfileEditDraft,
  type ProfileEditHabits,
  type ProfileFavoriteHero,
  type ProfileHeroPickerOption,
  type ProfileReferenceOption,
  type ProfileStatusValue,
} from './profile-service';

const regionOptions = [
  { label: 'Global', value: 'global' },
  { label: 'VN', value: 'vn' },
  { label: 'SEA', value: 'sea' },
] as const;

const statusOptions: { label: string; value: ProfileStatusValue }[] = [
  { label: 'Sẵn sàng', value: 'ready' },
  { label: 'Đang bận', value: 'busy' },
  { label: 'Offline', value: 'offline' },
  { label: 'Chỉ bạn bè', value: 'friends' },
];

const seriousnessOptions = ['Thoải mái', 'Cân bằng', 'Cạnh tranh'] as const;
const communicationOptions = [
  'Voice chủ động',
  'Voice khi cần',
  'Ping/chat là chính',
] as const;
const timeOptions = ['Sáng', 'Chiều', 'Tối', 'Khuya'] as const;
const teamGoalOptions = [
  'Leo rank nghiêm túc',
  'Chơi vui, thư giãn',
  'Tìm duo lâu dài',
  'Tìm người phối hợp ổn định',
] as const;

const maxDisplayNameLength = 20;
const maxBioLength = 80;
const heroSlotCount = 3;

type MediaSlot = 'avatar' | 'cover';
type FocusedField = 'displayName' | 'bio' | null;

type EditForm = {
  avatarMediaId?: string | null;
  avatarUrl?: string;
  bio: string;
  coverMediaId?: string | null;
  coverUrl?: string;
  displayName: string;
  favoriteHeroes: ProfileFavoriteHero[];
  habits: ProfileEditHabits;
  rankId?: string;
  region: string;
  roleId?: string;
  status: ProfileStatusValue;
};

const fallbackHeroImage =
  require('../../../assets/anh_mau2/heroes/aya.webp') as ImageSourcePropType;

const heroImageByKey = HEROES.reduce<Record<string, ImageSourcePropType>>(
  (images, hero) => {
    images[heroVisualKey(hero.id)] = hero.image;
    images[heroVisualKey(hero.name)] = hero.image;
    images[heroVisualKey(hero.id.replace(/-/g, '_'))] = hero.image;
    return images;
  },
  {},
);

export function ProfileEditScreen() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [formOverride, setFormOverride] = useState<EditForm | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState<MediaSlot | null>(null);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const [heroPickerSlot, setHeroPickerSlot] = useState<number | null>(null);

  const draftQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return fetchProfileEditDraft(session);
    },
    queryKey: ['profile-edit-draft', session?.user.id],
  });

  const baseline = useMemo(
    () => (draftQuery.data ? draftToForm(draftQuery.data) : null),
    [draftQuery.data],
  );
  const form = formOverride ?? baseline;
  const setForm: Dispatch<SetStateAction<EditForm | null>> = (updater) => {
    setFormOverride((current) => {
      const source = current ?? baseline;
      if (!source) return current;
      if (typeof updater === 'function') return updater(source);
      return updater;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (value: EditForm) => {
      if (!session) throw new Error('Missing auth session');
      return saveProfileEdit(session, {
        avatarMediaId: value.avatarMediaId,
        bio: value.bio,
        coverMediaId: value.coverMediaId,
        displayName: value.displayName,
        favoriteHeroes: value.favoriteHeroes,
        habits: value.habits,
        rankId: value.rankId,
        region: value.region,
        roleId: value.roleId,
        status: value.status,
      });
    },
    onError: (error) => {
      Alert.alert(
        'Không lưu được',
        error instanceof Error ? error.message : 'Vui lòng thử lại.',
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile-view'] }),
        queryClient.invalidateQueries({ queryKey: ['profile-edit-draft'] }),
      ]);
      setFormOverride(null);
      showFeedback('Đã cập nhật hồ sơ');
      router.back();
    },
  });

  const hasChanges = useMemo(() => {
    if (!baseline || !form) return false;
    return stableFormKey(baseline) !== stableFormKey(form);
  }, [baseline, form]);

  const mediaBusy = Boolean(uploadingMedia);
  const canSave = Boolean(
    form &&
    hasChanges &&
    form.displayName.trim().length >= 2 &&
    form.displayName.trim().length <= maxDisplayNameLength &&
    form.bio.trim().length <= maxBioLength &&
    !saveMutation.isPending &&
    !mediaBusy,
  );

  const pickImage = async (slot: MediaSlot) => {
    if (!session || uploadingMedia || saveMutation.isPending) return;
    selectionImpact();

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Cần quyền truy cập ảnh',
          'Bạn cần cấp quyền thư viện ảnh để chọn ảnh hồ sơ.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: slot === 'avatar' ? [1, 1] : [16, 9],
        exif: false,
        mediaTypes: ['images'],
        quality: slot === 'avatar' ? 0.82 : 0.84,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const asset = result.assets[0];
      const uploadAsset = {
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        height: asset.height,
        mimeType: asset.mimeType,
        uri: asset.uri,
        width: asset.width,
      };

      setUploadingMedia(slot);
      showFeedback(
        slot === 'avatar' ? 'Đang tải ảnh lên...' : 'Đang tải ảnh nền...',
      );
      const uploaded = await uploadEditableProfileMedia(session, {
        asset: uploadAsset,
        slot,
      });
      const url = uploaded.url ?? profileMediaUrl(uploaded.assetId);

      setForm((current) => {
        if (!current) return current;
        if (slot === 'avatar') {
          return {
            ...current,
            avatarMediaId: uploaded.assetId,
            avatarUrl: url,
          };
        }
        return {
          ...current,
          coverMediaId: uploaded.assetId,
          coverUrl: url,
        };
      });

      showFeedback(
        slot === 'avatar' ? 'Đã cập nhật ảnh đại diện' : 'Đã cập nhật ảnh nền',
      );
    } catch (error) {
      Alert.alert(
        slot === 'avatar' ? 'Không thể tải ảnh lên' : 'Không thể tải ảnh nền',
        error instanceof Error ? error.message : 'Vui lòng thử lại.',
      );
    } finally {
      setUploadingMedia(null);
    }
  };

  return (
    <LiquidScreen
      contentContainerStyle={styles.scrollContent}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <EditorTopBar
        canSave={canSave}
        hasChanges={hasChanges}
        loading={saveMutation.isPending}
        onBack={() => handleBack(hasChanges || mediaBusy)}
        onSave={() => form && saveMutation.mutate(form)}
      />

      {draftQuery.isLoading ? <LoadingState /> : null}

      {draftQuery.isError && !draftQuery.data ? (
        <ErrorState onRetry={() => void draftQuery.refetch()} />
      ) : null}

      {draftQuery.data && form ? (
        <>
          <PreviewStrip form={form} draft={draftQuery.data} />
          <MediaSection
            form={form}
            onPick={pickImage}
            uploadingMedia={uploadingMedia}
          />
          <BasicInfoSection
            focusedField={focusedField}
            form={form}
            ranks={draftQuery.data.ranks}
            roles={draftQuery.data.roles}
            setFocusedField={setFocusedField}
            setForm={setForm}
          />
          <BioSection
            focusedField={focusedField}
            form={form}
            setFocusedField={setFocusedField}
            setForm={setForm}
          />
          <PlayStyleSection form={form} setForm={setForm} />
          <FavoriteHeroesSection
            heroes={form.favoriteHeroes}
            onChangeMatches={(slot, matches) =>
              updateHeroMatches(setForm, slot, matches)
            }
            onChangeSlot={(slot) => setHeroPickerSlot(slot)}
          />
          <PrivacySection />
          {draftQuery.isError ? (
            <ProfileText style={styles.errorText}>
              Chưa đọc được dữ liệu chỉnh sửa mới nhất. App đang giữ form hiện
              tại.
            </ProfileText>
          ) : null}
          <HeroPickerModal
            options={draftQuery.data.heroOptions}
            selectedHeroes={form.favoriteHeroes}
            slot={heroPickerSlot}
            onClose={() => setHeroPickerSlot(null)}
            onSelect={(hero) => {
              replaceHeroSlot(setForm, heroPickerSlot, hero);
              setHeroPickerSlot(null);
            }}
          />
        </>
      ) : null}
    </LiquidScreen>
  );
}

function EditorTopBar({
  canSave,
  hasChanges,
  loading,
  onBack,
  onSave,
}: {
  canSave: boolean;
  hasChanges: boolean;
  loading: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <LiquidOrbButton
        accessibilityLabel="Quay lại hồ sơ"
        glowIntensity="low"
        glassIntensity="low"
        onPress={onBack}
        size={42}
        style={styles.topOrb}
      >
        <Ionicons
          color={liquidColors.text.primary}
          name="chevron-back"
          size={20}
        />
      </LiquidOrbButton>
      <View style={styles.titleBlock}>
        <ProfileText style={styles.title}>Chỉnh sửa hồ sơ</ProfileText>
        <ProfileText numberOfLines={2} style={styles.subtitle}>
          Cập nhật cách bạn xuất hiện với đồng đội.
        </ProfileText>
      </View>
      <LiquidButton
        accessibilityLabel="Lưu hồ sơ"
        disabled={!canSave}
        glowIntensity={canSave ? 'low' : 'none'}
        onPress={onSave}
        radius={18}
        style={styles.saveButton}
        variant={canSave ? 'primary' : 'ghost'}
        withShadow={false}
      >
        {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
        <ProfileText style={styles.saveText}>
          {loading ? 'Đang lưu' : 'Lưu'}
        </ProfileText>
      </LiquidButton>
      {!hasChanges ? null : (
        <View pointerEvents="none" style={styles.dirtyDot} />
      )}
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingBox}>
      <ActivityIndicator color="#C679FF" />
      <ProfileText style={styles.mutedText}>Đang tải hồ sơ...</ProfileText>
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <LiquidCard
      density="regular"
      glowIntensity="low"
      style={styles.sectionCard}
    >
      <View style={styles.errorState}>
        <Ionicons
          color="rgba(255,216,168,0.84)"
          name="warning-outline"
          size={22}
        />
        <ProfileText style={styles.errorTitle}>
          Không tải được hồ sơ
        </ProfileText>
        <ProfileText style={styles.errorBody}>
          Kiểm tra kết nối rồi thử lại. Dữ liệu chưa được thay đổi.
        </ProfileText>
        <LiquidButton
          onPress={onRetry}
          radius={18}
          style={styles.retryButton}
          withShadow={false}
        >
          <ProfileText style={styles.primaryMiniText}>Thử lại</ProfileText>
        </LiquidButton>
      </View>
    </LiquidCard>
  );
}

function PreviewStrip({
  draft,
  form,
}: {
  draft: ProfileEditDraft;
  form: EditForm;
}) {
  const rankLabel = labelFor(draft.ranks, form.rankId) ?? 'Chưa chọn rank';
  const roleLabel = labelFor(draft.roles, form.roleId) ?? 'Chưa chọn vai trò';
  const regionLabel =
    regionOptions.find((option) => option.value === form.region)?.label ??
    'Global';
  const status =
    statusOptions.find((option) => option.value === form.status)?.label ??
    'Sẵn sàng';

  return (
    <LiquidCard
      contentStyle={styles.previewSurface}
      density="regular"
      glowIntensity="low"
      style={styles.previewCard}
    >
      {form.coverUrl ? (
        <Image
          resizeMode="cover"
          source={{ uri: form.coverUrl }}
          style={styles.previewCover}
        />
      ) : (
        <LinearGradient
          colors={[
            'rgba(38,72,128,0.64)',
            'rgba(96,52,148,0.36)',
            'rgba(5,8,20,0.16)',
          ]}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={['rgba(3,6,18,0.82)', 'rgba(3,6,18,0.54)', 'rgba(3,6,18,0.76)']}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.previewHeader}>
        <AvatarPreview
          size={62}
          displayName={form.displayName}
          uri={form.avatarUrl ?? draft.avatarFallbackUrl}
        />
        <View style={styles.previewCopy}>
          <View style={styles.previewNameRow}>
            <ProfileText numberOfLines={1} style={styles.previewName}>
              {form.displayName || 'Tên hiển thị'}
            </ProfileText>
            <View style={styles.previewCheck}>
              <Ionicons
                color="rgba(210,245,255,0.94)"
                name="checkmark"
                size={13}
              />
            </View>
          </View>
          <ProfileText numberOfLines={1} style={styles.previewMeta}>
            {rankLabel} · {roleLabel} · {regionLabel}
          </ProfileText>
          <View style={styles.previewStatusRow}>
            <View style={styles.readyDot} />
            <ProfileText style={styles.previewStatus}>{status}</ProfileText>
          </View>
        </View>
      </View>
      <ProfileText numberOfLines={2} style={styles.previewBio}>
        “{form.bio.trim() || 'Chưa có giới thiệu.'}”
      </ProfileText>
    </LiquidCard>
  );
}

function AvatarPreview({
  displayName,
  size,
  uri,
}: {
  displayName: string;
  size: number;
  uri?: string;
}) {
  return (
    <LinearGradient
      colors={['rgba(142,92,255,0.76)', 'rgba(103,232,255,0.68)']}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[
        styles.avatarRing,
        { borderRadius: size / 2 + 4, height: size + 8, width: size + 8 },
      ]}
    >
      <View
        style={[
          styles.avatarInner,
          { borderRadius: size / 2, height: size, width: size },
        ]}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={[styles.avatarImage, { borderRadius: size / 2 }]}
          />
        ) : (
          <ProfileText
            style={[styles.avatarInitial, { fontSize: size * 0.42 }]}
          >
            {displayName.trim().charAt(0).toUpperCase() || 'L'}
          </ProfileText>
        )}
      </View>
    </LinearGradient>
  );
}

function MediaSection({
  form,
  onPick,
  uploadingMedia,
}: {
  form: EditForm;
  onPick: (slot: MediaSlot) => void;
  uploadingMedia: MediaSlot | null;
}) {
  return (
    <EditorSection
      icon="images-outline"
      title="Ảnh hồ sơ"
      subtitle="Dùng cùng luồng upload R2/Supabase của onboarding. Ảnh được crop bằng picker trước khi upload."
    >
      <View style={styles.mediaLayout}>
        <View style={styles.avatarEditBlock}>
          <AvatarPreview
            displayName={form.displayName}
            size={68}
            uri={form.avatarUrl}
          />
          <LiquidButton
            accessibilityLabel="Đổi ảnh đại diện"
            disabled={Boolean(uploadingMedia)}
            glowIntensity="low"
            onPress={() => onPick('avatar')}
            radius={18}
            style={styles.mediaButton}
            variant="secondary"
            withShadow={false}
          >
            {uploadingMedia === 'avatar' ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : null}
            <Ionicons
              color="rgba(231,236,255,0.86)"
              name="camera-outline"
              size={15}
            />
            <ProfileText style={styles.mediaButtonText}>
              Ảnh đại diện
            </ProfileText>
          </LiquidButton>
        </View>
        <Pressable
          accessibilityLabel="Đổi ảnh nền hồ sơ"
          accessibilityRole="button"
          disabled={Boolean(uploadingMedia)}
          onPress={() => onPick('cover')}
          style={({ pressed }) => [
            styles.coverEditor,
            pressed && styles.pressed,
          ]}
        >
          {form.coverUrl ? (
            <Image
              source={{ uri: form.coverUrl }}
              style={styles.coverEditorImage}
            />
          ) : (
            <LinearGradient
              colors={[
                'rgba(55,145,255,0.22)',
                'rgba(162,92,255,0.16)',
                'rgba(255,255,255,0.035)',
              ]}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={['rgba(3,6,18,0.10)', 'rgba(3,6,18,0.82)']}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.coverEditorCopy}>
            <ProfileText style={styles.coverEditorTitle}>Ảnh nền</ProfileText>
            <ProfileText style={styles.coverEditorMeta}>
              16:9, có overlay tối để chữ dễ đọc
            </ProfileText>
          </View>
          <View style={styles.coverActionPill}>
            {uploadingMedia === 'cover' ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons
                color="rgba(231,236,255,0.86)"
                name="image-outline"
                size={14}
              />
            )}
            <ProfileText style={styles.coverActionText}>Đổi nền</ProfileText>
          </View>
        </Pressable>
      </View>
    </EditorSection>
  );
}

function BasicInfoSection({
  focusedField,
  form,
  ranks,
  roles,
  setFocusedField,
  setForm,
}: {
  focusedField: FocusedField;
  form: EditForm;
  ranks: ProfileReferenceOption[];
  roles: ProfileReferenceOption[];
  setFocusedField: (field: FocusedField) => void;
  setForm: Dispatch<SetStateAction<EditForm | null>>;
}) {
  return (
    <EditorSection icon="person-outline" title="Thông tin cơ bản">
      <FieldLabel
        label="Tên hiển thị"
        meta={`${form.displayName.length}/${maxDisplayNameLength}`}
      />
      <TextInput
        accessibilityLabel="Tên hiển thị"
        maxLength={maxDisplayNameLength}
        onBlur={() => setFocusedField(null)}
        onChangeText={(displayName) =>
          setForm((current) => current && { ...current, displayName })
        }
        onFocus={() => setFocusedField('displayName')}
        placeholder="Tên của bạn"
        placeholderTextColor="rgba(215,224,255,0.36)"
        style={[
          styles.input,
          focusedField === 'displayName' && styles.inputFocused,
        ]}
        value={form.displayName}
      />
      {!form.displayName.trim() ? (
        <ProfileText style={styles.validationText}>
          Tên không được để trống.
        </ProfileText>
      ) : form.displayName.trim().length < 2 ? (
        <ProfileText style={styles.validationText}>
          Tên cần ít nhất 2 ký tự.
        </ProfileText>
      ) : null}

      <OptionGroup
        label="Vai trò chính"
        options={roles}
        selectedId={form.roleId}
        onSelect={(roleId) =>
          setForm((current) => current && { ...current, roleId })
        }
      />
      <OptionGroup
        label="Cấp độ"
        options={ranks}
        selectedId={form.rankId}
        onSelect={(rankId) =>
          setForm((current) => current && { ...current, rankId })
        }
      />
      <StringValueGroup
        label="Khu vực"
        options={regionOptions}
        selected={form.region}
        tone="cyan"
        onSelect={(region) =>
          setForm((current) => (current ? { ...current, region } : current))
        }
      />
      <StringValueGroup
        label="Trạng thái"
        options={statusOptions}
        selected={form.status}
        tone="purple"
        onSelect={(status) =>
          setForm((current) => (current ? { ...current, status } : current))
        }
      />
    </EditorSection>
  );
}

function BioSection({
  focusedField,
  form,
  setFocusedField,
  setForm,
}: {
  focusedField: FocusedField;
  form: EditForm;
  setFocusedField: (field: FocusedField) => void;
  setForm: Dispatch<SetStateAction<EditForm | null>>;
}) {
  const suggestions = [
    'Không toxic',
    'Mic on',
    'Leo rank nghiêm túc',
    'Vui vẻ hòa đồng',
  ];

  return (
    <EditorSection icon="chatbox-ellipses-outline" title="Câu giới thiệu">
      <FieldLabel label="Bio" meta={`${form.bio.length}/${maxBioLength}`} />
      <TextInput
        accessibilityLabel="Câu giới thiệu"
        maxLength={maxBioLength}
        multiline
        onBlur={() => setFocusedField(null)}
        onChangeText={(bio) =>
          setForm((current) => current && { ...current, bio })
        }
        onFocus={() => setFocusedField('bio')}
        placeholder="Teamwork, giao tranh sạch, không toxic."
        placeholderTextColor="rgba(215,224,255,0.36)"
        style={[
          styles.input,
          styles.bioInput,
          focusedField === 'bio' && styles.inputFocused,
        ]}
        textAlignVertical="top"
        value={form.bio}
      />
      <View style={styles.chipWrap}>
        {suggestions.map((suggestion) => (
          <LiquidChip
            density="tag"
            key={suggestion}
            onPress={() =>
              setForm((current) =>
                current
                  ? {
                      ...current,
                      bio: applyBioSuggestion(current.bio, suggestion),
                    }
                  : current,
              )
            }
            variant="purple"
          >
            {suggestion}
          </LiquidChip>
        ))}
      </View>
    </EditorSection>
  );
}

function PlayStyleSection({
  form,
  setForm,
}: {
  form: EditForm;
  setForm: Dispatch<SetStateAction<EditForm | null>>;
}) {
  return (
    <EditorSection
      icon="radio-button-on-outline"
      title="Phong cách chơi"
      subtitle="Chọn tối đa vài tag nổi bật để profile gọn và dễ match."
    >
      <StringSingleGroup
        label="Mục tiêu chơi"
        options={seriousnessOptions}
        selected={form.habits.seriousness}
        onSelect={(seriousness) =>
          updateHabits(setForm, (habits) => ({ ...habits, seriousness }))
        }
      />
      <StringMultiGroup
        label="Giao tiếp"
        limit={2}
        options={communicationOptions}
        selected={form.habits.communication_channels}
        onToggle={(value) =>
          updateHabits(setForm, (habits) => ({
            ...habits,
            communication_channels: toggleString(
              habits.communication_channels,
              value,
              2,
            ),
          }))
        }
      />
      <StringMultiGroup
        label="Thời gian hay chơi"
        limit={5}
        options={timeOptions}
        selected={form.habits.online_time_presets}
        onToggle={(value) =>
          updateHabits(setForm, (habits) => ({
            ...habits,
            online_time_presets: toggleString(
              habits.online_time_presets,
              value,
              5,
            ),
          }))
        }
      />
      <StringMultiGroup
        label="Team goal"
        limit={2}
        options={teamGoalOptions}
        selected={form.habits.team_goals}
        onToggle={(value) =>
          updateHabits(setForm, (habits) => ({
            ...habits,
            team_goals: toggleString(habits.team_goals, value, 2),
          }))
        }
      />
    </EditorSection>
  );
}

function FavoriteHeroesSection({
  heroes,
  onChangeMatches,
  onChangeSlot,
}: {
  heroes: ProfileFavoriteHero[];
  onChangeMatches: (slot: number, matches: number | undefined) => void;
  onChangeSlot: (slot: number) => void;
}) {
  return (
    <EditorSection
      icon="shield-checkmark-outline"
      title="Tướng tủ"
      subtitle="Chọn 3 tướng đại diện và nhập số trận muốn hiển thị trên hồ sơ."
    >
      {Array.from({ length: heroSlotCount }).map((_, index) => {
        const hero = heroes[index];
        return (
          <View key={index} style={styles.heroEditRow}>
            <View style={styles.heroEditIndex}>
              <ProfileText style={styles.heroEditIndexText}>
                {index + 1}
              </ProfileText>
            </View>
            <Image source={heroImage(hero)} style={styles.heroEditImage} />
            <View style={styles.heroEditCopy}>
              <ProfileText numberOfLines={1} style={styles.heroEditName}>
                {hero?.name ?? 'Chọn tướng'}
              </ProfileText>
              {hero ? (
                <View style={styles.heroMatchInputRow}>
                  <TextInput
                    accessibilityLabel={`Số trận ${hero.name}`}
                    keyboardType="number-pad"
                    maxLength={5}
                    onChangeText={(value) =>
                      onChangeMatches(index, parseMatchCountInput(value))
                    }
                    placeholder="0"
                    placeholderTextColor="rgba(205,216,245,0.34)"
                    style={styles.heroMatchInput}
                    value={
                      hero.matches !== undefined ? String(hero.matches) : ''
                    }
                  />
                  <ProfileText style={styles.heroMatchSuffix}>trận</ProfileText>
                </View>
              ) : (
                <ProfileText numberOfLines={1} style={styles.heroEditMeta}>
                  Slot tướng tủ đang trống
                </ProfileText>
              )}
            </View>
            <LiquidButton
              accessibilityLabel={`Đổi tướng tủ slot ${index + 1}`}
              glowIntensity="none"
              onPress={() => onChangeSlot(index)}
              radius={16}
              style={styles.changeHeroButton}
              variant="ghost"
              withShadow={false}
            >
              <ProfileText style={styles.changeHeroText}>Đổi</ProfileText>
            </LiquidButton>
          </View>
        );
      })}
    </EditorSection>
  );
}

function HeroPickerModal({
  onClose,
  onSelect,
  options,
  selectedHeroes,
  slot,
}: {
  onClose: () => void;
  onSelect: (hero: ProfileHeroPickerOption) => void;
  options: ProfileHeroPickerOption[];
  selectedHeroes: ProfileFavoriteHero[];
  slot: number | null;
}) {
  const [search, setSearch] = useState('');
  const visible = slot !== null;
  const selectedKeys = selectedHeroes.map(heroKey);
  const currentKey = slot === null ? undefined : heroKey(selectedHeroes[slot]);
  const query = search.trim().toLowerCase();
  const filtered = options
    .filter((hero) => {
      if (!query) return true;
      return `${hero.name} ${hero.role ?? ''}`.toLowerCase().includes(query);
    })
    .slice(0, 80);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.heroSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <ProfileText style={styles.sheetTitle}>Chọn tướng</ProfileText>
              <ProfileText style={styles.sheetSubtitle}>
                Không thể chọn trùng tướng ở nhiều slot.
              </ProfileText>
            </View>
            <LiquidOrbButton
              accessibilityLabel="Đóng chọn tướng"
              glowIntensity="low"
              onPress={onClose}
              size={36}
            >
              <Ionicons
                color={liquidColors.text.primary}
                name="close"
                size={18}
              />
            </LiquidOrbButton>
          </View>
          <View style={styles.searchBox}>
            <Ionicons color="rgba(205,216,245,0.62)" name="search" size={16} />
            <TextInput
              accessibilityLabel="Tìm tướng"
              onChangeText={setSearch}
              placeholder="Tìm tướng"
              placeholderTextColor="rgba(205,216,245,0.42)"
              style={styles.searchInput}
              value={search}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {filtered.map((hero) => {
              const key = heroKey(hero);
              const selectedElsewhere = Boolean(
                key && selectedKeys.includes(key) && key !== currentKey,
              );
              return (
                <Pressable
                  accessibilityLabel={`Chọn ${hero.name}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: selectedElsewhere }}
                  disabled={selectedElsewhere}
                  key={`${hero.slug ?? hero.name}-${hero.heroId ?? ''}`}
                  onPress={() => onSelect(hero)}
                  style={({ pressed }) => [
                    styles.heroPickerRow,
                    selectedElsewhere && styles.heroPickerDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Image
                    source={heroImage(hero)}
                    style={styles.heroPickerImage}
                  />
                  <View style={styles.heroPickerCopy}>
                    <ProfileText style={styles.heroPickerName}>
                      {hero.name}
                    </ProfileText>
                    <ProfileText style={styles.heroPickerMeta}>
                      {hero.role ? `${hero.role} · ` : ''}
                      {heroMeta(hero)}
                    </ProfileText>
                  </View>
                  {selectedElsewhere ? (
                    <ProfileText style={styles.heroPickedText}>
                      Đã chọn
                    </ProfileText>
                  ) : (
                    <Ionicons
                      color="rgba(186,239,255,0.72)"
                      name="chevron-forward"
                      size={17}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PrivacySection() {
  return (
    <EditorSection
      icon="shield-checkmark-outline"
      title="Quyền riêng tư"
      subtitle="Stats, rating và uy tín là dữ liệu hệ thống nên không cho sửa tay trong form này."
    >
      <View style={styles.privacyRow}>
        <ProfileText style={styles.privacyLabel}>
          Hiển thị tỷ lệ thắng
        </ProfileText>
        <LiquidChip density="compact" selected variant="cyan">
          On
        </LiquidChip>
      </View>
      <View style={styles.privacyRow}>
        <ProfileText style={styles.privacyLabel}>
          Cho phép chia sẻ hồ sơ
        </ProfileText>
        <LiquidChip density="compact" selected variant="cyan">
          On
        </LiquidChip>
      </View>
    </EditorSection>
  );
}

function EditorSection({
  children,
  icon,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
  title: string;
}) {
  return (
    <LiquidCard
      density="regular"
      glowIntensity="low"
      style={styles.sectionCard}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons color="rgba(178,235,255,0.82)" name={icon} size={16} />
        </View>
        <View style={styles.sectionTitleBlock}>
          <ProfileText style={styles.sectionTitle}>{title}</ProfileText>
          {subtitle ? (
            <ProfileText style={styles.sectionSubtitle}>{subtitle}</ProfileText>
          ) : null}
        </View>
      </View>
      {children}
    </LiquidCard>
  );
}

function OptionGroup({
  label,
  onSelect,
  options,
  selectedId,
}: {
  label: string;
  onSelect: (id: string) => void;
  options: ProfileReferenceOption[];
  selectedId?: string;
}) {
  return (
    <>
      <FieldLabel label={label} />
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <LiquidChip
            accessibilityLabel={`${label} ${option.label}`}
            accessibilityState={{ selected: selectedId === option.id }}
            density="compact"
            key={option.id}
            onPress={() => onSelect(option.id)}
            selected={selectedId === option.id}
            textStyle={styles.chipText}
            variant="cyan"
          >
            {option.label}
          </LiquidChip>
        ))}
      </View>
    </>
  );
}

function StringValueGroup<Value extends string>({
  label,
  onSelect,
  options,
  selected,
  tone,
}: {
  label: string;
  onSelect: (value: Value) => void;
  options: readonly { label: string; value: Value }[];
  selected: Value;
  tone: 'cyan' | 'purple';
}) {
  return (
    <>
      <FieldLabel label={label} />
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <LiquidChip
            accessibilityLabel={`${label} ${option.label}`}
            accessibilityState={{ selected: selected === option.value }}
            density="compact"
            key={option.value}
            onPress={() => onSelect(option.value)}
            selected={selected === option.value}
            textStyle={styles.chipText}
            variant={tone}
          >
            {option.label}
          </LiquidChip>
        ))}
      </View>
    </>
  );
}

function StringSingleGroup({
  label,
  onSelect,
  options,
  selected,
}: {
  label: string;
  onSelect: (value: string) => void;
  options: readonly string[];
  selected: string;
}) {
  return (
    <>
      <FieldLabel label={label} />
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <LiquidChip
            accessibilityLabel={`${label} ${option}`}
            accessibilityState={{ selected: selected === option }}
            density="compact"
            key={option}
            onPress={() => onSelect(option)}
            selected={selected === option}
            textStyle={styles.chipText}
            variant="purple"
          >
            {option}
          </LiquidChip>
        ))}
      </View>
    </>
  );
}

function StringMultiGroup({
  label,
  limit,
  onToggle,
  options,
  selected,
}: {
  label: string;
  limit: number;
  onToggle: (value: string) => void;
  options: readonly string[];
  selected: string[];
}) {
  return (
    <>
      <FieldLabel label={label} meta={`${selected.length}/${limit}`} />
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const isSelected = selected.includes(option);
          const disabled = !isSelected && selected.length >= limit;
          return (
            <LiquidChip
              accessibilityLabel={`${label} ${option}`}
              accessibilityState={{ disabled, selected: isSelected }}
              density="compact"
              disabled={disabled}
              key={option}
              onPress={() => onToggle(option)}
              selected={isSelected}
              textStyle={styles.chipText}
              variant="purple"
            >
              {option}
            </LiquidChip>
          );
        })}
      </View>
    </>
  );
}

function FieldLabel({ label, meta }: { label: string; meta?: string }) {
  return (
    <View style={styles.fieldLabelRow}>
      <ProfileText style={styles.fieldLabel}>{label}</ProfileText>
      {meta ? <ProfileText style={styles.fieldMeta}>{meta}</ProfileText> : null}
    </View>
  );
}

function draftToForm(draft: ProfileEditDraft): EditForm {
  return {
    avatarMediaId: draft.avatarMediaId,
    avatarUrl: draft.avatarUrl,
    bio: draft.bio,
    coverMediaId: draft.coverMediaId,
    coverUrl: draft.coverUrl,
    displayName: draft.displayName,
    favoriteHeroes: draft.favoriteHeroes,
    habits: draft.habits,
    rankId: draft.selectedRankId,
    region: draft.region,
    roleId: draft.selectedRoleId,
    status: draft.status,
  };
}

function stableFormKey(value: EditForm) {
  return JSON.stringify({
    avatarMediaId: value.avatarMediaId ?? null,
    bio: value.bio,
    coverMediaId: value.coverMediaId ?? null,
    displayName: value.displayName,
    favoriteHeroes: value.favoriteHeroes.map((hero) => ({
      key: heroKey(hero),
      matches: hero.matches ?? null,
      winRate: hero.winRate ?? null,
    })),
    habits: value.habits,
    rankId: value.rankId ?? null,
    region: value.region,
    roleId: value.roleId ?? null,
    status: value.status,
  });
}

function handleBack(hasChanges: boolean) {
  selectionImpact();
  if (!hasChanges) {
    router.back();
    return;
  }
  Alert.alert('Bạn có thay đổi chưa lưu', 'Rời màn hình và bỏ thay đổi?', [
    { style: 'cancel', text: 'Tiếp tục chỉnh sửa' },
    { onPress: () => router.back(), style: 'destructive', text: 'Bỏ thay đổi' },
  ]);
}

function labelFor(options: ProfileReferenceOption[], id: string | undefined) {
  return options.find((option) => option.id === id)?.label;
}

function applyBioSuggestion(current: string, suggestion: string) {
  const trimmed = current.trim();
  if (!trimmed) return suggestion;
  if (trimmed.toLowerCase().includes(suggestion.toLowerCase())) return trimmed;
  return `${trimmed}, ${suggestion}`.slice(0, maxBioLength);
}

function updateHabits(
  setForm: Dispatch<SetStateAction<EditForm | null>>,
  mapper: (habits: ProfileEditHabits) => ProfileEditHabits,
) {
  setForm((current) =>
    current ? { ...current, habits: mapper(current.habits) } : current,
  );
}

function toggleString(current: string[], value: string, limit: number) {
  if (current.includes(value)) return current.filter((item) => item !== value);
  if (current.length >= limit) {
    showFeedback('Bạn chỉ có thể chọn tối đa số tag này.');
    return current;
  }
  return [...current, value];
}

function updateHeroMatches(
  setForm: Dispatch<SetStateAction<EditForm | null>>,
  slot: number,
  matches: number | undefined,
) {
  setForm((current) => {
    if (!current) return current;
    const nextHeroes = current.favoriteHeroes.map((hero, index) =>
      index === slot ? { ...hero, matches } : hero,
    );
    return { ...current, favoriteHeroes: nextHeroes };
  });
}

function parseMatchCountInput(value: string) {
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return undefined;
  return Math.min(99999, Number(digits));
}

function replaceHeroSlot(
  setForm: Dispatch<SetStateAction<EditForm | null>>,
  slot: number | null,
  hero: ProfileHeroPickerOption,
) {
  if (slot === null) return;
  setForm((current) => {
    if (!current) return current;
    const nextHeroes = Array.from({ length: heroSlotCount })
      .map((_, index) => current.favoriteHeroes[index])
      .filter((item): item is ProfileFavoriteHero => Boolean(item));
    const selectedKey = heroKey(hero);
    const withoutDuplicate = nextHeroes.filter(
      (item, index) => index === slot || heroKey(item) !== selectedKey,
    );
    const normalized = Array.from({ length: heroSlotCount })
      .map((_, index) => withoutDuplicate[index])
      .filter((item): item is ProfileFavoriteHero => Boolean(item));
    normalized[slot] = {
      heroId: hero.heroId,
      matches: hero.matches,
      name: hero.name,
      slug: hero.slug,
      winRate: hero.winRate,
    };
    return {
      ...current,
      favoriteHeroes: normalized.filter(Boolean).slice(0, heroSlotCount),
    };
  });
}

function heroMeta(hero: ProfileFavoriteHero) {
  const parts = [
    hero.matches !== undefined ? `${hero.matches} trận` : undefined,
    hero.winRate !== undefined ? `${hero.winRate}% win` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Chưa có dữ liệu trận/win rate';
}

function heroImage(hero: ProfileFavoriteHero | undefined) {
  if (!hero) return fallbackHeroImage;
  return (
    heroImageByKey[heroVisualKey(hero.slug ?? hero.name)] ?? fallbackHeroImage
  );
}

function heroKey(hero: Pick<ProfileFavoriteHero, 'name' | 'slug'> | undefined) {
  if (!hero) return '';
  return heroVisualKey(hero.slug ?? hero.name);
}

function heroVisualKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

function showFeedback(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert(message);
}

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

const styles = StyleSheet.create({
  avatarEditBlock: { alignItems: 'center', gap: 10, width: 112 },
  avatarImage: { height: '100%', width: '100%' },
  avatarInitial: { color: '#FFFFFF', fontWeight: '900' },
  avatarInner: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.13)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioInput: { minHeight: 82, paddingTop: 12 },
  changeHeroButton: { minWidth: 54 },
  changeHeroText: {
    color: 'rgba(231,236,255,0.78)',
    fontSize: 11,
    fontWeight: '800',
  },
  chipText: { fontSize: 11.2, fontWeight: '700' },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 12,
  },
  coverActionPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(6,10,24,0.62)',
    borderColor: 'rgba(190,218,255,0.14)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: 'absolute',
    right: 10,
    top: 10,
  },
  coverActionText: {
    color: 'rgba(231,236,255,0.86)',
    fontSize: 10.5,
    fontWeight: '800',
  },
  coverEditor: {
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(103,232,255,0.12)',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 128,
    overflow: 'hidden',
  },
  coverEditorCopy: { bottom: 12, left: 13, position: 'absolute', right: 12 },
  coverEditorImage: { height: '100%', width: '100%' },
  coverEditorMeta: {
    color: 'rgba(205,216,245,0.64)',
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 3,
  },
  coverEditorTitle: {
    color: liquidColors.text.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  dirtyDot: {
    backgroundColor: 'rgba(103,232,255,0.94)',
    borderRadius: 3,
    height: 6,
    position: 'absolute',
    right: 0,
    top: 12,
    width: 6,
  },
  errorBody: {
    color: 'rgba(205,216,245,0.58)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  errorState: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  errorText: {
    color: 'rgba(255,216,168,0.78)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 12,
  },
  errorTitle: {
    color: 'rgba(255,245,230,0.92)',
    fontSize: 16,
    fontWeight: '900',
  },
  fieldLabel: {
    color: 'rgba(236,242,255,0.82)',
    fontSize: 12,
    fontWeight: '700',
  },
  fieldLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 7,
  },
  fieldMeta: {
    color: 'rgba(190,199,224,0.58)',
    fontSize: 11,
    fontWeight: '600',
  },
  heroEditCopy: { flex: 1, minWidth: 0 },
  heroEditImage: { borderRadius: 20, height: 40, width: 40 },
  heroEditIndex: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.10)',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  heroEditIndexText: {
    color: 'rgba(186,239,255,0.82)',
    fontSize: 11,
    fontWeight: '900',
  },
  heroEditMeta: {
    color: 'rgba(205,216,245,0.54)',
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 2,
  },
  heroMatchInput: {
    color: 'rgba(250,252,255,0.94)',
    fontSize: 12,
    fontWeight: '800',
    minWidth: 44,
    padding: 0,
    textAlign: 'right',
  },
  heroMatchInputRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(103,232,255,0.075)',
    borderColor: 'rgba(103,232,255,0.14)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 5,
    marginTop: 5,
    minHeight: 25,
    paddingHorizontal: 9,
  },
  heroMatchSuffix: {
    color: 'rgba(186,239,255,0.66)',
    fontSize: 10.5,
    fontWeight: '700',
  },
  heroEditName: {
    color: liquidColors.text.primary,
    fontSize: 13.5,
    fontWeight: '900',
  },
  heroEditRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.038)',
    borderColor: 'rgba(190,218,255,0.08)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    padding: 9,
  },
  heroPickedText: {
    color: 'rgba(205,216,245,0.44)',
    fontSize: 11,
    fontWeight: '800',
  },
  heroPickerCopy: { flex: 1, minWidth: 0 },
  heroPickerDisabled: { opacity: 0.42 },
  heroPickerImage: { borderRadius: 22, height: 44, width: 44 },
  heroPickerMeta: {
    color: 'rgba(205,216,245,0.56)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  heroPickerName: {
    color: liquidColors.text.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  heroPickerRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.055)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 11,
  },
  heroSheet: {
    backgroundColor: 'rgba(8,11,24,0.98)',
    borderColor: 'rgba(190,218,255,0.12)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    left: 0,
    maxHeight: '86%',
    padding: 18,
    paddingBottom: 30,
    position: 'absolute',
    right: 0,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.052)',
    borderColor: 'rgba(174,194,255,0.13)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    color: 'rgba(250,252,255,0.94)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  inputFocused: {
    backgroundColor: 'rgba(103,232,255,0.065)',
    borderColor: 'rgba(103,232,255,0.32)',
  },
  loadingBox: {
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    minHeight: 280,
  },
  mediaButton: { minWidth: 108 },
  mediaButtonText: {
    color: 'rgba(231,236,255,0.86)',
    fontSize: 11,
    fontWeight: '800',
  },
  mediaLayout: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  modalOverlay: {
    backgroundColor: 'rgba(1,3,10,0.72)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  mutedText: {
    color: 'rgba(218,226,255,0.62)',
    fontSize: 12,
    fontWeight: '600',
  },
  previewBio: {
    color: 'rgba(222,228,255,0.72)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 14,
  },
  previewCard: { marginBottom: 14, marginTop: 4 },
  previewCheck: {
    alignItems: 'center',
    backgroundColor: 'rgba(38,130,188,0.58)',
    borderColor: 'rgba(103,232,255,0.24)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 21,
    justifyContent: 'center',
    width: 21,
  },
  previewCopy: { flex: 1, minWidth: 0 },
  previewCover: {
    bottom: 0,
    left: 0,
    opacity: 0.76,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  previewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
    zIndex: 2,
  },
  previewMeta: {
    color: 'rgba(219,226,255,0.66)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  previewName: {
    color: 'rgba(250,252,255,0.96)',
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.48,
  },
  previewNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minWidth: 0,
  },
  previewStatus: {
    color: 'rgba(231,236,255,0.84)',
    fontSize: 11.5,
    fontWeight: '800',
  },
  previewStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
  },
  previewSurface: {
    borderRadius: 27,
    minHeight: 154,
    overflow: 'hidden',
    padding: 16,
  },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  primaryMiniText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  privacyLabel: {
    color: 'rgba(236,242,255,0.76)',
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  privacyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  readyDot: {
    backgroundColor: 'rgba(103,232,255,0.92)',
    borderRadius: 4,
    height: 8,
    shadowColor: '#67E8FF',
    shadowOpacity: 0.26,
    shadowRadius: 5,
    width: 8,
  },
  retryButton: { marginTop: 6, minWidth: 92 },
  saveButton: { minWidth: 70 },
  saveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  scrollContent: { paddingBottom: 54, paddingTop: 2 },
  searchBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderColor: 'rgba(190,218,255,0.10)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: liquidColors.text.primary,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    minHeight: 42,
  },
  sectionCard: { marginBottom: 14 },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  sectionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(92,114,255,0.16)',
    borderRadius: 18,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  sectionSubtitle: {
    color: 'rgba(205,216,245,0.54)',
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 3,
  },
  sectionTitle: {
    color: liquidColors.text.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.25,
  },
  sectionTitleBlock: { flex: 1, minWidth: 0 },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(205,216,245,0.22)',
    borderRadius: 999,
    height: 4,
    marginBottom: 14,
    width: 42,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetSubtitle: {
    color: 'rgba(205,216,245,0.54)',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 3,
  },
  sheetTitle: {
    color: liquidColors.text.primary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: 'rgba(205,216,245,0.60)',
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 2,
    textAlign: 'center',
  },
  title: {
    ...liquidTypography.sectionTitle,
    color: liquidColors.text.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  titleBlock: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 10,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    minHeight: 54,
  },
  topOrb: { height: 42, width: 42 },
  validationText: {
    color: 'rgba(255,216,168,0.80)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
});
