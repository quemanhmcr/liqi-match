import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ToastAndroid } from 'react-native';

import type { AuthSession } from '@/shared/auth/auth-service';
import { useAuth } from '@/shared/auth/auth-context';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';

import { ProfileText } from '../components/ProfileShared';
import { AvailabilitySection } from '../edit/components/AvailabilitySection';
import { GameProfileSection } from '../edit/components/GameProfileSection';
import { HabitSection } from '../edit/components/HabitSection';
import { HeroSection } from '../edit/components/HeroSection';
import { IdentitySection } from '../edit/components/IdentitySection';
import { LaneSection } from '../edit/components/LaneSection';
import { MediaSection } from '../edit/components/MediaSection';
import {
  ProfileEditErrorState,
  ProfileEditLoadingState,
  ProfileEditTopBar,
} from '../edit/components/ProfileEditChrome';
import { ProfileEditSaveBanner } from '../edit/components/ProfileEditSaveBanner';
import { ProfileEditPreview } from '../edit/components/ProfileEditPreview';
import { profileEditStyles as styles } from '../edit/components/profile-edit-styles';
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

export function ProfileEditScreen() {
  const { session } = useAuth();
  const draftQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return fetchProfileEditDraft(session);
    },
    queryKey: ['profile-edit-draft', session?.user.id],
  });

  return (
    <LiquidScreen
      contentContainerStyle={styles.scrollContent}
      withBottomNavPadding={false}
      withHeader={false}
    >
      {draftQuery.isLoading ? <ProfileEditLoadingState /> : null}
      {draftQuery.isError && !draftQuery.data ? (
        <ProfileEditErrorState onRetry={() => void draftQuery.refetch()} />
      ) : null}
      {session && draftQuery.data ? (
        <ProfileEditEditor
          draft={draftQuery.data}
          key={draftQuery.data.id}
          readError={draftQuery.isError}
          session={session}
        />
      ) : null}
    </LiquidScreen>
  );
}

function ProfileEditEditor({
  draft,
  readError,
  session,
}: {
  draft: ProfileEditDraft;
  readError: boolean;
  session: AuthSession;
}) {
  const queryClient = useQueryClient();
  const [baseline, setBaseline] = useState<ProfileEditForm>(() =>
    cloneProfileEditForm(draft.form),
  );
  const [form, setForm] = useState<ProfileEditForm>(() =>
    cloneProfileEditForm(draft.form),
  );
  const [pickingMedia, setPickingMedia] = useState<ProfileEditMediaSlot>();
  const [lastSaveResult, setLastSaveResult] = useState<ProfileEditSaveResult>();

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
    (item) => item?.status === 'uploaded-unassociated',
  );

  const saveMutation = useMutation({
    mutationFn: (request: { onlySections?: ProfileEditSectionId[] }) =>
      saveProfileEditChanges({
        baseline,
        current: form,
        draft,
        onlySections: request.onlySections,
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
      await queryClient.invalidateQueries({ queryKey: ['profile-view'] });

      if (result.outcome !== 'saved') return;
      await queryClient.invalidateQueries({ queryKey: ['profile-edit-draft'] });
      showFeedback('Đã cập nhật hồ sơ');
      router.back();
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

  const pickImage = async (slot: ProfileEditMediaSlot) => {
    if (pickingMedia || saveMutation.isPending) return;
    const existing = form.media.staged[slot];
    if (existing?.status === 'uploaded-unassociated') {
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
          : (durable.error ?? 'Ảnh chưa hợp lệ.'),
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
  };

  const handleBack = () => {
    selectionImpact();
    if (!hasChanges && !hasUploadedButUnassociated) {
      router.back();
      return;
    }
    Alert.alert(
      'Bạn có thay đổi chưa lưu',
      hasUploadedButUnassociated
        ? 'Có asset đã upload nhưng chưa liên kết. Rời màn hình sẽ giữ asset để retry sau, không tự xoá âm thầm.'
        : 'Các field chưa lưu sẽ bị bỏ. Ảnh đã chọn được giữ như bản nháp để tiếp tục lần sau?',
      [
        { style: 'cancel', text: 'Tiếp tục chỉnh sửa' },
        {
          onPress: () => router.back(),
          style: 'destructive',
          text: 'Rời và giữ ảnh nháp',
        },
      ],
    );
  };

  return (
    <>
      <ProfileEditTopBar
        canSave={canSave}
        hasChanges={hasChanges}
        loading={saveMutation.isPending}
        onBack={handleBack}
        onSave={() => saveMutation.mutate({})}
      />
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
      <ProfileEditPreview draft={draft} form={form} />
      {draft.meta.readIssues.length || draft.meta.habitIssues.length ? (
        <ProfileText style={styles.errorText}>
          Một số dữ liệu legacy chưa thể chuyển losslessly. Field không liên
          quan vẫn lưu độc lập; section bị ảnh hưởng cần được chọn lại bằng giá
          trị canonical trước khi ghi.
        </ProfileText>
      ) : null}
      <IdentitySection
        identity={form.identity}
        onChange={(identity) => setForm({ ...form, identity })}
      />
      <GameProfileSection
        gameProfile={form.gameProfile}
        hasGameProfileRecord={draft.meta.hasGameProfileRecord}
        onChange={(gameProfile) => setForm({ ...form, gameProfile })}
      />
      <LaneSection
        onChange={(laneSelection) => setForm({ ...form, laneSelection })}
        onLimitReached={showSelectionLimit}
        selection={form.laneSelection}
      />
      <HeroSection
        heroes={form.heroes}
        onChange={(heroes) => setForm({ ...form, heroes })}
      />
      <HabitSection
        habits={form.habits}
        onChange={(habits) => setForm({ ...form, habits })}
        onLimitReached={showSelectionLimit}
      />
      <AvailabilitySection availability={form.availability} />
      <MediaSection
        disabled={Boolean(pickingMedia || saveMutation.isPending)}
        displayName={form.identity.displayName}
        media={form.media}
        onPick={(slot) => void pickImage(slot)}
      />
      {readError ? (
        <ProfileText style={styles.errorText}>
          Chưa đọc được bản mới nhất; form cục bộ vẫn được giữ nguyên.
        </ProfileText>
      ) : null}
    </>
  );
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
              avatarUrl: item.uploadedUrl,
            }
          : {
              coverMediaId: item.uploadedAssetId,
              coverUrl: item.uploadedUrl,
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
