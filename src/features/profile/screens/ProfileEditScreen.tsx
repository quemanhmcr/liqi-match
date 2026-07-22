import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Platform,
  StyleSheet,
  ToastAndroid,
  View,
  type ScrollView,
} from 'react-native';

import { appRoutes } from '@/app-shell/navigation/routes';
import type { AuthSession } from '@/shared/auth/auth-service';
import { useAuth } from '@/shared/auth/auth-context';
import { AppScreen, AppText, appSpacing } from '@/shared/ui';

import {
  ProfileEditBody,
  ProfileEditErrorState,
  ProfileEditHeader,
  ProfileEditLoadingState,
  ProfileEditSaveDock,
  type ProfileEditCategoryId,
} from '../edit/components/ProfileEditExperience';
import { ProfileEditSaveBanner } from '../edit/components/ProfileEditSaveBanner';
import { ProfilePlayStyleChangePreview } from '../edit/components/ProfilePlayStyleChangePreview';
import {
  cloneProfileEditForm,
  getDirtyProfileEditSections,
  type ProfileEditDraft,
  type ProfileEditForm,
  type ProfileEditMediaSlot,
  type ProfileEditSectionId,
  type ProfileEditStagedMedia,
} from '../edit/model/profile-edit-model';
import {
  clearPendingProfileMediaSlot,
  clearProfileMediaDraftItem,
  consumePendingProfileMediaSlot,
  persistProfileMediaDraftItem,
  rememberPendingProfileMediaSlot,
  restoreProfileMediaDraft,
} from '../edit/model/profile-media-picker-recovery';
import {
  firstPickedProfileImage,
  imagePickerAssetToProfileLocalAsset,
  stageProfileMedia,
} from '../edit/model/profile-media-staging';
import {
  saveProfileEditChanges,
  type ProfileEditSaveResult,
} from '../edit/services/profile-edit-coordinator';
import { fetchProfileEditDraft } from '../edit/services/profile-edit-read-service';
import {
  presentProfilePlayStyleHabits,
  type ProfilePlayStyleSlot,
  type ProfilePlayStyleTile,
} from '../model/profile-play-style-presenter';
import { profileMediaUrl } from '../services/profile-service';
import { profileEditUi } from '../ui/profile-edit-ui';

export function ProfileEditScreen({
  initialCategory = 'identity',
}: Readonly<{ initialCategory?: ProfileEditCategoryId }> = {}) {
  const { session } = useAuth();
  const draftQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return fetchProfileEditDraft(session);
    },
    queryKey: ['profile-edit-draft', session?.user.id],
  });

  if (!session) {
    return (
      <AppScreen
        contentContainerStyle={styles.stateScreen}
        scroll={false}
        withBottomNavPadding={false}
        withHeader={false}
      >
        <ProfileEditErrorState
          onRetry={() => router.replace(appRoutes.auth.login)}
        />
      </AppScreen>
    );
  }

  if (draftQuery.isLoading) {
    return (
      <AppScreen
        contentContainerStyle={styles.stateScreen}
        scroll={false}
        withBottomNavPadding={false}
        withHeader={false}
      >
        <ProfileEditLoadingState />
      </AppScreen>
    );
  }

  if (draftQuery.isError && !draftQuery.data) {
    return (
      <AppScreen
        contentContainerStyle={styles.stateScreen}
        scroll={false}
        withBottomNavPadding={false}
        withHeader={false}
      >
        <ProfileEditErrorState onRetry={() => void draftQuery.refetch()} />
      </AppScreen>
    );
  }

  if (!draftQuery.data) {
    return (
      <AppScreen
        contentContainerStyle={styles.stateScreen}
        scroll={false}
        withBottomNavPadding={false}
        withHeader={false}
      >
        <ProfileEditErrorState onRetry={() => void draftQuery.refetch()} />
      </AppScreen>
    );
  }

  return (
    <ProfileEditEditor
      draft={draftQuery.data}
      initialCategory={initialCategory}
      key={`${draftQuery.data.id}:${initialCategory}`}
      readError={draftQuery.isError}
      session={session}
    />
  );
}

function ProfileEditEditor({
  draft,
  initialCategory,
  readError,
  session,
}: Readonly<{
  draft: ProfileEditDraft;
  initialCategory: ProfileEditCategoryId;
  readError: boolean;
  session: AuthSession;
}>) {
  const queryClient = useQueryClient();
  const screenScrollRef = useRef<ScrollView>(null);
  const [baseline, setBaseline] = useState<ProfileEditForm>(() =>
    cloneProfileEditForm(draft.form),
  );
  const [form, setForm] = useState<ProfileEditForm>(() =>
    cloneProfileEditForm(draft.form),
  );
  const [profileVersion, setProfileVersion] = useState(
    draft.meta.profileVersion,
  );
  const [pickingMedia, setPickingMedia] = useState<ProfileEditMediaSlot>();
  const [lastSaveResult, setLastSaveResult] = useState<ProfileEditSaveResult>();
  const [activeCategory, setActiveCategory] =
    useState<ProfileEditCategoryId>(initialCategory);
  const playStyleTiles = useMemo(
    () => presentProfilePlayStyleHabits(form.habits),
    [form.habits],
  );
  const previousPlayStyleArchetypesRef = useRef(
    profilePlayStyleArchetypes(playStyleTiles),
  );
  const quickPreviewSequenceRef = useRef(0);
  const [quickPreview, setQuickPreview] =
    useState<Readonly<{ sequence: number; tile: ProfilePlayStyleTile }>>();
  const clearQuickPreview = useCallback(() => {
    setQuickPreview(undefined);
  }, []);
  const dismissQuickPreview = useCallback((sequence: number) => {
    setQuickPreview((current) =>
      current?.sequence === sequence ? undefined : current,
    );
  }, []);
  const changeActiveCategory = useCallback(
    (category: ProfileEditCategoryId) => {
      if (category !== 'playStyle') clearQuickPreview();
      setActiveCategory(category);
    },
    [clearQuickPreview],
  );

  useEffect(() => {
    const previous = previousPlayStyleArchetypesRef.current;
    previousPlayStyleArchetypesRef.current =
      profilePlayStyleArchetypes(playStyleTiles);
    if (activeCategory !== 'playStyle') return;

    const changedTile = playStyleTiles.find(
      (tile) => previous[tile.slot] !== tile.archetypeId,
    );
    if (!changedTile) return;

    quickPreviewSequenceRef.current += 1;
    const sequence = quickPreviewSequenceRef.current;
    setQuickPreview({ sequence, tile: changedTile });
    AccessibilityInfo.announceForAccessibility(
      `Bản xem trước ${profilePlayStyleAccessibilityLabel(changedTile.slot)}: ${changedTile.title}`,
    );
  }, [activeCategory, playStyleTiles]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      restoreProfileMediaDraft(draft.id),
      consumePendingProfileMediaSlot(),
      ImagePicker.getPendingResultAsync(),
    ])
      .then(async ([stored, pendingSlot, pendingResult]) => {
        if (!active) return;
        const recovered = { ...stored };
        const pendingAsset = firstPickedProfileImage(pendingResult);
        if (pendingSlot && pendingAsset) {
          const staged = stageProfileMedia(
            pendingSlot,
            imagePickerAssetToProfileLocalAsset(pendingAsset),
          );
          recovered[pendingSlot] = await persistProfileMediaDraftItem(
            draft.id,
            staged,
          );
        }

        for (const slot of ['avatar', 'cover'] as const) {
          const item = recovered[slot];
          if (!item?.uploadedAssetId) continue;
          const associatedId =
            slot === 'avatar'
              ? draft.form.media.avatarMediaId
              : draft.form.media.coverMediaId;
          if (associatedId === item.uploadedAssetId) {
            await clearProfileMediaDraftItem(draft.id, slot);
            delete recovered[slot];
          }
        }

        if (!active) return;
        setForm((current) => applyRecoveredMedia(current, recovered));
        if (Object.keys(recovered).length) {
          showFeedback('Đã khôi phục bản nháp ảnh hồ sơ.');
        }
      })
      .catch((error) => {
        if (!active) return;
        Alert.alert(
          'Không khôi phục được ảnh nháp',
          error instanceof Error ? error.message : 'Vui lòng chọn lại ảnh.',
        );
      });

    return () => {
      active = false;
    };
  }, [draft]);

  const dirtySections = useMemo(
    () => getDirtyProfileEditSections(baseline, form),
    [baseline, form],
  );
  const hasChanges = dirtySections.length > 0;
  const hasUploadedButUnassociated = Object.values(form.media.staged).some(
    (item) => item?.status === 'uploaded',
  );

  const saveMutation = useMutation({
    mutationFn: (request: { onlySections?: ProfileEditSectionId[] }) =>
      saveProfileEditChanges({
        baseline,
        current: form,
        draft,
        onlySections: request.onlySections,
        profileVersion,
        session,
      }),
    onError: (error) => {
      Alert.alert(
        'Không lưu được',
        error instanceof Error ? error.message : 'Vui lòng thử lại.',
      );
    },
    onSuccess: async (result) => {
      setBaseline(result.baseline);
      setForm(result.form);
      setLastSaveResult(result.outcome === 'saved' ? undefined : result);
      setProfileVersion(result.profileVersion);
      await queryClient.invalidateQueries({ queryKey: ['profile-view'] });

      if (result.outcome !== 'saved') return;
      await queryClient.invalidateQueries({ queryKey: ['profile-edit-draft'] });
      showFeedback('Đã cập nhật hồ sơ');
      leaveEditor();
    },
  });

  const canSave = Boolean(
    hasChanges &&
    form.identity.displayName.trim().length >= 2 &&
    form.identity.displayName.trim().length <= 20 &&
    form.identity.bio.trim().length <= 80 &&
    (!dirtySections.includes('gameProfile') ||
      (draft.meta.hasGameProfileRecord &&
        form.gameProfile.handle.trim().length >= 2)) &&
    !saveMutation.isPending &&
    !pickingMedia,
  );

  const pickImage = useCallback(
    async (slot: ProfileEditMediaSlot) => {
      if (pickingMedia || saveMutation.isPending) return;
      const existing = form.media.staged[slot];
      if (existing?.status === 'uploaded') {
        Alert.alert(
          'Ảnh đang chờ liên kết',
          'Hãy thử lưu lại asset hiện có trước khi chọn ảnh khác để tránh orphan asset.',
        );
        return;
      }

      selectionImpact();
      setPickingMedia(slot);
      try {
        await rememberPendingProfileMediaSlot(slot);
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          await clearPendingProfileMediaSlot();
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
        await clearPendingProfileMediaSlot();
        const asset = firstPickedProfileImage(result);
        if (!asset) return;

        const staged = stageProfileMedia(
          slot,
          imagePickerAssetToProfileLocalAsset(asset),
        );
        const durable = await persistProfileMediaDraftItem(draft.id, staged);
        setForm((current) => applyStagedMedia(current, durable));
        showFeedback(
          durable.status === 'ready'
            ? 'Đã giữ ảnh cục bộ. Bấm Lưu để upload.'
            : (durable.failure?.message ?? 'Ảnh chưa hợp lệ.'),
        );
      } catch (error) {
        await clearPendingProfileMediaSlot().catch(() => undefined);
        Alert.alert(
          'Không thể chọn ảnh',
          error instanceof Error ? error.message : 'Vui lòng thử lại.',
        );
      } finally {
        setPickingMedia(undefined);
      }
    },
    [draft.id, form.media.staged, pickingMedia, saveMutation.isPending],
  );

  const handleBack = () => {
    selectionImpact();
    if (!hasChanges && !hasUploadedButUnassociated) {
      leaveEditor();
      return;
    }
    Alert.alert(
      'Bạn có thay đổi chưa lưu',
      hasUploadedButUnassociated
        ? 'Có asset đã upload nhưng chưa liên kết. Rời màn hình sẽ giữ asset để retry sau, không tự xoá âm thầm.'
        : 'Các field chưa lưu sẽ bị bỏ. Ảnh đã chọn vẫn được giữ như bản nháp để tiếp tục lần sau.',
      [
        { style: 'cancel', text: 'Tiếp tục chỉnh sửa' },
        {
          onPress: leaveEditor,
          style: 'destructive',
          text: 'Rời và giữ ảnh nháp',
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <AppScreen
        bottomSlot={
          <ProfileEditSaveDock
            canSave={canSave}
            dirtyCount={dirtySections.length}
            loading={saveMutation.isPending}
            onSave={() => saveMutation.mutate({})}
          />
        }
        contentContainerStyle={styles.screenContent}
        scrollViewRef={screenScrollRef}
        withBottomNavPadding={false}
        withHeader={false}
      >
        <ProfileEditHeader hasChanges={hasChanges} onBack={handleBack} />
        {lastSaveResult ? (
          <ProfileEditSaveBanner
            onRetry={() =>
              saveMutation.mutate({
                onlySections: lastSaveResult.retrySections,
              })
            }
            result={lastSaveResult}
          />
        ) : null}
        {draft.meta.readIssues.length || draft.meta.habitIssues.length ? (
          <AppText tone="warning" variant="bodySmall">
            Một số dữ liệu cũ chưa chuyển losslessly. Phần không liên quan vẫn
            lưu độc lập; mục bị ảnh hưởng cần được chọn lại bằng giá trị hiện
            hành.
          </AppText>
        ) : null}
        <ProfileEditBody
          activeCategory={activeCategory}
          disabled={Boolean(pickingMedia || saveMutation.isPending)}
          dirtySections={dirtySections}
          draft={draft}
          form={form}
          onActiveCategoryChange={changeActiveCategory}
          onChange={setForm}
          onLimitReached={showSelectionLimit}
          onPickMedia={pickImage}
          scrollViewRef={screenScrollRef}
        />
        {readError ? (
          <AppText tone="warning" variant="bodySmall">
            Chưa đọc được bản mới nhất; form cục bộ vẫn được giữ nguyên.
          </AppText>
        ) : null}
      </AppScreen>
      {quickPreview ? (
        <ProfilePlayStyleChangePreview
          key={quickPreview.sequence}
          onDismiss={dismissQuickPreview}
          sequence={quickPreview.sequence}
          tile={quickPreview.tile}
        />
      ) : null}
    </View>
  );
}

function profilePlayStyleArchetypes(tiles: readonly ProfilePlayStyleTile[]) {
  return Object.fromEntries(
    tiles.map((tile) => [tile.slot, tile.archetypeId]),
  ) as Readonly<
    Record<ProfilePlayStyleSlot, ProfilePlayStyleTile['archetypeId']>
  >;
}

function profilePlayStyleAccessibilityLabel(slot: ProfilePlayStyleSlot) {
  if (slot === 'goal') return 'Mục tiêu chơi';
  if (slot === 'coordination') return 'Cách phối hợp';
  return 'Bản sắc chiến thuật';
}

function leaveEditor() {
  if (router.canGoBack?.()) {
    router.back();
    return;
  }
  router.replace(appRoutes.profile.self);
}

function applyRecoveredMedia(
  form: ProfileEditForm,
  recovered: Partial<Record<ProfileEditMediaSlot, ProfileEditStagedMedia>>,
) {
  let next = form;
  for (const slot of ['avatar', 'cover'] as const) {
    const item = recovered[slot];
    if (!item) continue;
    next = applyStagedMedia(next, item);
    if (!item.uploadedAssetId) continue;
    next = {
      ...next,
      media: {
        ...next.media,
        ...(slot === 'avatar'
          ? {
              avatarMediaId: item.uploadedAssetId,
              avatarUrl: profileMediaUrl(item.uploadedAssetId),
            }
          : {
              coverMediaId: item.uploadedAssetId,
              coverUrl: profileMediaUrl(item.uploadedAssetId),
            }),
      },
    };
  }
  return next;
}

function applyStagedMedia(
  form: ProfileEditForm,
  staged: ProfileEditStagedMedia,
): ProfileEditForm {
  return {
    ...form,
    media: {
      ...form.media,
      staged: { ...form.media.staged, [staged.slot]: staged },
    },
  };
}

function showSelectionLimit() {
  showFeedback('Bạn đã chọn tối đa số mục cho phần này.');
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
  root: { flex: 1 },
  screenContent: {
    gap: profileEditUi.screen.gap,
    paddingBottom: profileEditUi.screen.bottomContentInset,
  },
  stateScreen: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: appSpacing['4xl'],
  },
});
