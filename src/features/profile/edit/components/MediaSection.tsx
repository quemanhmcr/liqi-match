import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { LiqiButton } from '@/shared/components/liqi';

import { ProfileText } from '../../components/ProfileShared';
import type {
  ProfileEditMedia,
  ProfileEditMediaSlot,
} from '../model/profile-edit-model';
import { ProfileEditAvatar } from './ProfileEditAvatar';
import { ProfileEditSection } from './ProfileEditPrimitives';
import { profileEditStyles as styles } from './profile-edit-styles';

export function MediaSection({
  disabled,
  displayName,
  media,
  onPick,
}: {
  disabled: boolean;
  displayName: string;
  media: ProfileEditMedia;
  onPick: (slot: ProfileEditMediaSlot) => void;
}) {
  const avatar = media.staged.avatar;
  const cover = media.staged.cover;
  const avatarUrl = mediaPreviewUrl(avatar, media.avatarUrl);
  const coverUrl = mediaPreviewUrl(cover, media.coverUrl);

  return (
    <ProfileEditSection
      icon="images-outline"
      subtitle="Chọn ảnh chỉ tạo staged state. Upload và association chỉ bắt đầu khi bạn bấm Lưu."
      title="Ảnh hồ sơ"
    >
      <View style={styles.mediaLayout}>
        <View style={{ alignItems: 'center', gap: 10, width: 112 }}>
          <ProfileEditAvatar
            displayName={displayName}
            size={68}
            uri={avatarUrl}
          />
          <LiqiButton
            accessibilityLabel="Đổi ảnh đại diện"
            disabled={disabled}
            emphasis="low"
            onPress={() => onPick('avatar')}
            radius={18}
            style={styles.mediaButton}
            variant="secondary"
            withShadow={false}
          >
            <Ionicons
              color="rgba(231,236,255,0.86)"
              name="camera-outline"
              size={15}
            />
            <ProfileText style={styles.mediaButtonText}>
              Ảnh đại diện
            </ProfileText>
          </LiqiButton>
          {avatar ? <MediaStageStatus item={avatar} /> : null}
        </View>
        <Pressable
          accessibilityLabel="Đổi ảnh nền hồ sơ"
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => onPick('cover')}
          style={({ pressed }) => [
            styles.coverEditor,
            pressed && styles.pressed,
          ]}
        >
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.coverEditorImage} />
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
              {cover ? mediaStatusLabel(cover.status) : '16:9 · chưa staged'}
            </ProfileText>
          </View>
          <View style={styles.coverActionPill}>
            <Ionicons
              color="rgba(231,236,255,0.86)"
              name="image-outline"
              size={14}
            />
            <ProfileText style={styles.coverActionText}>Chọn nền</ProfileText>
          </View>
        </Pressable>
      </View>
      {avatar?.failure ? (
        <ProfileText style={styles.errorText}>
          {avatar.failure.message}
        </ProfileText>
      ) : null}
      {cover?.failure ? (
        <ProfileText style={styles.errorText}>
          {cover.failure.message}
        </ProfileText>
      ) : null}
      {[avatar, cover].some((item) => item?.status === 'uploaded') ? (
        <View style={styles.notice}>
          <ProfileText style={styles.noticeTitle}>
            Có ảnh đã upload nhưng chưa liên kết
          </ProfileText>
          <ProfileText style={styles.errorText}>
            Hãy dùng “Thử lại”. Không chọn ảnh khác để tránh bỏ quên asset đang
            chờ.
          </ProfileText>
        </View>
      ) : null}
    </ProfileEditSection>
  );
}

function MediaStageStatus({
  item,
}: {
  item: NonNullable<ProfileEditMedia['staged']['avatar']>;
}) {
  return (
    <ProfileText
      accessibilityLabel={`Media status ${item.status}`}
      style={styles.errorText}
    >
      {mediaStatusLabel(item.status)}
    </ProfileText>
  );
}

function mediaStatusLabel(status: string) {
  if (status === 'selected') return 'Đã chọn cục bộ';
  if (status === 'ready') return 'Sẵn sàng upload khi lưu';
  if (status === 'uploading') return 'Đang upload';
  if (status === 'uploaded') return 'Đã upload · chờ liên kết';
  if (status === 'associated') return 'Đã liên kết';
  return 'Cần chọn lại hoặc retry';
}

function mediaPreviewUrl(
  item: ProfileEditMedia['staged']['avatar'] | undefined,
  fallback: string | undefined,
) {
  if (item?.uploadedAssetId !== null) return fallback;
  return item?.asset.uri ?? fallback;
}
