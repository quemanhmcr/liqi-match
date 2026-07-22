import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppPressableCard, AppText, appRadii, appSpacing } from '@/shared/ui';

import { ProfileArtwork } from '../../components/ProfileArtwork';
import type {
  ProfilePlayStyleSlot,
  ProfilePlayStyleTile,
} from '../../model/profile-play-style-presenter';
import { profileUi } from '../../ui/profile-ui';

const accessibilitySlotLabel: Readonly<Record<ProfilePlayStyleSlot, string>> = {
  coordination: 'Cách phối hợp',
  goal: 'Mục tiêu chơi',
  tactics: 'Bản sắc chiến thuật',
};

export function ProfilePlayStyleEditPreview({
  onSelectSlot,
  tiles,
}: Readonly<{
  onSelectSlot: (slot: ProfilePlayStyleSlot) => void;
  tiles: readonly ProfilePlayStyleTile[];
}>) {
  return (
    <View style={styles.container} testID="profile-play-style-edit-preview">
      <View style={styles.header}>
        <AppText tone="accent" variant="label">
          HỒ SƠ SẼ HIỂN THỊ
        </AppText>
        <AppText tone="secondary" variant="bodySmall">
          Chạm vào một thẻ để đi đến đúng nhóm thiết lập bên dưới.
        </AppText>
      </View>

      <View style={styles.list}>
        {tiles.map((tile) => (
          <AppPressableCard
            accessibilityLabel={`Đi đến cài đặt ${accessibilitySlotLabel[tile.slot]}: ${tile.title}`}
            contentStyle={styles.row}
            density="compact"
            key={tile.slot}
            onPress={() => onSelectSlot(tile.slot)}
            surfaceTone="low"
            testID={`profile-play-style-edit-preview-${tile.slot}`}
            withShadow={false}
          >
            <View style={styles.artwork}>
              <ProfileArtwork
                accessibilityLabel={`Xem trước ${tile.label}: ${tile.title}`}
                recyclingKey={`profile-play-style-edit-${tile.archetypeId ?? tile.slot}`}
                source={tile.image}
                variant="play-style"
              />
              <LinearGradient
                colors={profileUi.gradients.tileOverlay}
                locations={[0, 0.64, 1]}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              />
            </View>

            <View style={styles.copy}>
              <AppText
                numberOfLines={1}
                style={styles.slotLabel}
                tone="accent"
                variant="caption"
              >
                {tile.label}
              </AppText>
              <AppText numberOfLines={2} variant="h3">
                {tile.title}
              </AppText>
              <AppText numberOfLines={2} tone="secondary" variant="caption">
                {tile.description}
              </AppText>
              <AppText
                numberOfLines={2}
                testID={`profile-play-style-edit-source-${tile.slot}`}
                tone="muted"
                variant="caption"
              >
                {tile.sourceLabels.length
                  ? `Tự động từ: ${tile.sourceLabels.join(' · ')}`
                  : 'Chưa có lựa chọn trực tiếp cho thẻ này.'}
              </AppText>
            </View>
          </AppPressableCard>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: {
    aspectRatio: profileUi.playStyle.aspectRatio,
    borderRadius: appRadii.md,
    overflow: 'hidden',
    position: 'relative',
    width: 76,
  },
  container: { gap: appSpacing.lg },
  copy: { flex: 1, gap: appSpacing.xs, minWidth: 0 },
  header: { gap: appSpacing.xs },
  list: { gap: appSpacing.md },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.lg,
    minHeight: 112,
  },
  slotLabel: { letterSpacing: 0.7 },
});
