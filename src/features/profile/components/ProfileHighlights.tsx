import { StyleSheet, View, Image } from 'react-native';

import { useAssetResolver, type AssetKey } from '@/entities/media-asset';
import { LiquidCard } from '@/shared/components/liquid';

import { resolveProfileMedia } from '../model/profile-media';
import { ProfileSectionHeader } from './ProfileSectionHeader';
import { ProfileText } from './ProfileShared';

export function ProfileHighlights({
  mode,
  wallAssetKeys = [],
}: {
  mode: 'self' | 'other';
  wallAssetKeys?: readonly AssetKey[];
}) {
  const resolver = useAssetResolver();
  const items = wallAssetKeys.slice(0, 4).map((assetKey) => ({
    assetKey,
    media: resolveProfileMedia(resolver, { assetKey }),
  }));

  if (items.length === 0) return null;

  return (
    <LiquidCard
      baseStrokeColor="rgba(103,232,255,0.16)"
      baseStrokeOpacity={0.075}
      blurIntensity={28}
      contentStyle={styles.sectionSurface}
      density="regular"
      frameColors={[
        'rgba(106,101,255,0.13)',
        'rgba(255,255,255,0.030)',
        'rgba(103,232,255,0.12)',
      ]}
      glassIntensity="low"
      glowIntensity="low"
      radius={26}
      style={styles.sectionFrame}
      surfaceBackground="rgba(8,12,28,0.38)"
      withInnerReflection
      withShadow={false}
    >
      <ProfileSectionHeader
        icon={mode === 'self' ? 'images-outline' : 'sparkles-outline'}
        title="Khoảnh khắc nổi bật"
      />
      <View style={styles.grid}>
        {items.map(({ assetKey, media }, index) =>
          media.source ? (
            <Image
              accessibilityLabel={`Khoảnh khắc hồ sơ ${index + 1}`}
              key={assetKey}
              resizeMode="cover"
              source={media.source}
              style={styles.media}
            />
          ) : (
            <View
              accessibilityLabel={`Khoảnh khắc hồ sơ ${media.state}`}
              key={assetKey}
              style={[styles.media, styles.fallback]}
            >
              <ProfileText style={styles.fallbackText}>
                {media.state === 'uploaded-but-unassociated'
                  ? 'Đang liên kết'
                  : 'Chưa sẵn sàng'}
              </ProfileText>
            </View>
          ),
        )}
      </View>
    </LiquidCard>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(122,132,171,0.14)',
    justifyContent: 'center',
  },
  fallbackText: {
    color: 'rgba(219,226,255,0.56)',
    fontSize: 11,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  media: {
    aspectRatio: 1.35,
    borderRadius: 16,
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 120,
    overflow: 'hidden',
  },
  sectionFrame: { marginTop: 10 },
  sectionSurface: {
    borderRadius: 25,
    padding: 12,
  },
});
