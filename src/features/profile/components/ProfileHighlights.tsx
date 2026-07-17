import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';

import { useAssetResolver, type AssetKey } from '@/entities/media-asset';
import { LiquidButton, LiquidCard } from '@/shared/components/liquid';

import { resolveProfileMedia } from '../model/profile-media';
import { ProfileSectionHeader } from './ProfileSectionHeader';
import { ProfileText } from './ProfileShared';

export function ProfileHighlights({
  mode,
  onManage,
  wallAssetKeys = [],
  wallUrls = [],
}: {
  mode: 'self' | 'other';
  onManage?: () => void;
  wallAssetKeys?: readonly AssetKey[];
  wallUrls?: readonly string[];
}) {
  const resolver = useAssetResolver();
  const remoteItems = wallUrls.slice(0, 4).map((uri) => ({
    key: uri,
    source: { uri },
    state: 'ready' as const,
  }));
  const assetItems = wallAssetKeys
    .slice(0, 4 - remoteItems.length)
    .map((assetKey) => {
      const media = resolveProfileMedia(resolver, { assetKey });
      return { key: assetKey, source: media.source, state: media.state };
    });
  const items = [...remoteItems, ...assetItems];

  if (items.length === 0 && mode === 'other') return null;

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
      {items.length ? (
        <View style={styles.grid}>
          {items.map((item, index) =>
            item.source ? (
              <Image
                accessibilityLabel={`Khoảnh khắc hồ sơ ${index + 1}`}
                key={item.key}
                resizeMode="cover"
                source={item.source}
                style={styles.media}
              />
            ) : (
              <View
                accessibilityLabel={`Khoảnh khắc hồ sơ ${item.state}`}
                key={item.key}
                style={[styles.media, styles.fallback]}
              >
                <ProfileText style={styles.fallbackText}>
                  {item.state === 'uploaded-but-unassociated'
                    ? 'Đang liên kết'
                    : 'Chưa sẵn sàng'}
                </ProfileText>
              </View>
            ),
          )}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons
              color="rgba(178,235,255,0.84)"
              name="images-outline"
              size={22}
            />
          </View>
          <View style={styles.emptyCopy}>
            <ProfileText style={styles.emptyTitle}>
              Kể câu chuyện chơi game của bạn
            </ProfileText>
            <ProfileText style={styles.emptyBody}>
              Thêm tối đa 4 khoảnh khắc để hồ sơ có chiều sâu hơn mà không biến
              thành một feed phức tạp.
            </ProfileText>
          </View>
          {onManage ? (
            <LiquidButton
              accessibilityLabel="Quản lý khoảnh khắc nổi bật"
              glowIntensity="low"
              onPress={onManage}
              variant="secondary"
              withShadow={false}
            >
              Thêm ảnh
            </LiquidButton>
          ) : null}
        </View>
      )}
      {items.length && mode === 'self' && onManage ? (
        <LiquidButton
          accessibilityLabel="Quản lý khoảnh khắc nổi bật"
          glowIntensity="none"
          onPress={onManage}
          style={styles.manageButton}
          variant="ghost"
          withShadow={false}
        >
          Quản lý tường ảnh
        </LiquidButton>
      ) : null}
    </LiquidCard>
  );
}

const styles = StyleSheet.create({
  emptyBody: {
    color: 'rgba(219,226,255,0.56)',
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 3,
  },
  emptyCopy: { flex: 1, minWidth: 0 },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(103,232,255,0.08)',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  emptyState: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
    marginTop: 9,
  },
  emptyTitle: {
    color: 'rgba(245,249,255,0.92)',
    fontSize: 13,
    fontWeight: '900',
  },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  manageButton: { marginTop: 10 },
  media: {
    aspectRatio: 1.35,
    borderRadius: 16,
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 120,
    overflow: 'hidden',
  },
  sectionFrame: { marginTop: 10 },
  sectionSurface: { borderRadius: 25, padding: 12 },
});
