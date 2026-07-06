import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  countUploadableOnboardingMedia,
  type LocalImageAsset,
  type UploadProgress,
  uploadOnboardingMedia,
} from '@/features/media/media-upload-service';
import { completeOnboardingProfile } from '@/features/onboarding/profile-service';
import {
  getOnboardingSnapshot,
  updateOnboardingSnapshot,
} from '@/features/onboarding/onboarding-store';
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
      <LinearGradient
        colors={['#050713', '#070B18', '#050713']}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.step}>Bước 5/5</Text>
        <Text style={styles.title}>Hoàn tất hồ sơ</Text>
        <Text style={styles.subtitle}>
          Thêm ảnh để hồ sơ trông đáng tin hơn. Ảnh sẽ được upload qua URL ký
          tạm thời lên R2 sau khi hồ sơ nền được lưu.
        </Text>

        <View style={styles.card}>
          <SectionHeader
            label="Ảnh đại diện"
            value={avatar ? 'Đã thêm' : 'Nên thêm'}
          />
          <Pressable
            accessibilityLabel={
              avatar ? 'Đổi ảnh đại diện' : 'Chọn ảnh đại diện'
            }
            accessibilityRole="button"
            disabled={busy}
            onPress={() => openPicker('avatar')}
            style={styles.avatarRow}
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
                Ảnh vuông, sẽ hiển thị trên hồ sơ của bạn
              </Text>
            </View>
            <Text style={styles.mediaAction}>{avatar ? 'Đổi' : 'Thêm'}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <SectionHeader
            label="Ảnh hồ sơ game"
            value={cover ? 'Đã thêm' : 'Tuỳ chọn'}
          />
          <Pressable
            accessibilityLabel={
              cover ? 'Đổi ảnh hồ sơ game' : 'Chọn ảnh hồ sơ game'
            }
            accessibilityRole="button"
            disabled={busy}
            onPress={() => openPicker('cover')}
            style={styles.coverBox}
          >
            {cover ? (
              <>
                <Image source={{ uri: cover.uri }} style={styles.coverImage} />
                <LinearGradient
                  colors={['transparent', 'rgba(5,7,19,0.88)']}
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
        </View>

        <View style={styles.card}>
          <SectionHeader label="Tường ảnh" value={`${wallCount}/4`} />
          <Text style={styles.sectionHint}>
            Thêm khoảnh khắc trong trận, ảnh sảnh chờ hoặc điểm nổi bật của bạn.
          </Text>
          <View style={styles.wallGrid}>
            {wallItems.map((item, index) => (
              <Pressable
                accessibilityLabel={`Chọn ảnh tường số ${index + 1}`}
                accessibilityRole="button"
                disabled={busy}
                key={index}
                onPress={() => openPicker('wall', index)}
                style={styles.wallTile}
              >
                {item ? (
                  <>
                    <Image
                      source={{ uri: item.uri }}
                      style={styles.wallImage}
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
        </View>

        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>
            Bạn luôn kiểm soát ảnh của mình
          </Text>
          <Text style={styles.privacyText}>
            {selectedMediaCount > 0
              ? `${selectedMediaCount} ảnh đã sẵn sàng. Khi bấm tạo hồ sơ, app sẽ lưu dữ liệu trước rồi upload ảnh lên R2 và gắn ảnh đại diện vào hồ sơ.`
              : 'Bạn có thể bỏ qua ảnh ở bước này. Hồ sơ vẫn được lưu đầy đủ và bạn có thể thêm ảnh sau.'}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable disabled={busy} onPress={finish} style={styles.cta}>
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaText}>Tạo hồ sơ</Text>
          )}
        </Pressable>
      </ScrollView>

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

function SectionHeader({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{label}</Text>
      <Text style={styles.sectionPill}>{value}</Text>
    </View>
  );
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
            <View
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
  root: { backgroundColor: '#050713', flex: 1 },
  scroll: { padding: 18, paddingBottom: 28 },
  step: { color: '#A8AFC6', fontWeight: '800', marginTop: 8 },
  title: {
    color: '#F7F8FF',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 18,
  },
  subtitle: { color: '#A8AFC6', fontSize: 15, lineHeight: 22, marginTop: 8 },
  card: {
    backgroundColor: 'rgba(13,17,34,0.9)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    marginTop: 16,
    padding: 16,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: '#F7F8FF', fontSize: 18, fontWeight: '900' },
  sectionPill: {
    color: '#B44CFF',
    fontSize: 12,
    fontWeight: '900',
  },
  sectionHint: { color: '#798097', fontSize: 13, lineHeight: 19 },
  avatarRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 14,
    padding: 14,
  },
  avatarPreview: {
    alignItems: 'center',
    backgroundColor: 'rgba(138,77,255,0.18)',
    borderColor: 'rgba(180,76,255,0.42)',
    borderRadius: 32,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 64,
  },
  avatarImage: { height: '100%', width: '100%' },
  placeholderIcon: { color: '#D7B8FF', fontSize: 30, fontWeight: '300' },
  mediaCopy: { flex: 1 },
  mediaTitle: { color: '#F7F8FF', fontSize: 15, fontWeight: '900' },
  mediaMeta: {
    color: '#798097',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  mediaAction: { color: '#B44CFF', fontSize: 13, fontWeight: '900' },
  coverBox: {
    alignItems: 'center',
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 18,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: { height: '100%', width: '100%' },
  coverCopy: { bottom: 16, left: 16, position: 'absolute', right: 16 },
  coverTitle: { color: '#F7F8FF', fontSize: 16, fontWeight: '900' },
  coverMeta: {
    color: '#A8AFC6',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  coverEmpty: { alignItems: 'center', gap: 6 },
  wallGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  wallTile: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '47.8%',
  },
  wallImage: { height: '100%', width: '100%' },
  wallPlaceholder: { color: '#D7B8FF', fontSize: 28, fontWeight: '300' },
  removeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(5,7,19,0.82)',
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 26,
  },
  removeText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  privacyCard: {
    backgroundColor: 'rgba(98,242,161,0.08)',
    borderColor: 'rgba(98,242,161,0.18)',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  privacyTitle: { color: '#F7F8FF', fontSize: 15, fontWeight: '900' },
  privacyText: { color: '#A8AFC6', fontSize: 13, lineHeight: 20, marginTop: 6 },
  error: { color: '#FFD7E4', marginTop: 16 },
  cta: {
    alignItems: 'center',
    backgroundColor: '#8A4DFF',
    borderRadius: 20,
    marginTop: 18,
    padding: 17,
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  modalOverlay: {
    backgroundColor: 'rgba(2,4,12,0.72)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 18,
  },
  sheet: {
    backgroundColor: '#10172D',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  sheetTitle: { color: '#F7F8FF', fontSize: 18, fontWeight: '900' },
  sheetAction: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderRadius: 16,
    padding: 16,
  },
  sheetActionText: { color: '#F7F8FF', fontSize: 15, fontWeight: '900' },
  sheetCancel: { alignItems: 'center', padding: 14 },
  sheetCancelText: { color: '#A8AFC6', fontSize: 14, fontWeight: '900' },
  progressOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(2,4,12,0.78)',
    flex: 1,
    justifyContent: 'center',
    padding: 22,
  },
  progressCard: {
    alignItems: 'center',
    backgroundColor: '#10172D',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    width: '100%',
  },
  progressBadge: {
    alignItems: 'center',
    backgroundColor: '#8A4DFF',
    borderRadius: 999,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  successBadge: { backgroundColor: '#35D08A' },
  successCheck: { color: '#FFFFFF', fontSize: 26, fontWeight: '900' },
  progressTitle: {
    color: '#F7F8FF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 16,
    textAlign: 'center',
  },
  progressText: {
    color: '#A8AFC6',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  progressTrack: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    height: 8,
    marginTop: 18,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    backgroundColor: '#B44CFF',
    borderRadius: 999,
    height: '100%',
  },
  progressHint: {
    color: '#798097',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 12,
  },
});
