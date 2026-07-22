import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppCard, AppText, appSpacing } from '@/shared/ui';

import type { ProfilePlayStyleTile } from '../model/profile-surface-presenter';
import { profileUi } from '../ui/profile-ui';
import { ProfileArtwork } from './ProfileArtwork';
import { ProfileCardHeader } from './ProfileCardHeader';
import { ProfileSectionAction } from './ProfileSectionAction';

export function ProfilePlayStyleGallery({
  compact,
  onOpen,
  tiles,
}: Readonly<{
  compact: boolean;
  onOpen?: () => void;
  tiles: readonly ProfilePlayStyleTile[];
}>) {
  const tileElements = tiles.map((tile, index) => (
    <View
      key={tile.slot}
      style={[styles.tile, compact ? styles.tileCompact : styles.tileRegular]}
      testID={`profile-play-style-tile-${index}`}
    >
      <ProfileArtwork
        accessibilityLabel={`Artwork ${tile.description}: ${tile.title}`}
        recyclingKey={`profile-play-style-${tile.archetypeId ?? tile.slot}`}
        source={tile.image}
        testID={`profile-play-style-image-${index}`}
        variant="play-style"
      />
      <LinearGradient
        colors={profileUi.gradients.tileOverlay}
        locations={[0, 0.54, 1]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.copy, compact && styles.copyCompact]}>
        <AppText
          numberOfLines={1}
          style={styles.slotLabel}
          testID={`profile-play-style-label-${index}`}
          tone="accent"
          variant="caption"
        >
          {tile.label}
        </AppText>
        <AppText
          compact={compact}
          numberOfLines={2}
          testID={`profile-play-style-title-${index}`}
          variant="h3"
        >
          {tile.title}
        </AppText>
      </View>
    </View>
  ));

  return (
    <AppCard
      borderOpacity={profileUi.card.borderOpacity}
      contentStyle={[styles.cardContent, compact && styles.cardContentCompact]}
      density="compact"
      emphasis="none"
      radius={profileUi.radii.card}
      surfaceTone="low"
      testID="profile-play-style-gallery"
      withShadow={false}
    >
      <ProfileCardHeader
        action={
          onOpen ? (
            <ProfileSectionAction
              accessibilityLabel="Mở chỉnh sửa phong cách chơi"
              label="Điều chỉnh"
              onPress={onOpen}
            />
          ) : undefined
        }
        compact={compact}
        title="Phong cách trong game"
      />
      {compact ? (
        <ScrollView
          contentContainerStyle={styles.compactRail}
          decelerationRate="fast"
          disableIntervalMomentum
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          testID="profile-play-style-rail"
          snapToInterval={
            profileUi.playStyle.tileWidthCompact + profileUi.playStyle.gap
          }
        >
          {tileElements}
        </ScrollView>
      ) : (
        <View style={styles.row}>{tileElements}</View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  cardContent: { gap: appSpacing['2xl'] },
  cardContentCompact: { gap: appSpacing.lg },
  compactRail: {
    gap: profileUi.playStyle.gap,
    paddingRight: appSpacing.sm,
  },
  copy: {
    bottom: appSpacing.xl,
    gap: appSpacing.xs,
    left: appSpacing.xl,
    position: 'absolute',
    right: appSpacing.xl,
  },
  copyCompact: {
    bottom: appSpacing.lg,
    left: appSpacing.lg,
    right: appSpacing.lg,
  },
  row: { flexDirection: 'row', gap: profileUi.playStyle.gap },
  slotLabel: { letterSpacing: 0.7 },
  tile: {
    aspectRatio: profileUi.playStyle.aspectRatio,
    borderRadius: profileUi.radii.artwork,
    overflow: 'hidden',
    position: 'relative',
  },
  tileCompact: { width: profileUi.playStyle.tileWidthCompact },
  tileRegular: { flex: 1, minWidth: 0 },
});
