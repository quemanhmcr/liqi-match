import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type MediaKind = 'avatar' | 'cover' | 'wall';
type MediaStatus = 'processing' | 'ready';
type MediaItem = { uri: string; status: MediaStatus };
type SourceRequest = { kind: MediaKind; index?: number } | null;
type InlineError = { kind: MediaKind; index?: number; message: string } | null;
type SnackbarState = {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  tone?: 'neutral' | 'success' | 'error';
} | null;
type StoredDraft = {
  avatarUri: string | null;
  coverUri: string | null;
  wallUris: (string | null)[];
};
type DraftStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const DRAFT_KEY = '@liqi-match/profile-media-draft-v1';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PROCESSING_DELAY_MS = 360;
let cachedDraftStorage: DraftStorage | null | undefined;
let volatileDraftValue: string | null = null;

const colors = {
  bg: '#050713',
  card: 'rgba(13,17,34,0.84)',
  cardRaised: 'rgba(20,25,43,0.92)',
  cardSoft: 'rgba(255,255,255,0.045)',
  border: 'rgba(174,188,244,0.12)',
  borderStrong: 'rgba(180,76,255,0.46)',
  text: '#F7F8FF',
  textMuted: '#ABB2C9',
  textDim: '#7E859D',
  violet: '#B44CFF',
  violetSoft: '#D08BFF',
  blue: '#2D74FF',
  cyan: '#55C8FF',
  green: '#62F2A1',
  red: '#FF6F9F',
  overlay: 'rgba(2,4,12,0.72)',
} as const;

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function getDraftStorage(): DraftStorage {
  if (cachedDraftStorage) return cachedDraftStorage;

  try {
    // Lazy require keeps old dev-client binaries from crashing before this screen can render.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asyncStorageModule = require('@react-native-async-storage/async-storage') as
      | DraftStorage
      | { default?: DraftStorage };
    cachedDraftStorage =
      'default' in asyncStorageModule && asyncStorageModule.default
        ? asyncStorageModule.default
        : (asyncStorageModule as DraftStorage);
  } catch {
    cachedDraftStorage = null;
  }

  if (cachedDraftStorage) return cachedDraftStorage;

  return {
    getItem: async (key: string) => (key === DRAFT_KEY ? volatileDraftValue : null),
    setItem: async (key: string, value: string) => {
      if (key === DRAFT_KEY) volatileDraftValue = value;
    },
  };
}

function validateImage(asset: ImagePicker.ImagePickerAsset, kind: MediaKind) {
  if (asset.fileSize && asset.fileSize > MAX_FILE_BYTES) {
    return 'Ảnh lớn hơn 10 MB. Hãy chọn ảnh nhẹ hơn.';
  }

  const width = asset.width ?? 0;
  const height = asset.height ?? 0;

  if (kind === 'avatar' && (width < 320 || height < 320)) {
    return 'Ảnh đại diện cần tối thiểu 320 x 320 px.';
  }

  if (kind === 'cover' && (width < 800 || height < 450)) {
    return 'Ảnh hồ sơ game cần tối thiểu 800 x 450 px.';
  }

  if (kind === 'wall' && (width < 480 || height < 320)) {
    return 'Ảnh chia sẻ cần tối thiểu 480 x 320 px.';
  }

  return null;
}

function sourceTitle(request: SourceRequest) {
  if (request?.kind === 'avatar') return 'Thêm ảnh đại diện';
  if (request?.kind === 'cover') return 'Thêm ảnh hồ sơ game';
  return 'Thêm ảnh chia sẻ';
}

export default function ProfileMediaScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const contentWidth = useMemo(() => Math.min(width, 760), [width]);

  const [avatar, setAvatar] = useState<MediaItem | null>(null);
  const [cover, setCover] = useState<MediaItem | null>(null);
  const [wallItems, setWallItems] = useState<(MediaItem | null)[]>([null, null, null, null]);
  const [sourceRequest, setSourceRequest] = useState<SourceRequest>(null);
  const [inlineError, setInlineError] = useState<InlineError>(null);
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [snackbar, setSnackbar] = useState<SnackbarState>(null);
  const snackbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wallCount = wallItems.filter(Boolean).length;
  const mediaCount = Number(Boolean(avatar)) + Number(Boolean(cover)) + wallCount;

  useEffect(() => {
    let active = true;

    async function restoreDraft() {
      try {
        const rawDraft = await getDraftStorage().getItem(DRAFT_KEY);
        if (!active || !rawDraft) return;

        const draft = JSON.parse(rawDraft) as StoredDraft;
        setAvatar(draft.avatarUri ? { uri: draft.avatarUri, status: 'ready' } : null);
        setCover(draft.coverUri ? { uri: draft.coverUri, status: 'ready' } : null);
        setWallItems(
          Array.from({ length: 4 }, (_, index) =>
            draft.wallUris?.[index] ? { uri: draft.wallUris[index]!, status: 'ready' } : null,
          ),
        );
        if (draft.wallUris?.some(Boolean)) setGalleryExpanded(true);
      } catch {
        showSnackbar('Không thể khôi phục bản nháp trước đó.', 'error');
      } finally {
        if (active) setHydrated(true);
      }
    }

    restoreDraft();
    return () => {
      active = false;
      if (snackbarTimer.current) clearTimeout(snackbarTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const draft: StoredDraft = {
      avatarUri: avatar?.uri ?? null,
      coverUri: cover?.uri ?? null,
      wallUris: wallItems.map((item) => item?.uri ?? null),
    };

    getDraftStorage().setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {
      showSnackbar('Không thể tự động lưu bản nháp.', 'error');
    });
  }, [avatar, cover, hydrated, wallItems]);

  function showSnackbar(
    message: string,
    tone: 'neutral' | 'success' | 'error' = 'neutral',
    actionLabel?: string,
    onAction?: () => void,
  ) {
    if (snackbarTimer.current) clearTimeout(snackbarTimer.current);
    setSnackbar({ actionLabel, message, onAction, tone });
    snackbarTimer.current = setTimeout(() => setSnackbar(null), actionLabel ? 5200 : 3200);
  }

  function openSourcePicker(kind: MediaKind, index?: number) {
    setInlineError(null);
    setSourceRequest({ kind, index });
  }

  function setMedia(request: Exclude<SourceRequest, null>, item: MediaItem | null) {
    if (request.kind === 'avatar') setAvatar(item);
    if (request.kind === 'cover') setCover(item);
    if (request.kind === 'wall' && request.index !== undefined) {
      setWallItems((current) => current.map((value, index) => (index === request.index ? item : value)));
    }
  }

  async function chooseImage(source: 'library' | 'camera') {
    const request = sourceRequest;
    if (!request) return;

    setSourceRequest(null);

    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setInlineError({
            ...request,
            message: 'Cho phép quyền camera trong Cài đặt để chụp ảnh mới.',
          });
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        allowsEditing: request.kind !== 'wall',
        aspect: request.kind === 'avatar' ? [1, 1] : request.kind === 'cover' ? [16, 9] : undefined,
        exif: false,
        mediaTypes: ['images'],
        quality: 0.88,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets[0]?.uri) return;

      const asset = result.assets[0];
      const validationMessage = validateImage(asset, request.kind);
      if (validationMessage) {
        setInlineError({ ...request, message: validationMessage });
        showSnackbar(validationMessage, 'error');
        return;
      }

      setMedia(request, { uri: asset.uri, status: 'processing' });
      await delay(PROCESSING_DELAY_MS);
      setMedia(request, { uri: asset.uri, status: 'ready' });
      showSnackbar('Ảnh đã được thêm và tự động lưu.', 'success');
    } catch {
      setInlineError({ ...request, message: 'Không thể mở hoặc xử lý ảnh này. Hãy thử lại.' });
      showSnackbar('Không thể xử lý ảnh. Hãy thử lại.', 'error');
    }
  }

  function removeWallImage(index: number) {
    const removed = wallItems[index];
    if (!removed) return;

    setWallItems((current) => current.map((item, itemIndex) => (itemIndex === index ? null : item)));
    showSnackbar('Đã xóa ảnh chia sẻ.', 'neutral', 'Hoàn tác', () => {
      setWallItems((current) => current.map((item, itemIndex) => (itemIndex === index ? removed : item)));
      setSnackbar(null);
    });
  }

  async function completeProfile(skipped: boolean) {
    try {
      const draft: StoredDraft = {
        avatarUri: avatar?.uri ?? null,
        coverUri: cover?.uri ?? null,
        wallUris: wallItems.map((item) => item?.uri ?? null),
      };
      await getDraftStorage().setItem(DRAFT_KEY, JSON.stringify(draft));
      setCompleted(true);
      if (skipped && mediaCount === 0) {
        showSnackbar('Bạn có thể thêm ảnh bất cứ lúc nào trong Hồ sơ.', 'neutral');
      }
    } catch {
      showSnackbar('Không thể lưu hồ sơ lúc này. Hãy thử lại.', 'error');
    }
  }

  if (completed) {
    return (
      <CompletionState
        hasAvatar={Boolean(avatar)}
        mediaCount={mediaCount}
        onEdit={() => setCompleted(false)}
      />
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#050713', '#070B18', '#050713']} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.singleGlow} />

      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
        <View style={[styles.frame, { width: contentWidth }]}>
          <Header compact={compact} onBack={() => router.back()} />

          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 10) + 188 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Ionicons color={colors.violetSoft} name="images-outline" size={23} />
              </View>
              <Text accessibilityRole="header" style={[styles.heading, compact && styles.headingCompact]}>
                Hoàn thiện <Text style={styles.headingAccent}>ảnh hồ sơ</Text>
              </Text>
              <Text style={styles.subtitle}>
                Chọn ảnh giúp đồng đội nhận ra bạn nhanh hơn. Ảnh được lưu nháp trên máy và có thể thay đổi sau.
              </Text>
            </View>

            <SectionCard>
              <SectionHeader
                description="Ảnh vuông, rõ mặt hoặc avatar game. Đây là ảnh hiển thị chính khi ghép đội."
                status={<StatusPill tone={avatar ? 'complete' : 'recommended'} />}
                title="Ảnh đại diện"
              />

              <Pressable
                accessibilityHint="Mở lựa chọn camera hoặc thư viện ảnh"
                accessibilityLabel={avatar ? 'Ảnh đại diện đã được thêm. Nhấn để thay đổi.' : 'Thêm ảnh đại diện.'}
                accessibilityRole="button"
                accessibilityState={{ busy: avatar?.status === 'processing' }}
                onPress={() => openSourcePicker('avatar')}
                style={({ pressed }) => [styles.avatarSelector, pressed && styles.controlPressed]}
              >
                <View style={styles.avatarPreview}>
                  {avatar ? <Image source={{ uri: avatar.uri }} style={styles.avatarImage} /> : (
                    <Ionicons color={colors.violetSoft} name="person-outline" size={32} />
                  )}
                  {avatar?.status === 'processing' ? <ProcessingOverlay compact /> : null}
                </View>
                <View style={styles.selectorCopy}>
                  <Text style={styles.selectorTitle}>
                    {avatar ? 'Ảnh đại diện đã sẵn sàng' : 'Chọn ảnh đại diện'}
                  </Text>
                  <Text style={styles.selectorMeta}>Ảnh vuông · tối đa 10 MB</Text>
                </View>
                <Ionicons color={colors.textDim} name={avatar ? 'pencil-outline' : 'chevron-forward'} size={21} />
              </Pressable>
              <InlineErrorMessage error={inlineError?.kind === 'avatar' ? inlineError.message : null} />
            </SectionCard>

            <SectionCard>
              <SectionHeader
                description="Ảnh rank, tướng tủ hoặc khoảnh khắc nổi bật để hồ sơ có cá tính hơn."
                status={<StatusPill tone={cover ? 'complete' : 'optional'} />}
                title="Ảnh hồ sơ game"
              />

              <Pressable
                accessibilityHint="Mở lựa chọn camera hoặc thư viện ảnh"
                accessibilityLabel={cover ? 'Ảnh hồ sơ game đã được thêm. Nhấn để thay đổi.' : 'Thêm ảnh hồ sơ game.'}
                accessibilityRole="button"
                accessibilityState={{ busy: cover?.status === 'processing' }}
                onPress={() => openSourcePicker('cover')}
                style={({ pressed }) => [styles.coverSelector, pressed && styles.controlPressed]}
              >
                {cover ? (
                  <>
                    <Image resizeMode="cover" source={{ uri: cover.uri }} style={styles.coverImage} />
                    <LinearGradient colors={['transparent', 'rgba(4,6,15,0.86)']} style={StyleSheet.absoluteFill} />
                    <View style={styles.coverReadyRow}>
                      <View>
                        <Text style={styles.coverReadyTitle}>Ảnh đã sẵn sàng</Text>
                        <Text style={styles.coverReadyMeta}>Nhấn để thay ảnh</Text>
                      </View>
                      <View style={styles.editCircle}>
                        <Ionicons color="#FFFFFF" name="pencil-outline" size={18} />
                      </View>
                    </View>
                    {cover.status === 'processing' ? <ProcessingOverlay /> : null}
                  </>
                ) : (
                  <View style={styles.coverEmpty}>
                    <View style={styles.coverIconBox}>
                      <MaterialCommunityIcons color={colors.violetSoft} name="image-plus-outline" size={32} />
                    </View>
                    <Text style={styles.coverEmptyTitle}>Thêm ảnh hồ sơ game</Text>
                    <Text style={styles.coverEmptyMeta}>Khung ngang 16:9 · tối đa 10 MB</Text>
                  </View>
                )}
              </Pressable>
              <InlineErrorMessage error={inlineError?.kind === 'cover' ? inlineError.message : null} />
            </SectionCard>

            <SectionCard>
              <Pressable
                accessibilityLabel={`Ảnh chia sẻ, đã thêm ${wallCount} trên 4 ảnh`}
                accessibilityRole="button"
                accessibilityState={{ expanded: galleryExpanded }}
                onPress={() => setGalleryExpanded((value) => !value)}
                style={({ pressed }) => [styles.galleryHeader, pressed && styles.controlPressed]}
              >
                <View style={styles.galleryHeaderIcon}>
                  <Ionicons color={colors.violetSoft} name="grid-outline" size={21} />
                </View>
                <View style={styles.galleryHeaderCopy}>
                  <Text style={styles.galleryTitle}>Ảnh chia sẻ</Text>
                  <Text style={styles.galleryDescription}>Tùy chọn · {wallCount}/4 ảnh</Text>
                </View>
                <Ionicons color={colors.textDim} name={galleryExpanded ? 'chevron-up' : 'chevron-down'} size={21} />
              </Pressable>

              {galleryExpanded ? (
                <View style={styles.galleryContent}>
                  <Text style={styles.galleryHelper}>
                    Thêm khoảnh khắc chơi game, thành tích hoặc ảnh lobby. Phần này có thể hoàn thiện sau.
                  </Text>
                  <View style={styles.galleryGrid}>
                    {wallItems.map((item, index) => (
                      <GalleryTile
                        index={index}
                        key={index}
                        onPress={() => openSourcePicker('wall', index)}
                        onRemove={item ? () => removeWallImage(index) : undefined}
                        uri={item?.uri}
                      />
                    ))}
                  </View>
                  <InlineErrorMessage error={inlineError?.kind === 'wall' ? inlineError.message : null} />
                </View>
              ) : null}
            </SectionCard>

            <View style={styles.privacyCard}>
              <View style={styles.privacyIcon}>
                <Ionicons color={colors.green} name="shield-checkmark-outline" size={25} />
              </View>
              <View style={styles.privacyCopy}>
                <Text style={styles.privacyTitle}>Bạn kiểm soát ảnh của mình</Text>
                <Text style={styles.privacyText}>
                  Ảnh chỉ dùng cho hồ sơ Liqi Match. Bạn có thể thay đổi hoặc xóa bất cứ lúc nào trong cài đặt hồ sơ.
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.stickyAction, { paddingBottom: Math.max(insets.bottom, 10) + 10 }]}>
            <LinearGradient colors={['transparent', colors.bg]} pointerEvents="none" style={styles.actionFade} />
            <View style={styles.actionPanel}>
              <View style={styles.actionSummary}>
                <Text style={styles.actionSummaryTitle}>
                  {mediaCount > 0 ? `${mediaCount} ảnh đã sẵn sàng` : 'Ảnh có thể thêm sau'}
                </Text>
                <Text style={styles.actionSummaryText}>Bản nháp được lưu tự động</Text>
              </View>
              <GradientButton
                accessibilityHint="Lưu lựa chọn và kết thúc thiết lập hồ sơ"
                label="Hoàn tất hồ sơ"
                onPress={() => completeProfile(false)}
              />
              <Pressable
                accessibilityLabel="Làm sau"
                accessibilityRole="button"
                onPress={() => completeProfile(true)}
                style={({ pressed }) => [styles.laterButton, pressed && styles.controlPressed]}
              >
                <Text style={styles.laterText}>Làm sau</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Snackbar
          actionLabel={snackbar?.actionLabel}
          message={snackbar?.message ?? null}
          onAction={snackbar?.onAction}
          tone={snackbar?.tone}
        />

        <SourcePickerSheet
          onCamera={() => chooseImage('camera')}
          onClose={() => setSourceRequest(null)}
          onLibrary={() => chooseImage('library')}
          title={sourceTitle(sourceRequest)}
          visible={Boolean(sourceRequest)}
        />
      </SafeAreaView>
    </View>
  );
}

function Header({ compact, onBack }: { compact: boolean; onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityLabel="Quay lại bước trước"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.roundButton, pressed && styles.controlPressed]}
      >
        <Ionicons color={colors.text} name="chevron-back" size={25} />
      </Pressable>

      <Text accessibilityLabel="Liqi Match" style={[styles.logo, compact && styles.logoCompact]}>
        <Text style={styles.logoAccent}>Liqi</Text> Match
      </Text>

      <View accessibilityLabel="Bước 5 trên 5" style={styles.stepBadge}>
        <Text style={styles.stepLabel}>Bước</Text>
        <Text style={styles.stepText}>5/5</Text>
      </View>
    </View>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.sectionCard}>{children}</View>;
}

function SectionHeader({
  description,
  status,
  title,
}: {
  description: string;
  status: React.ReactNode;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionDescription}>{description}</Text>
      </View>
      {status}
    </View>
  );
}

function StatusPill({ tone }: { tone: 'optional' | 'recommended' | 'complete' }) {
  const config = {
    optional: { icon: 'ellipse-outline', label: 'Tùy chọn' },
    recommended: { icon: 'sparkles-outline', label: 'Khuyến nghị' },
    complete: { icon: 'checkmark-circle-outline', label: 'Đã thêm' },
  } as const;
  const item = config[tone];
  const complete = tone === 'complete';

  return (
    <View style={[styles.statusPill, complete && styles.statusPillDone]}>
      <Ionicons color={complete ? colors.green : colors.violetSoft} name={item.icon} size={14} />
      <Text style={[styles.statusText, complete && styles.statusTextDone]}>{item.label}</Text>
    </View>
  );
}

function ProcessingOverlay({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.processingOverlay}>
      <ActivityIndicator color="#FFFFFF" />
      {compact ? null : <Text style={styles.processingText}>Đang xử lý ảnh...</Text>}
    </View>
  );
}

function InlineErrorMessage({ error }: { error: string | null }) {
  if (!error) return null;

  return (
    <View accessibilityLiveRegion="assertive" style={styles.errorRow}>
      <Ionicons color={colors.red} name="alert-circle-outline" size={18} />
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );
}

function GalleryTile({
  index,
  onPress,
  onRemove,
  uri,
}: {
  index: number;
  onPress: () => void;
  onRemove?: () => void;
  uri?: string;
}) {
  const position = index + 1;

  return (
    <Pressable
      accessibilityHint={uri ? 'Mở trình chọn để thay ảnh' : 'Mở trình chọn ảnh'}
      accessibilityLabel={uri ? `Ảnh chia sẻ số ${position} đã được thêm` : `Thêm ảnh chia sẻ số ${position}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.galleryTile, pressed && styles.controlPressed]}
    >
      {uri ? (
        <>
          <Image source={{ uri }} style={styles.galleryImage} />
          <View style={styles.galleryImageOverlay} />
          <View style={styles.changeBadge}>
            <Ionicons color="#FFFFFF" name="images-outline" size={15} />
            <Text style={styles.changeText}>Thay ảnh</Text>
          </View>
          {onRemove ? (
            <Pressable
              accessibilityLabel={`Xóa ảnh chia sẻ số ${position}`}
              accessibilityRole="button"
              hitSlop={10}
              onPress={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              style={styles.removeTouchTarget}
            >
              <View style={styles.removeVisual}>
                <Ionicons color="#FFFFFF" name="close" size={18} />
              </View>
            </Pressable>
          ) : null}
        </>
      ) : (
        <View style={styles.emptyTileContent}>
          <View style={styles.plusCircle}>
            <Ionicons color={colors.violetSoft} name="add" size={25} />
          </View>
          <Text style={styles.tileLabel}>Thêm ảnh</Text>
        </View>
      )}
    </Pressable>
  );
}

function GradientButton({
  accessibilityHint,
  label,
  onPress,
}: {
  accessibilityHint?: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.gradientButtonWrap, pressed && styles.ctaPressed]}
    >
      <LinearGradient
        colors={['#B638F3', '#684DFF', '#2379FF']}
        end={{ x: 1, y: 0.5 }}
        start={{ x: 0, y: 0.5 }}
        style={styles.gradientButton}
      >
        <Text style={styles.gradientButtonText}>{label}</Text>
        <View style={styles.gradientButtonIcon}>
          <Ionicons color="#5F43F4" name="arrow-forward" size={21} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function SourcePickerSheet({
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
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.sheetBackdrop}>
        <SafeAreaView edges={['bottom']} style={styles.sheetSafeArea}>
          <Pressable accessibilityViewIsModal onPress={(event) => event.stopPropagation()} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
            <Text style={styles.sheetSubtitle}>Chọn cách bạn muốn thêm ảnh.</Text>

            <View style={styles.sheetActions}>
              <SourceAction
                description="Chỉ ảnh bạn chọn được chia sẻ với ứng dụng"
                icon="images-outline"
                label="Chọn từ thư viện"
                onPress={onLibrary}
              />
              <SourceAction
                description="Ứng dụng sẽ xin quyền camera khi cần"
                icon="camera-outline"
                label="Chụp ảnh mới"
                onPress={onCamera}
              />
            </View>

            <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Hủy</Text>
            </Pressable>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

function SourceAction({
  description,
  icon,
  label,
  onPress,
}: {
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.sourceAction, pressed && styles.controlPressed]}
    >
      <View style={styles.sourceIconBox}>
        <Ionicons color={colors.violetSoft} name={icon} size={23} />
      </View>
      <View style={styles.sourceCopy}>
        <Text style={styles.sourceLabel}>{label}</Text>
        <Text style={styles.sourceDescription}>{description}</Text>
      </View>
      <Ionicons color={colors.textDim} name="chevron-forward" size={20} />
    </Pressable>
  );
}

function Snackbar({
  actionLabel,
  message,
  onAction,
  tone = 'neutral',
}: {
  actionLabel?: string;
  message: string | null;
  onAction?: () => void;
  tone?: 'neutral' | 'success' | 'error';
}) {
  if (!message) return null;

  const icon =
    tone === 'success'
      ? 'checkmark-circle-outline'
      : tone === 'error'
        ? 'alert-circle-outline'
        : 'information-circle-outline';

  return (
    <View accessibilityLiveRegion="polite" style={styles.snackbar}>
      <Ionicons
        color={tone === 'success' ? colors.green : tone === 'error' ? colors.red : colors.textMuted}
        name={icon}
        size={20}
      />
      <Text style={styles.snackbarMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.snackbarAction}>
          <Text style={styles.snackbarActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CompletionState({
  hasAvatar,
  mediaCount,
  onEdit,
}: {
  hasAvatar: boolean;
  mediaCount: number;
  onEdit: () => void;
}) {
  return (
    <View style={styles.root}>
      <LinearGradient colors={['#050713', '#0B0D1D', '#050713']} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.completionGlow} />
      <SafeAreaView style={styles.completionSafeArea}>
        <View style={styles.completionContent}>
          <View style={styles.successIcon}>
            <Ionicons color="#06120B" name="checkmark" size={38} />
          </View>
          <Text accessibilityRole="header" style={styles.completionTitle}>Hồ sơ đã sẵn sàng</Text>
          <Text style={styles.completionText}>
            {mediaCount > 0
              ? `Đã lưu ${mediaCount} ảnh. Bạn có thể tiếp tục vào Liqi Match và chỉnh sửa bất cứ lúc nào.`
              : 'Bạn có thể bắt đầu ngay và bổ sung ảnh sau trong phần Hồ sơ.'}
          </Text>

          <View style={styles.completionChecklist}>
            <CompletionRow complete label="Thiết lập ghép đội" />
            <CompletionRow complete={hasAvatar} label="Ảnh đại diện" optional />
            <CompletionRow complete={mediaCount > Number(hasAvatar)} label="Ảnh phong cách chơi" optional />
          </View>

          <GradientButton label="Vào Liqi Match" onPress={() => Alert.alert('Liqi Match', 'Onboarding đã hoàn tất.')} />
          <Pressable accessibilityRole="button" onPress={onEdit} style={styles.editProfileButton}>
            <Text style={styles.editProfileText}>Quay lại chỉnh ảnh</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function CompletionRow({ complete, label, optional = false }: { complete: boolean; label: string; optional?: boolean }) {
  return (
    <View style={styles.completionRow}>
      <Ionicons color={complete ? colors.green : colors.textDim} name={complete ? 'checkmark-circle' : 'ellipse-outline'} size={21} />
      <Text style={styles.completionRowLabel}>{label}</Text>
      {optional ? <Text style={styles.completionOptional}>Tùy chọn</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  safe: {
    alignItems: 'center',
    flex: 1,
  },
  frame: {
    flex: 1,
  },
  singleGlow: {
    backgroundColor: 'rgba(119,58,255,0.13)',
    borderRadius: 300,
    height: 600,
    position: 'absolute',
    right: -420,
    top: 80,
    width: 600,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 62,
    paddingHorizontal: 16,
  },
  roundButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: colors.border,
    borderRadius: 23,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  logo: {
    color: colors.text,
    fontSize: 25,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(142,66,255,0.38)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 8,
  },
  logoAccent: {
    color: '#C06BFF',
  },
  logoCompact: {
    fontSize: 23,
  },
  stepBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,22,42,0.84)',
    borderColor: 'rgba(255,255,255,0.055)',
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    overflow: 'hidden',
    paddingHorizontal: 0,
    width: 64,
  },
  stepLabel: {
    color: '#838BA3',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  stepText: {
    color: '#D28CFF',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 17,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(180,76,255,0.11)',
    borderColor: 'rgba(180,76,255,0.18)',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    marginBottom: 12,
    width: 40,
  },
  heading: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  headingAccent: {
    color: colors.violetSoft,
  },
  headingCompact: {
    fontSize: 27,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 9,
    maxWidth: 530,
    textAlign: 'center',
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionHeaderCopy: {
    flex: 1,
    minWidth: 210,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionDescription: {
    color: colors.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 5,
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(180,76,255,0.10)',
    borderColor: 'rgba(180,76,255,0.24)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  statusPillDone: {
    backgroundColor: 'rgba(98,242,161,0.09)',
    borderColor: 'rgba(98,242,161,0.24)',
  },
  statusText: {
    color: '#D9B9FF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  statusTextDone: {
    color: '#A9F3C9',
  },
  avatarSelector: {
    alignItems: 'center',
    backgroundColor: 'rgba(6,9,21,0.72)',
    borderColor: colors.border,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 112,
    padding: 13,
  },
  avatarPreview: {
    alignItems: 'center',
    backgroundColor: 'rgba(180,76,255,0.09)',
    borderColor: 'rgba(180,76,255,0.25)',
    borderRadius: 43,
    borderWidth: 1,
    height: 86,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 86,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  selectorCopy: {
    flex: 1,
    marginHorizontal: 14,
  },
  selectorTitle: {
    color: colors.text,
    fontSize: 15.5,
    fontWeight: '800',
  },
  selectorMeta: {
    color: colors.textDim,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
  },
  coverSelector: {
    aspectRatio: 16 / 7.1,
    backgroundColor: 'rgba(6,9,21,0.72)',
    borderColor: colors.border,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 160,
    overflow: 'hidden',
  },
  coverEmpty: {
    alignItems: 'center',
    padding: 20,
  },
  coverIconBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(180,76,255,0.10)',
    borderRadius: 16,
    height: 54,
    justifyContent: 'center',
    marginBottom: 11,
    width: 54,
  },
  coverEmptyTitle: {
    color: colors.text,
    fontSize: 15.5,
    fontWeight: '800',
  },
  coverEmptyMeta: {
    color: colors.textDim,
    fontSize: 12.5,
    marginTop: 5,
  },
  coverImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  coverReadyRow: {
    alignItems: 'center',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    padding: 14,
    position: 'absolute',
    right: 0,
  },
  coverReadyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  coverReadyMeta: {
    color: '#D1D4E2',
    fontSize: 12,
    marginTop: 2,
  },
  editCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(12,15,31,0.82)',
    borderColor: 'rgba(255,255,255,0.20)',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  processingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,6,15,0.64)',
    bottom: 0,
    gap: 8,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  processingText: {
    color: colors.text,
    fontSize: 12.5,
    fontWeight: '700',
  },
  galleryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 60,
  },
  galleryHeaderIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(180,76,255,0.10)',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  galleryHeaderCopy: {
    flex: 1,
    marginHorizontal: 12,
  },
  galleryTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  galleryDescription: {
    color: colors.textDim,
    fontSize: 12.5,
    marginTop: 3,
  },
  galleryContent: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 14,
  },
  galleryHelper: {
    color: colors.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    marginBottom: 13,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  galleryTile: {
    alignItems: 'center',
    aspectRatio: 1.25,
    backgroundColor: 'rgba(255,255,255,0.028)',
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 112,
    overflow: 'hidden',
  },
  galleryImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  galleryImageOverlay: {
    backgroundColor: 'rgba(3,5,16,0.24)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  emptyTileContent: {
    alignItems: 'center',
    gap: 9,
  },
  plusCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(180,76,255,0.11)',
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  tileLabel: {
    color: colors.textMuted,
    fontSize: 13.5,
    fontWeight: '700',
  },
  changeBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,11,29,0.78)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  changeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  removeTouchTarget: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: 1,
    top: 1,
    width: 48,
  },
  removeVisual: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,11,29,0.86)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  privacyCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(98,242,161,0.055)',
    borderColor: 'rgba(98,242,161,0.16)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  privacyIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(98,242,161,0.10)',
    borderRadius: 15,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  privacyCopy: {
    flex: 1,
  },
  privacyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  privacyText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  stickyAction: {
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    position: 'absolute',
    right: 0,
  },
  actionFade: {
    bottom: 0,
    height: 132,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  actionPanel: {
    backgroundColor: 'rgba(9,12,24,0.88)',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
  },
  actionSummary: {
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  actionSummaryTitle: {
    color: colors.text,
    fontSize: 14.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  actionSummaryText: {
    color: colors.textDim,
    fontSize: 12.5,
    marginTop: 3,
    textAlign: 'center',
  },
  gradientButtonWrap: {
    borderRadius: 18,
    shadowColor: colors.violet,
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  gradientButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.20)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
  },
  gradientButtonText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  gradientButtonIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    marginLeft: 12,
    width: 34,
  },
  laterButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  laterText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  errorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 11,
  },
  errorText: {
    color: colors.red,
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  sheetBackdrop: {
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetSafeArea: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111625',
    borderColor: colors.border,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: 2,
    height: 4,
    marginBottom: 16,
    width: 38,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '800',
  },
  sheetSubtitle: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  sheetActions: {
    gap: 10,
    marginTop: 18,
  },
  sourceAction: {
    alignItems: 'center',
    backgroundColor: colors.cardRaised,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 74,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  sourceIconBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(180,76,255,0.11)',
    borderRadius: 13,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  sourceCopy: {
    flex: 1,
    marginHorizontal: 12,
  },
  sourceLabel: {
    color: colors.text,
    fontSize: 15.5,
    fontWeight: '800',
  },
  sourceDescription: {
    color: colors.textDim,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 3,
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 48,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 15.5,
    fontWeight: '700',
  },
  snackbar: {
    alignItems: 'center',
    backgroundColor: '#171C2B',
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    bottom: 104,
    flexDirection: 'row',
    gap: 9,
    left: 16,
    minHeight: 50,
    paddingHorizontal: 14,
    position: 'absolute',
    right: 16,
    zIndex: 50,
  },
  snackbarMessage: {
    color: colors.text,
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
  },
  snackbarAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
  },
  snackbarActionText: {
    color: colors.violetSoft,
    fontSize: 13.5,
    fontWeight: '800',
  },
  completionSafeArea: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
  },
  completionGlow: {
    alignSelf: 'center',
    backgroundColor: 'rgba(98,242,161,0.12)',
    borderRadius: 220,
    height: 440,
    position: 'absolute',
    top: 120,
    width: 440,
  },
  completionContent: {
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 520,
    width: '100%',
  },
  successIcon: {
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 34,
    height: 68,
    justifyContent: 'center',
    marginBottom: 20,
    width: 68,
  },
  completionTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  completionText: {
    color: colors.textMuted,
    fontSize: 14.5,
    lineHeight: 22,
    marginTop: 10,
    textAlign: 'center',
  },
  completionChecklist: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginVertical: 24,
    padding: 16,
  },
  completionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 30,
  },
  completionRowLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
  },
  completionOptional: {
    color: colors.textDim,
    fontSize: 12.5,
    fontWeight: '700',
  },
  editProfileButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  editProfileText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  controlPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  ctaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});
