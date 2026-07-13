import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View } from 'react-native';

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
  draft,
  form,
}: {
  draft: ProfileEditDraft;
  form: ProfileEditForm;
}) {
  const rankLabel =
    draft.ranks.find((rank) => rank.id === form.gameProfile.rankId)?.label ??
    (form.gameProfile.rankId ? 'Rank cũ chưa hỗ trợ' : 'Chưa chọn rank');
  const roleLabels = form.lanes.roleIds.map(
    (roleId) =>
      draft.roles.find((role) => role.id === roleId)?.label ?? 'Lane cũ',
  );
  const avatarUrl = form.media.staged.avatar?.asset.uri ?? form.media.avatarUrl;
  const coverUrl = form.media.staged.cover?.asset.uri ?? form.media.coverUrl;

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
            {rankLabel} · {roleLabels.join(' / ') || 'Chưa chọn lane'}
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
