import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  OnboardingCinematicShell,
  OnboardingInfoCard,
  OnboardingPrimaryButton,
  OnboardingSecondaryAction,
  OnboardingSection,
} from '@/features/onboarding/components/OnboardingCinematic';
import {
  countUploadableOnboardingMedia,
  type LocalImageAsset,
  type UploadProgress,
  uploadOnboardingMedia,
} from '@/features/media/media-upload-service';
import {
  getOnboardingSnapshot,
  updateOnboardingSnapshot,
} from '@/features/onboarding/onboarding-store';
import { completeOnboardingProfile } from '@/features/onboarding/profile-service';
import { useAuth } from '@/shared/auth/auth-context';

type MediaKind = 'avatar' | 'cover' | 'wall';
type SourceRequest = { kind: MediaKind; index?: number } | null;
type SubmitPhase = 'idle' | 'saving' | 'media' | 'done';

const WALL_SLOT_COUNT = 4;

export default function ProfileMediaScreen() {
  const { session } = useAuth();
  const [avatar, setAvatar] = useState<LocalImageAsset | null>(null);
  const [cover, setCover] = useState<LocalImageAsset | null>(null);
  const [wallItems, setWallItems] = useState<(LocalImageAsset | null)[]>(
    Array.from({ length: WALL_SLOT_COUNT }, () => null),
  );
  const [sourceRequest, setSourceRequest] = useState<SourceRequest>(null);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const wallCount = wallItems.filter(Boolean).length;
  const selectedMediaCount =
    Number(Boolean(avatar)) + Number(Boolean(cover)) + wallCount;
  const busy = submitPhase !== 'idle';
  const uploadableMedia = useMemo(
    () => ({
      avatar,
      cover,
      wallItems: wallItems.filter((item): item is LocalImageAsset =>
        Boolean(item),
      ),
    }),
    [avatar, cover, wallItems],
  );
  const uploadCount = countUploadableOnboardingMedia(uploadableMedia);

  const mediaDraft = {
    avatar: Boolean(avatar),
    cover: Boolean(cover),
    wallCount,
  };

  const openPicker = (kind: MediaKind, index?: number) => {
    if (busy) return;
    setError(null);
    setSourceRequest({ kind, index });
  };

  const assignMedia = (
    request: Exclude<SourceRequest, null>,
    asset: ImagePicker.ImagePickerAsset,
  ) => {
    const media: LocalImageAsset = {
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      height: asset.height,
      mimeType: asset.mimeType,
      uri: asset.uri,
      width: asset.width,
    };

    if (request.kind === 'avatar') {
      setAvatar(media);
      return;
    }

    if (request.kind === 'cover') {
      setCover(media);
      return;
    }

    if (request.index === undefined) return;
    setWallItems((current) =>
      current.map((item, index) => (index === request.index ? media : item)),
    );
  };

  const removeWallImage = (indexToRemove: number) => {
    if (busy) return;
    setWallItems((current) =>
      current.map((item, index) => (index === indexToRemove ? null : item)),
    );
  };

  const pickImage = async (source: 'camera' | 'library') => {
    const request = sourceRequest;
    if (!request) return;

    setSourceRequest(null);
    setError(null);

    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Bạn cần cấp quyền camera để chụp ảnh mới.');
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        allowsEditing: request.kind !== 'wall',
        aspect:
          request.kind === 'avatar'
            ? [1, 1]
            : request.kind === 'cover'
              ? [16, 9]
              : undefined,
        exif: false,
        mediaTypes: ['images'],
        quality: 0.88,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      assignMedia(request, asset);
    } catch {
      setError('Không thể mở hoặc xử lý ảnh này. Vui lòng thử lại.');
    }
  };

  const goBack = () => {
    if (busy) return;
    router.back();
  };

  const finish = async () => {
    if (busy) return;

    updateOnboardingSnapshot({ mediaDraft });

    if (!session) {
      router.replace('/');
      return;
    }

    setSubmitPhase('saving');
    setUploadProgress(null);
    setError(null);

    let profileSaved = false;

    try {
      const completed = await completeOnboardingProfile(
        session,
        getOnboardingSnapshot(),
      );

      if (!completed) {
        throw new Error('Hồ sơ chưa được xác nhận hoàn tất. Vui lòng thử lại.');
      }

      profileSaved = true;

      if (uploadCount > 0) {
        setSubmitPhase('media');
        await uploadOnboardingMedia(session, uploadableMedia, (progress) =>
          setUploadProgress(progress),
        );
      }

      setSubmitPhase('done');
      await new Promise((resolve) => setTimeout(resolve, 700));
      router.replace('/home');
    } catch (caught) {
      setSubmitPhase('idle');
      setUploadProgress(null);
      const message =
        caught instanceof Error ? caught.message : 'Không thể lưu hồ sơ.';
      setError(
        profileSaved
          ? `Hồ sơ đã lưu, nhưng ảnh chưa upload xong. ${message}`
          : message,
      );
    }
  };

  return (
    <View style={styles.root}>
      <OnboardingCinematicShell
        contentContainerStyle={styles.content}
        footer={
          <View>
            <OnboardingPrimaryButton
              disabled={busy}
              onPress={finish}
              showArrow={!busy}
              tone="orange"
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : 'Tạo hồ sơ'}
            </OnboardingPrimaryButton>
            <OnboardingSecondaryAction disabled={busy} onPress={goBack}>
              Quay lại
            </OnboardingSecondaryAction>
          </View>
        }
        headerDensity="compact"
        step={6}
        subtitle="Thêm avatar, ảnh game và vài khoảnh khắc để hồ sơ nổi bật hơn trong box chat."
        title="Hoàn tất hồ sơ"
        tone="orange"
      >
        <OnboardingSection
          meta={avatar ? 'Đã thêm' : 'Nên thêm'}
          subtitle="Ảnh vuông, dùng làm tín hiệu nhận diện chính trên hồ sơ."
          title="Ảnh đại diện"
        >
          <Pressable
            accessibilityLabel={
              avatar ? 'Đổi ảnh đại diện' : 'Chọn ảnh đại diện'
            }
            accessibilityRole="button"
            disabled={busy}
            onPress={() => openPicker('avatar')}
            style={({ pressed }) => [
              styles.avatarRow,
              pressed && !busy && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <View style={styles.avatarPreview}>
              {avatar ? (
                <Image
                  source={{ uri: avatar.uri }}
                  style={styles.avatarImage}
                />
              ) : (
                <Text style={styles.placeholderIcon}>+</Text>
              )}
            </View>
            <View style={styles.mediaCopy}>
              <Text style={styles.mediaTitle}>
                {avatar ? 'Đã có ảnh đại diện' : 'Chọn ảnh đại diện'}
              </Text>
              <Text style={styles.mediaMeta}>
                {avatar
                  ? 'Chạm để đổi ảnh khác'
                  : 'Nên rõ mặt hoặc avatar game dễ nhận ra'}
              </Text>
            </View>
            <Text style={styles.mediaAction}>{avatar ? 'Đổi' : 'Thêm'}</Text>
          </Pressable>
        </OnboardingSection>

        <OnboardingSection
          meta={cover ? 'Đã thêm' : 'Tuỳ chọn'}
          subtitle="Ảnh ngang 16:9, hợp để khoe lobby, rank hoặc phong cách chơi."
          title="Ảnh hồ sơ game"
        >
          <Pressable
            accessibilityLabel={
              cover ? 'Đổi ảnh hồ sơ game' : 'Chọn ảnh hồ sơ game'
            }
            accessibilityRole="button"
            disabled={busy}
            onPress={() => openPicker('cover')}
            style={({ pressed }) => [
              styles.coverBox,
              pressed && !busy && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            {cover ? (
              <>
                <Image source={{ uri: cover.uri }} style={styles.coverImage} />
                <LinearGradient
                  colors={['rgba(2,5,14,0)', 'rgba(2,5,14,0.88)']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.coverCopy}>
                  <Text style={styles.coverTitle}>Đã có ảnh hồ sơ</Text>
                  <Text style={styles.coverMeta}>Chạm để đổi ảnh</Text>
                </View>
              </>
            ) : (
              <View style={styles.coverEmpty}>
                <Text style={styles.placeholderIcon}>+</Text>
                <Text style={styles.mediaTitle}>Thêm ảnh hồ sơ game</Text>
                <Text style={styles.mediaMeta}>Ảnh ngang tỷ lệ 16:9</Text>
              </View>
            )}
          </Pressable>
        </OnboardingSection>

        <OnboardingSection
          meta={`${wallCount}/4`}
          subtitle="Khoảnh khắc trong trận, ảnh sảnh chờ hoặc highlight cá nhân."
          title="Tường ảnh"
        >
          <View style={styles.wallGrid}>
            {wallItems.map((item, index) => (
              <Pressable
                accessibilityLabel={`Chọn ảnh tường số ${index + 1}`}
                accessibilityRole="button"
                disabled={busy}
                key={index}
                onPress={() => openPicker('wall', index)}
                style={({ pressed }) => [
                  styles.wallTile,
                  pressed && !busy && styles.pressed,
                  busy && styles.disabled,
                ]}
              >
                {item ? (
                  <>
                    <Image
                      source={{ uri: item.uri }}
                      style={styles.wallImage}
                    />
                    <LinearGradient
                      colors={['rgba(2,5,14,0)', 'rgba(2,5,14,0.42)']}
                      style={StyleSheet.absoluteFill}
                    />
                    <Pressable
                      disabled={busy}
                      hitSlop={8}
                      onPress={() => removeWallImage(index)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.wallPlaceholder}>+</Text>
                )}
              </Pressable>
            ))}
          </View>
        </OnboardingSection>

        <OnboardingInfoCard>
          <Text style={styles.privacyTitle}>
            Bạn luôn kiểm soát ảnh của mình
          </Text>
          <Text style={styles.privacyText}>
            {selectedMediaCount > 0
              ? `${selectedMediaCount} ảnh đã sẵn sàng. Khi bấm tạo hồ sơ, app sẽ lưu dữ liệu trước rồi upload ảnh lên R2 và gắn ảnh đại diện vào hồ sơ.`
              : 'Bạn có thể bỏ qua ảnh ở bước này. Hồ sơ vẫn được lưu đầy đủ và bạn có thể thêm ảnh sau.'}
          </Text>
        </OnboardingInfoCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </OnboardingCinematicShell>

      <SourcePicker
        onCamera={() => pickImage('camera')}
        onClose={() => setSourceRequest(null)}
        onLibrary={() => pickImage('library')}
        title={sourceRequestTitle(sourceRequest)}
        visible={Boolean(sourceRequest)}
      />

      <SubmitProgressOverlay
        phase={submitPhase}
        uploadCount={uploadCount}
        uploadProgress={uploadProgress}
      />
    </View>
  );
}

function sourceRequestTitle(request: SourceRequest) {
  if (request?.kind === 'avatar') return 'Thêm ảnh đại diện';
  if (request?.kind === 'cover') return 'Thêm ảnh hồ sơ game';
  return 'Thêm ảnh vào tường ảnh';
}

function SourcePicker({
  onCamera,
  onClose,
  onLibrary,
  title,
  visible,
}: {
  onCamera: () => void;
  onClose: () => void;
  onLibrary: () => void;
  title: string;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.modalOverlay}>
        <Pressable style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={onLibrary} style={styles.sheetAction}>
            <Text style={styles.sheetActionText}>Chọn từ thư viện</Text>
          </Pressable>
          <Pressable onPress={onCamera} style={styles.sheetAction}>
            <Text style={styles.sheetActionText}>Chụp ảnh mới</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.sheetCancel}>
            <Text style={styles.sheetCancelText}>Huỷ</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SubmitProgressOverlay({
  phase,
  uploadCount,
  uploadProgress,
}: {
  phase: SubmitPhase;
  uploadCount: number;
  uploadProgress: UploadProgress | null;
}) {
  if (phase === 'idle') return null;

  const done = phase === 'done';

  return (
    <Modal animationType="fade" transparent visible>
      <View style={styles.progressOverlay}>
        <View style={styles.progressCard}>
          <View style={[styles.progressBadge, done && styles.successBadge]}>
            {done ? (
              <Text style={styles.successCheck}>✓</Text>
            ) : (
              <ActivityIndicator color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.progressTitle}>
            {done ? 'Hồ sơ đã sẵn sàng' : 'Đang tạo hồ sơ của bạn'}
          </Text>
          <Text style={styles.progressText}>
            {progressDetail({ phase, uploadCount, uploadProgress })}
          </Text>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={['rgba(204,151,255,0.96)', 'rgba(103,232,255,0.88)']}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={[
                styles.progressFill,
                {
                  width: `${progressPercent({
                    phase,
                    uploadCount,
                    uploadProgress,
                  })}%` as `${number}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.progressHint}>
            Vui lòng giữ app mở trong giây lát.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function progressDetail(input: {
  phase: SubmitPhase;
  uploadCount: number;
  uploadProgress: UploadProgress | null;
}) {
  if (input.phase === 'saving') {
    return 'Đang lưu hồ sơ, rank, lane, tướng và thói quen chơi.';
  }

  if (input.phase === 'media') {
    const completed = input.uploadProgress?.completed ?? 0;
    const total = input.uploadProgress?.total ?? input.uploadCount;
    return `Đang upload ảnh lên R2 (${completed}/${total}).`;
  }

  return 'Đang đưa bạn vào trang chính.';
}

function progressPercent(input: {
  phase: SubmitPhase;
  uploadCount: number;
  uploadProgress: UploadProgress | null;
}) {
  if (input.phase === 'saving') return 38;
  if (input.phase === 'done') return 100;

  const total = input.uploadProgress?.total ?? input.uploadCount;
  if (!total) return 72;

  return Math.min(
    92,
    48 + ((input.uploadProgress?.completed ?? 0) / total) * 42,
  );
}

const styles = StyleSheet.create({
  avatarImage: { height: '100%', width: '100%' },
  avatarPreview: {
    alignItems: 'center',
    backgroundColor: 'rgba(178,92,255,0.08)',
    borderColor: 'rgba(204,151,255,0.14)',
    borderRadius: 29,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 58,
  },
  avatarRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.022)',
    borderColor: 'rgba(255,255,255,0.038)',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  content: { gap: 8, paddingBottom: 8 },
  coverBox: {
    alignItems: 'center',
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(255,255,255,0.022)',
    borderColor: 'rgba(255,255,255,0.038)',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverCopy: { bottom: 14, left: 14, position: 'absolute', right: 14 },
  coverEmpty: { alignItems: 'center', gap: 6 },
  coverImage: { height: '100%', width: '100%' },
  coverMeta: {
    color: 'rgba(222,228,251,0.38)',
    fontSize: 10.2,
    fontWeight: '400',
    marginTop: 3,
  },
  coverTitle: {
    color: 'rgba(248,250,255,0.86)',
    fontSize: 13.2,
    fontWeight: '500',
  },
  disabled: { opacity: 0.48 },
  error: {
    color: '#FFD7E4',
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
  },
  mediaAction: {
    color: 'rgba(255,184,107,0.64)',
    fontSize: 11.4,
    fontWeight: '500',
  },
  mediaCopy: { flex: 1 },
  mediaMeta: {
    color: 'rgba(222,228,251,0.38)',
    fontSize: 10.2,
    fontWeight: '400',
    lineHeight: 13.8,
    marginTop: 3,
  },
  mediaTitle: {
    color: 'rgba(248,250,255,0.86)',
    fontSize: 13.2,
    fontWeight: '500',
  },
  modalOverlay: {
    backgroundColor: 'rgba(2,4,12,0.76)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 18,
  },
  placeholderIcon: {
    color: 'rgba(255,216,174,0.78)',
    fontSize: 28,
    fontWeight: '300',
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  privacyText: {
    color: 'rgba(222,228,251,0.38)',
    fontSize: 10.2,
    lineHeight: 13.8,
    marginTop: 5,
  },
  privacyTitle: {
    color: 'rgba(248,250,255,0.86)',
    fontSize: 13.2,
    fontWeight: '500',
  },
  progressBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(138,77,255,0.70)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  progressCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,12,26,0.84)',
    borderColor: 'rgba(255,255,255,0.075)',
    borderRadius: 26,
    borderWidth: 1,
    padding: 20,
    width: '100%',
  },
  progressFill: {
    borderRadius: 999,
    height: '100%',
  },
  progressHint: {
    color: 'rgba(210,218,245,0.42)',
    fontSize: 11.6,
    fontWeight: '500',
    marginTop: 12,
  },
  progressOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(2,4,12,0.80)',
    flex: 1,
    justifyContent: 'center',
    padding: 22,
  },
  progressText: {
    color: 'rgba(222,228,251,0.44)',
    fontSize: 10.9,
    lineHeight: 14.8,
    marginTop: 8,
    textAlign: 'center',
  },
  progressTitle: {
    color: 'rgba(248,250,255,0.90)',
    fontSize: 14.2,
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
  },
  progressTrack: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
    height: 6,
    marginTop: 16,
    overflow: 'hidden',
    width: '100%',
  },
  removeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(5,7,19,0.66)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 999,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 7,
    top: 7,
    width: 22,
  },
  removeText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  root: { backgroundColor: '#02050E', flex: 1 },
  sheet: {
    backgroundColor: 'rgba(8,12,26,0.92)',
    borderColor: 'rgba(255,255,255,0.075)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 9,
    padding: 15,
  },
  sheetAction: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    padding: 15,
  },
  sheetActionText: {
    color: 'rgba(248,250,255,0.90)',
    fontSize: 14.2,
    fontWeight: '600',
  },
  sheetCancel: { alignItems: 'center', padding: 13 },
  sheetCancelText: {
    color: 'rgba(222,228,251,0.44)',
    fontSize: 10.9,
    fontWeight: '500',
  },
  sheetTitle: {
    color: 'rgba(248,250,255,0.90)',
    fontSize: 14.2,
    fontWeight: '600',
  },
  successBadge: { backgroundColor: 'rgba(53,208,138,0.78)' },
  successCheck: { color: '#FFFFFF', fontSize: 22, fontWeight: '600' },
  wallGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wallImage: { height: '100%', width: '100%' },
  wallPlaceholder: {
    color: 'rgba(255,216,174,0.78)',
    fontSize: 26,
    fontWeight: '300',
  },
  wallTile: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.026)',
    borderColor: 'rgba(255,255,255,0.055)',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '48.2%',
  },
});
