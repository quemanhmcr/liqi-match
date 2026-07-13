import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View } from 'react-native';

import {
  LANE_CATALOG,
  RANK_CATALOG,
  catalogOptionById,
} from '@/entities/player-profile';
import { LiquidCard } from '@/shared/components/liquid';

import { ProfileText } from '../../components/ProfileShared';
import type {
  ProfileEditDraft,
  ProfileEditForm,
} from '../model/profile-edit-model';
import { ProfileEditAvatar } from './ProfileEditAvatar';
import { profileEditStyles as styles } from './profile-edit-styles';

const statusLabels: Record<string, string> = {
  busy: 'Đang bận',
  friends: 'Chỉ bạn bè',
  offline: 'Offline',
  ready: 'Sẵn sàng',
};

export function ProfileEditPreview({
  draft: _draft,
  form,
}: {
  draft: ProfileEditDraft;
  form: ProfileEditForm;
}) {
  const rankLabel = form.gameProfile.rankId
    ? catalogOptionById(RANK_CATALOG, form.gameProfile.rankId)?.label
    : undefined;
  const laneLabels = form.laneSelection
    ? [form.laneSelection.primary, form.laneSelection.secondary]
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
        .map((laneId) => catalogOptionById(LANE_CATALOG, laneId)?.label)
        .filter((value): value is string => Boolean(value))
    : [];
  const avatar = form.media.staged.avatar;
  const cover = form.media.staged.cover;
  const avatarUrl =
    avatar?.uploadedUrl ?? avatar?.asset.uri ?? form.media.avatarUrl;
  const coverUrl =
    cover?.uploadedUrl ?? cover?.asset.uri ?? form.media.coverUrl;

  return (
    <LiquidCard
      contentStyle={styles.previewSurface}
      density="regular"
      glowIntensity="low"
      style={styles.previewCard}
    >
      {coverUrl ? (
        <Image
          resizeMode="cover"
          source={{ uri: coverUrl }}
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
        <ProfileEditAvatar
          displayName={form.identity.displayName}
          size={62}
          uri={avatarUrl}
        />
        <View style={styles.previewCopy}>
          <View style={styles.previewNameRow}>
            <ProfileText numberOfLines={1} style={styles.previewName}>
              {form.identity.displayName || 'Tên hiển thị'}
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
            {rankLabel ?? 'Chưa chọn rank'} ·{' '}
            {laneLabels.join(' / ') || 'Chưa chọn lane'}
          </ProfileText>
          <ProfileText numberOfLines={1} style={styles.previewMeta}>
            {form.gameProfile.handle || 'Chưa có game handle'}
          </ProfileText>
          {form.identity.status ? (
            <View style={styles.previewStatusRow}>
              <View style={styles.readyDot} />
              <ProfileText style={styles.previewStatus}>
                {statusLabels[form.identity.status] ?? form.identity.status}
              </ProfileText>
            </View>
          ) : null}
        </View>
      </View>
      <ProfileText numberOfLines={2} style={styles.previewBio}>
        “{form.identity.bio.trim() || 'Chưa có giới thiệu.'}”
      </ProfileText>
    </LiquidCard>
  );
}
