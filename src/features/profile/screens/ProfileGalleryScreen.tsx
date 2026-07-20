import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PROFILE_WALL_MEDIA_LIMIT } from '@/entities/player-profile';
import { useAuth } from '@/shared/auth/auth-context';
import {
  LiqiButton,
  LiqiCard,
  LiqiChip,
  LiqiOrbButton,
} from '@/shared/components/liqi';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';
import { liqiColors } from '@/shared/theme/liqi-design-system';

import {
  associateProfileGalleryAsset,
  fetchProfileGallery,
  uploadProfileGalleryAsset,
} from '../services/profile-gallery-service';

const galleryQueryKey = ['profile-gallery'] as const;

type PendingAssociation = Readonly<{
  assetId: string;
  localUri: string;
  position: number;
}>;

export function ProfileGalleryScreen() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingAssociation | null>(null);
  const galleryQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Authentication is required.');
      return fetchProfileGallery(session);
    },
    queryKey: [...galleryQueryKey, session?.user.id],
  });

  const associationMutation = useMutation({
    mutationFn: async (input: {
      assetId: string | null;
      localUri?: string;
      position: number;
    }) => {
      if (!session || !galleryQuery.data) {
        throw new Error('Tường ảnh chưa sẵn sàng.');
      }
      await associateProfileGalleryAsset({
        assetId: input.assetId,
        position: input.position,
        profileId: galleryQuery.data.profileId,
        session,
      });
      return input;
    },
    onError: (error, variables) => {
      if (variables.assetId && variables.localUri) {
        setPending({
          assetId: variables.assetId,
          localUri: variables.localUri,
          position: variables.position,
        });
      }
      Alert.alert(
        variables.assetId
          ? 'Ảnh đã upload nhưng chưa liên kết'
          : 'Chưa xoá được ảnh',
        variables.assetId
          ? 'Asset được giữ lại để bạn thử liên kết lại, không cần upload lần nữa.'
          : error instanceof Error
            ? error.message
            : 'Vui lòng tải lại và thử lại.',
      );
    },
    onSuccess: async (variables) => {
      if (pending?.position === variables.position) setPending(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: galleryQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['profile-view'] }),
        queryClient.invalidateQueries({ queryKey: ['profile-edit-draft'] }),
      ]);
    },
  });

  const pick = async (position: number) => {
    if (!session || associationMutation.isPending) return;
    if (pending && pending.position !== position) {
      Alert.alert(
        'Có ảnh đang chờ liên kết',
        'Hãy thử lại asset đã upload trước khi chọn ảnh khác để tránh tạo orphan asset.',
      );
      return;
    }
    void Haptics.selectionAsync().catch(() => undefined);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Cần quyền truy cập ảnh',
          'Hãy cấp quyền thư viện ảnh để thêm khoảnh khắc vào hồ sơ.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        exif: false,
        mediaTypes: ['images'],
        quality: 0.84,
        selectionLimit: 1,
      });
      const asset = result.canceled ? undefined : result.assets?.[0];
      if (!asset) return;
      const uploaded = await uploadProfileGalleryAsset(session, asset);
      await associationMutation.mutateAsync({
        assetId: uploaded.assetId,
        localUri: asset.uri,
        position,
      });
    } catch (error) {
      if (associationMutation.isError) return;
      Alert.alert(
        'Không thể thêm ảnh',
        error instanceof Error ? error.message : 'Vui lòng thử lại.',
      );
    }
  };

  const remove = (position: number) => {
    if (associationMutation.isPending) return;
    Alert.alert(
      'Gỡ ảnh khỏi hồ sơ?',
      'Asset không còn hiển thị trong tường ảnh. File có thể được dọn theo retention policy của hệ thống.',
      [
        { style: 'cancel', text: 'Giữ lại' },
        {
          onPress: () =>
            associationMutation.mutate({ assetId: null, position }),
          style: 'destructive',
          text: 'Gỡ ảnh',
        },
      ],
    );
  };

  const retryPending = () => {
    if (!pending) return;
    associationMutation.mutate({
      assetId: pending.assetId,
      localUri: pending.localUri,
      position: pending.position,
    });
  };

  return (
    <LiqiScreen
      contentContainerStyle={styles.content}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <View style={styles.header}>
        <LiqiOrbButton
          accessibilityLabel="Quay lại"
          onPress={() => router.back()}
          size={42}
        >
          <Ionicons
            color={liqiColors.text.primary}
            name="chevron-back"
            size={20}
          />
        </LiqiOrbButton>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>PROFILE MEDIA</Text>
          <Text style={styles.title}>Khoảnh khắc nổi bật</Text>
        </View>
        <View style={styles.spacer} />
      </View>

      <LiqiCard density="regular" style={styles.hero} variant="purple">
        <View style={styles.heroIcon}>
          <Ionicons color="#BFF5FF" name="images" size={25} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.cardTitle}>Tường ảnh của riêng bạn</Text>
          <Text style={styles.body}>
            Tối đa 4 khoảnh khắc. Thứ tự được lưu và hiển thị nhất quán trên hồ
            sơ.
          </Text>
        </View>
      </LiqiCard>

      {galleryQuery.isPending ? (
        <StateCard loading title="Đang tải tường ảnh..." />
      ) : galleryQuery.isError || !galleryQuery.data ? (
        <StateCard
          onRetry={() => void galleryQuery.refetch()}
          title="Chưa tải được tường ảnh"
        />
      ) : (
        <>
          <View style={styles.grid}>
            {Array.from({ length: PROFILE_WALL_MEDIA_LIMIT }, (_, position) => {
              const url = galleryQuery.data.urls[position];
              const pendingHere = pending?.position === position;
              const preview = pendingHere ? pending.localUri : url;
              const busy =
                associationMutation.isPending &&
                associationMutation.variables?.position === position;
              return (
                <Pressable
                  accessibilityLabel={
                    preview
                      ? `Đổi khoảnh khắc ${position + 1}`
                      : `Thêm khoảnh khắc ${position + 1}`
                  }
                  accessibilityRole="button"
                  disabled={associationMutation.isPending}
                  key={position}
                  onPress={() => void pick(position)}
                  style={({ pressed }) => [
                    styles.tile,
                    pressed && styles.pressed,
                  ]}
                >
                  {preview ? (
                    <Image
                      resizeMode="cover"
                      source={{ uri: preview }}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : (
                    <View style={styles.emptyTile}>
                      <View style={styles.plusShell}>
                        <Ionicons
                          color="rgba(190,244,255,0.88)"
                          name="add"
                          size={25}
                        />
                      </View>
                      <Text style={styles.emptyTitle}>Thêm ảnh</Text>
                      <Text style={styles.emptyMeta}>JPG · PNG · WebP</Text>
                    </View>
                  )}
                  {preview ? (
                    <View pointerEvents="none" style={styles.scrim} />
                  ) : null}
                  <View style={styles.positionBadge}>
                    <Text style={styles.positionText}>{position + 1}</Text>
                  </View>
                  {pendingHere ? (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingText}>Chờ liên kết</Text>
                    </View>
                  ) : null}
                  {busy ? (
                    <View style={styles.busyOverlay}>
                      <ActivityIndicator color="#FFFFFF" />
                    </View>
                  ) : null}
                  {url && !pendingHere ? (
                    <Pressable
                      accessibilityLabel={`Gỡ khoảnh khắc ${position + 1}`}
                      disabled={associationMutation.isPending}
                      hitSlop={8}
                      onPress={(event) => {
                        event.stopPropagation();
                        remove(position);
                      }}
                      style={styles.removeButton}
                    >
                      <Ionicons color="#FFFFFF" name="close" size={16} />
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {pending ? (
            <LiqiCard density="compact" style={styles.retryCard}>
              <Ionicons
                color="#FFCB8D"
                name="cloud-offline-outline"
                size={20}
              />
              <View style={styles.retryCopy}>
                <Text style={styles.retryTitle}>Asset đã upload an toàn</Text>
                <Text style={styles.body}>
                  Chỉ cần thử lại bước liên kết, không upload lại file.
                </Text>
              </View>
              <LiqiButton
                disabled={associationMutation.isPending}
                onPress={retryPending}
                variant="secondary"
              >
                Thử lại
              </LiqiButton>
            </LiqiCard>
          ) : null}

          <View style={styles.policyRow}>
            <LiqiChip density="compact" variant="cyan">
              Tối đa 4 ảnh
            </LiqiChip>
            <LiqiChip density="compact" variant="purple">
              Ảnh hồ sơ công khai theo policy
            </LiqiChip>
          </View>
          <Text style={styles.footerCopy}>
            Không hiển thị trạng thái “đang xử lý” giả: ảnh chỉ xuất hiện trên
            hồ sơ sau khi upload hoàn tất và association được lưu thành công.
          </Text>
        </>
      )}
    </LiqiScreen>
  );
}

function StateCard({
  loading = false,
  onRetry,
  title,
}: {
  loading?: boolean;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <LiqiCard density="regular" style={styles.stateCard}>
      {loading ? (
        <ActivityIndicator color="#67E8FF" />
      ) : (
        <Ionicons color="#FFCB8D" name="alert-circle-outline" size={24} />
      )}
      <Text style={styles.body}>{title}</Text>
      {onRetry ? (
        <LiqiButton onPress={onRetry} variant="secondary">
          Tải lại
        </LiqiButton>
      ) : null}
    </LiqiCard>
  );
}

const styles = StyleSheet.create({
  body: { color: liqiColors.text.secondary, fontSize: 12.5, lineHeight: 18 },
  busyOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(2,5,14,0.62)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cardTitle: {
    color: liqiColors.text.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  content: { gap: 14, paddingBottom: 42, paddingHorizontal: 16, paddingTop: 8 },
  emptyMeta: { color: liqiColors.text.muted, fontSize: 10.5 },
  emptyTile: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
    justifyContent: 'center',
  },
  emptyTitle: {
    color: liqiColors.text.secondary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  eyebrow: {
    color: 'rgba(103,232,255,0.66)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  footerCopy: {
    color: liqiColors.text.muted,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 52 },
  headerCopy: { alignItems: 'center', flex: 1, gap: 3 },
  hero: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  heroCopy: { flex: 1, gap: 3 },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.09)',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  pendingBadge: {
    backgroundColor: 'rgba(255,166,82,0.90)',
    borderRadius: 999,
    bottom: 9,
    left: 9,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
  },
  pendingText: { color: '#201207', fontSize: 9.5, fontWeight: '900' },
  plusShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.08)',
    borderColor: 'rgba(103,232,255,0.18)',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  policyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  positionBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(3,7,18,0.70)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 25,
    justifyContent: 'center',
    left: 9,
    position: 'absolute',
    top: 9,
    width: 25,
  },
  positionText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '900' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  removeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(4,6,14,0.74)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 28,
  },
  retryCard: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  retryCopy: { flex: 1, minWidth: 0 },
  retryTitle: { color: '#FFE3BE', fontSize: 12.5, fontWeight: '900' },
  scrim: {
    backgroundColor: 'rgba(2,5,14,0.12)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  spacer: { height: 42, width: 42 },
  stateCard: {
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
    minHeight: 170,
  },
  tile: {
    aspectRatio: 1.12,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(103,232,255,0.10)',
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 135,
    overflow: 'hidden',
  },
  title: { color: liqiColors.text.primary, fontSize: 17, fontWeight: '900' },
});
