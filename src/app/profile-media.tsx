import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
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

import { completeOnboardingProfile } from '@/features/onboarding/profile-service';
import {
  getOnboardingSnapshot,
  updateOnboardingSnapshot,
} from '@/features/onboarding/onboarding-store';
import { useAuth } from '@/shared/auth/auth-context';

type MediaKind = 'avatar' | 'cover' | 'wall';
type MediaItem = { uri: string };
type SourceRequest = { kind: MediaKind; index?: number } | null;

const WALL_SLOT_COUNT = 4;

export default function ProfileMediaScreen() {
  const { session } = useAuth();
  const [avatar, setAvatar] = useState<MediaItem | null>(null);
  const [cover, setCover] = useState<MediaItem | null>(null);
  const [wallItems, setWallItems] = useState<(MediaItem | null)[]>(
    Array.from({ length: WALL_SLOT_COUNT }, () => null),
  );
  const [sourceRequest, setSourceRequest] = useState<SourceRequest>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallCount = wallItems.filter(Boolean).length;
  const mediaCount =
    Number(Boolean(avatar)) + Number(Boolean(cover)) + wallCount;

  const mediaDraft = {
    avatar: Boolean(avatar),
    cover: Boolean(cover),
    wallCount,
  };

  const openPicker = (kind: MediaKind, index?: number) => {
    setError(null);
    setSourceRequest({ kind, index });
  };

  const assignMedia = (request: Exclude<SourceRequest, null>, uri: string) => {
    if (request.kind === 'avatar') {
      setAvatar({ uri });
      return;
    }

    if (request.kind === 'cover') {
      setCover({ uri });
      return;
    }

    if (request.index === undefined) return;
    setWallItems((current) =>
      current.map((item, index) => (index === request.index ? { uri } : item)),
    );
  };

  const removeWallImage = (indexToRemove: number) => {
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
          setError('Camera permission is required to take a new photo.');
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

      if (result.canceled || !result.assets[0]?.uri) return;
      assignMedia(request, result.assets[0].uri);
    } catch {
      setError('Could not open or process this image. Please try again.');
    }
  };

  const finish = async () => {
    updateOnboardingSnapshot({ mediaDraft });

    if (!session) {
      router.replace('/');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await completeOnboardingProfile(session, getOnboardingSnapshot());
      router.replace('/home');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#050713', '#070B18', '#050713']}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.step}>Step 5/5</Text>
        <Text style={styles.title}>Finish profile</Text>
        <Text style={styles.subtitle}>
          Add profile photos now or skip them for later. We only save a safe
          media summary in this connected build.
        </Text>

        <View style={styles.summaryCard}>
          <Info label="Avatar" value={avatar ? 'Ready' : 'Optional'} />
          <Info label="Cover" value={cover ? 'Ready' : 'Optional'} />
          <Info label="Wall" value={`${wallCount}/${WALL_SLOT_COUNT} photos`} />
          <Info label="Total" value={`${mediaCount} selected`} />
        </View>

        <View style={styles.card}>
          <SectionHeader
            label="Avatar photo"
            value={avatar ? 'Added' : 'Recommended'}
          />
          <Pressable
            accessibilityLabel={
              avatar ? 'Change avatar photo' : 'Choose avatar photo'
            }
            accessibilityRole="button"
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
                {avatar ? 'Avatar is ready' : 'Choose avatar'}
              </Text>
              <Text style={styles.mediaMeta}>
                Square image - editable later
              </Text>
            </View>
            <Text style={styles.mediaAction}>{avatar ? 'Change' : 'Add'}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <SectionHeader
            label="Game profile photo"
            value={cover ? 'Added' : 'Optional'}
          />
          <Pressable
            accessibilityLabel={
              cover ? 'Change game profile photo' : 'Choose game profile photo'
            }
            accessibilityRole="button"
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
                  <Text style={styles.coverTitle}>Cover is ready</Text>
                  <Text style={styles.coverMeta}>Tap to change</Text>
                </View>
              </>
            ) : (
              <View style={styles.coverEmpty}>
                <Text style={styles.placeholderIcon}>+</Text>
                <Text style={styles.mediaTitle}>Add game profile photo</Text>
                <Text style={styles.mediaMeta}>Wide 16:9 image</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <SectionHeader label="Photo wall" value={`${wallCount}/4`} />
          <Text style={styles.sectionHint}>
            Add match moments, lobby screenshots, or profile highlights.
          </Text>
          <View style={styles.wallGrid}>
            {wallItems.map((item, index) => (
              <Pressable
                accessibilityLabel={`Choose wall photo ${index + 1}`}
                accessibilityRole="button"
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
                      hitSlop={8}
                      onPress={() => removeWallImage(index)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeText}>x</Text>
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
          <Text style={styles.privacyTitle}>You control your photos</Text>
          <Text style={styles.privacyText}>
            Upload/R2 is still deferred. This step only records whether avatar,
            cover, and wall photos were selected.
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable disabled={busy} onPress={finish} style={styles.cta}>
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaText}>Create profile</Text>
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
    </View>
  );
}

function sourceRequestTitle(request: SourceRequest) {
  if (request?.kind === 'avatar') return 'Add avatar photo';
  if (request?.kind === 'cover') return 'Add game profile photo';
  return 'Add wall photo';
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
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
            <Text style={styles.sheetActionText}>Choose from library</Text>
          </Pressable>
          <Pressable onPress={onCamera} style={styles.sheetAction}>
            <Text style={styles.sheetActionText}>Take photo</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.sheetCancel}>
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
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
  summaryCard: {
    backgroundColor: 'rgba(13,17,34,0.9)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    marginTop: 22,
    padding: 16,
  },
  info: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 13,
  },
  infoLabel: { color: '#798097', fontSize: 12, fontWeight: '900' },
  infoValue: { color: '#F7F8FF', fontSize: 14, fontWeight: '800' },
  card: {
    backgroundColor: 'rgba(13,17,34,0.9)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    marginTop: 14,
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
});
