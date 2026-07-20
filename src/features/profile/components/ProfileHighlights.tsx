import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAssetResolver, type AssetKey } from '@/entities/media-asset';
import {
  liqiColors,
  liqiComponentColors,
  liqiComponents,
  liqiRadius,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import { resolveProfileMedia } from '../model/profile-media';
import {
  ProfileActionButton,
  ProfileSurface,
} from './ProfilePresentationPrimitives';
import { ProfileSectionHeader } from './ProfileSectionHeader';
import { ProfileText } from './ProfileShared';

export function ProfileHighlights({
  compact,
  coverAssetKey,
  coverUrl,
  mode,
  onManage,
  style,
  wallAssetKeys = [],
  wallUrls = [],
}: {
  compact: boolean;
  coverAssetKey?: AssetKey;
  coverUrl?: string;
  mode: 'self' | 'other';
  onManage?: () => void;
  style?: StyleProp<ViewStyle>;
  wallAssetKeys?: readonly AssetKey[];
  wallUrls?: readonly string[];
}) {
  const resolver = useAssetResolver();
  const coverItem = coverUrl
    ? {
        key: `cover:${coverUrl}`,
        kind: 'cover' as const,
        source: { uri: coverUrl },
        state: 'ready' as const,
      }
    : coverAssetKey
      ? (() => {
          const media = resolveProfileMedia(resolver, {
            assetKey: coverAssetKey,
          });
          return {
            key: `cover:${coverAssetKey}`,
            kind: 'cover' as const,
            source: media.source,
            state: media.state,
          };
        })()
      : undefined;
  const remoteItems = wallUrls.map((uri) => ({
    key: `wall:${uri}`,
    kind: 'wall' as const,
    source: { uri },
    state: 'ready' as const,
  }));
  const assetItems = wallAssetKeys.map((assetKey) => {
    const media = resolveProfileMedia(resolver, { assetKey });
    return {
      key: `wall:${assetKey}`,
      kind: 'wall' as const,
      source: media.source,
      state: media.state,
    };
  });
  const items = [
    ...(coverItem ? [coverItem] : []),
    ...remoteItems,
    ...assetItems,
  ].slice(0, 4);

  if (items.length === 0 && mode === 'other') return null;

  return (
    <ProfileSurface compact={compact} style={style}>
      <ProfileSectionHeader
        accessibilityLabel="Quản lý khoảnh khắc"
        compact={compact}
        onPress={onManage}
        title="Khoảnh khắc"
        withChevron={Boolean(onManage)}
      />
      {items.length ? (
        <View style={styles.grid}>
          {items.map((item, index) =>
            item.source ? (
              <Image
                accessibilityLabel={
                  item.kind === 'cover'
                    ? 'Ảnh bìa hồ sơ'
                    : `Khoảnh khắc hồ sơ ${index + 1}`
                }
                key={item.key}
                resizeMode="cover"
                source={item.source}
                style={[styles.media, compact && styles.mediaCompact]}
              />
            ) : (
              <View
                accessibilityLabel={
                  item.kind === 'cover'
                    ? `Ảnh bìa hồ sơ ${item.state}`
                    : `Khoảnh khắc hồ sơ ${item.state}`
                }
                key={item.key}
                style={[
                  styles.media,
                  compact && styles.mediaCompact,
                  styles.fallback,
                ]}
              >
                <Ionicons
                  color={liqiComponentColors.profile.subtleIcon}
                  name="image-outline"
                  size={18}
                />
                <ProfileText numberOfLines={2} style={styles.fallbackText}>
                  {item.state === 'uploaded-but-unassociated'
                    ? 'Đang liên kết'
                    : 'Chưa sẵn sàng'}
                </ProfileText>
              </View>
            ),
          )}
          {mode === 'self'
            ? Array.from({ length: Math.max(0, 4 - items.length) }).map(
                (_, index) => (
                  <View
                    accessibilityLabel="Khoảnh khắc chưa thêm"
                    key={`empty-${index}`}
                    style={[
                      styles.media,
                      compact && styles.mediaCompact,
                      styles.emptyMedia,
                    ]}
                  >
                    <Ionicons
                      color={liqiColors.text.disabled}
                      name="add"
                      size={20}
                    />
                  </View>
                ),
              )
            : null}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons
              color={liqiComponentColors.profile.interestIcon}
              name="images-outline"
              size={22}
            />
          </View>
          <View style={styles.emptyCopy}>
            <ProfileText style={styles.emptyTitle}>
              Kể câu chuyện chơi game của bạn
            </ProfileText>
            <ProfileText style={styles.emptyBody}>
              Thêm tối đa 4 khoảnh khắc để hồ sơ có chiều sâu hơn.
            </ProfileText>
          </View>
          {onManage ? (
            <ProfileActionButton
              icon="add"
              label="Thêm ảnh"
              onPress={onManage}
              style={styles.addButton}
              variant="secondary"
            />
          ) : null}
        </View>
      )}
    </ProfileSurface>
  );
}

const styles = StyleSheet.create({
  addButton: { minWidth: 104 },
  emptyBody: {
    ...liqiTypography.caption,
    color: liqiColors.text.muted,
    marginTop: liqiSpacing.xs,
  },
  emptyCopy: { flex: 1, minWidth: 0 },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.profile.statusSurface,
    borderRadius: liqiRadius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  emptyMedia: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.profile.actions.ghost.background,
    borderColor: liqiComponentColors.profile.actions.ghost.border,
    borderStyle: 'dashed',
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: liqiSpacing.lg,
    marginTop: liqiSpacing.xl,
  },
  emptyTitle: {
    ...liqiTypography.label,
    color: liqiColors.text.primary,
  },
  fallback: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.profile.mediaFallback,
    gap: liqiSpacing.xs,
    justifyContent: 'center',
  },
  fallbackText: {
    ...liqiTypography.caption,
    color: liqiColors.text.muted,
    fontSize: 8.5,
    lineHeight: 11,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    gap: liqiSpacing.md,
    marginTop: liqiSpacing.xl,
  },
  media: {
    borderColor: liqiColors.border.image,
    borderRadius: liqiRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    height: liqiComponents.profile.highlightHeight,
    minWidth: 0,
    overflow: 'hidden',
  },
  mediaCompact: { height: liqiComponents.profile.highlightHeightCompact },
});
