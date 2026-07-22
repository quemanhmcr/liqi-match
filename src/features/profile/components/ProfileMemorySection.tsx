import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useAssetResolver, type AssetKey } from '@/entities/media-asset';
import { AppCard, AppChip, AppText, appColors, appSpacing } from '@/shared/ui';

import { resolveProfileMedia } from '../model/profile-media';
import { profileScreenAssets } from '../screens/profile-screen-assets';
import { profileUi } from '../ui/profile-ui';
import { ProfileArtwork } from './ProfileArtwork';
import { ProfileCardHeader } from './ProfileCardHeader';
import { ProfileSectionAction } from './ProfileSectionAction';

type UserMemory = Readonly<{
  id: string;
  source?: ImageSourcePropType;
  state?: string;
}>;

export function ProfileMemorySection({
  compact,
  mode,
  onManage,
  wallAssetKeys = [],
  wallUrls = [],
}: Readonly<{
  compact: boolean;
  mode: 'self' | 'other';
  onManage?: () => void;
  wallAssetKeys?: readonly AssetKey[];
  wallUrls?: readonly string[];
}>) {
  const resolver = useAssetResolver();
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  const [viewportWidth, setViewportWidth] = useState(0);
  const remoteMemories: UserMemory[] = wallUrls.map((uri, index) => ({
    id: `remote:${index}:${uri}`,
    source: { uri },
  }));
  const assetMemories: UserMemory[] = wallAssetKeys.map((assetKey, index) => {
    const resolved = resolveProfileMedia(resolver, { assetKey });
    return {
      id: `asset:${index}:${assetKey}`,
      source: resolved.source,
      state: resolved.state,
    };
  });
  const userMemories = [...remoteMemories, ...assetMemories];
  const totalSlides = userMemories.length + 1;
  const slideWidth = viewportWidth || 300;

  return (
    <AppCard
      borderOpacity={profileUi.card.borderOpacity}
      contentStyle={styles.cardContent}
      density="compact"
      emphasis="none"
      radius={profileUi.radii.card}
      surfaceTone="low"
      testID="profile-memory-section"
      withShadow={false}
    >
      <View style={styles.mediaCard}>
        <View
          onLayout={(event) => {
            const nextWidth = Math.round(event.nativeEvent.layout.width);
            if (nextWidth > 0 && nextWidth !== viewportWidth) {
              setViewportWidth(nextWidth);
            }
          }}
          style={styles.carouselViewport}
        >
          <ScrollView
            accessibilityLabel="Danh sách khoảnh khắc hồ sơ"
            decelerationRate="fast"
            horizontal
            onMomentumScrollEnd={(event) =>
              setActiveIndex(resolveActiveIndex(event, slideWidth, totalSlides))
            }
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={slideWidth}
          >
            <MemorySlide
              badge="LiQi cấp"
              body={
                mode === 'self'
                  ? 'Cột mốc đầu tiên trên hành trình tìm đúng đồng đội.'
                  : 'Cột mốc khởi đầu trên hành trình kết nối tại LiQi.'
              }
              compact={compact}
              image={profileScreenAssets.memoryStarter}
              imageTestID="profile-memory-starter-image"
              testID="profile-memory-starter"
              title="Chiến binh mới"
              width={slideWidth}
            />
            {userMemories.map((memory, index) => {
              const failed = failedIds.has(memory.id) || !memory.source;
              return (
                <MemorySlide
                  accessibilityLabel={
                    failed && memory.state
                      ? `Khoảnh khắc hồ sơ ${memory.state}`
                      : undefined
                  }
                  badge={failed ? 'Tạm dùng ảnh hệ thống' : 'Media hồ sơ'}
                  body={
                    failed
                      ? 'Ảnh đang tạm không khả dụng. Nội dung gốc vẫn được giữ nguyên.'
                      : `Khoảnh khắc ${index + 1} trong ${userMemories.length}`
                  }
                  compact={compact}
                  image={
                    failed ? profileScreenAssets.memoryStarter : memory.source
                  }
                  imageTestID={`profile-memory-user-image-${index}`}
                  key={memory.id}
                  onImageError={
                    failed || !memory.source
                      ? undefined
                      : () =>
                          setFailedIds(
                            (current) => new Set([...current, memory.id]),
                          )
                  }
                  testID={`profile-memory-user-${index}`}
                  title={
                    failed
                      ? 'Chưa thể tải khoảnh khắc'
                      : 'Khoảnh khắc đã chia sẻ'
                  }
                  width={slideWidth}
                />
              );
            })}
          </ScrollView>
          {totalSlides > 1 ? (
            <View
              accessibilityLabel={`Khoảnh khắc ${activeIndex + 1} trên ${totalSlides}`}
              style={styles.pagination}
            >
              {Array.from({ length: totalSlides }, (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.paginationDot,
                    index === activeIndex && styles.paginationDotActive,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        <LinearGradient
          colors={profileUi.gradients.memoryTopOverlay}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={styles.headerVeil}
        />
        <View
          style={[styles.headerOverlay, compact && styles.headerOverlayCompact]}
          testID="profile-memory-header-overlay"
        >
          <ProfileCardHeader
            action={
              onManage ? (
                <ProfileSectionAction
                  accessibilityLabel="Quản lý khoảnh khắc"
                  label={userMemories.length ? 'Xem tất cả' : 'Thêm ảnh'}
                  onPress={onManage}
                />
              ) : undefined
            }
            compact={compact}
            title="Khoảnh khắc đáng nhớ"
          />
        </View>
      </View>
    </AppCard>
  );
}
function MemorySlide({
  accessibilityLabel,
  badge,
  body,
  compact,
  image,
  imageTestID,
  onImageError,
  testID,
  title,
  width,
}: Readonly<{
  accessibilityLabel?: string;
  badge: string;
  body: string;
  compact: boolean;
  image: ImageSourcePropType;
  imageTestID?: string;
  onImageError?: () => void;
  testID?: string;
  title: string;
  width: number;
}>) {
  return (
    <View
      accessibilityLabel={accessibilityLabel ?? `${title}. ${body}`}
      style={[
        styles.banner,
        { aspectRatio: profileUi.memory.aspectRatio, width },
      ]}
      testID={testID}
    >
      <ProfileArtwork
        accessibilityLabel={`Ảnh ${title.toLocaleLowerCase('vi')}`}
        onError={onImageError}
        recyclingKey={testID}
        source={image}
        testID={imageTestID}
        variant={
          testID === 'profile-memory-starter' ? 'memory-starter' : 'user-media'
        }
      />
      <LinearGradient
        colors={profileUi.gradients.memoryOverlay}
        locations={[0, 0.5, 1]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.bannerCopy, compact && styles.bannerCopyCompact]}>
        <AppText compact={compact} numberOfLines={1} variant="h2">
          {title}
        </AppText>
        <AppText numberOfLines={2} tone="secondary" variant="caption">
          {body}
        </AppText>
        <AppChip
          density="tag"
          icon={
            <Ionicons
              color={appColors.accent.pink}
              name="sparkles-outline"
              size={13}
            />
          }
          style={styles.memoryChip}
          variant="purple"
          withSheen={false}
        >
          {badge}
        </AppChip>
      </View>
    </View>
  );
}

function resolveActiveIndex(
  event: NativeSyntheticEvent<NativeScrollEvent>,
  slideWidth: number,
  totalSlides: number,
) {
  if (slideWidth <= 0) return 0;
  return Math.min(
    Math.max(Math.round(event.nativeEvent.contentOffset.x / slideWidth), 0),
    totalSlides - 1,
  );
}

const styles = StyleSheet.create({
  banner: {
    overflow: 'hidden',
    position: 'relative',
  },
  bannerCopy: {
    bottom: appSpacing['2xl'],
    gap: appSpacing.sm,
    left: appSpacing['2xl'],
    maxWidth: '72%',
    position: 'absolute',
  },
  bannerCopyCompact: {
    bottom: appSpacing.xl,
    left: appSpacing.xl,
    maxWidth: '78%',
    right: appSpacing.xl,
  },
  cardContent: { padding: 0 },
  carouselViewport: { overflow: 'hidden' },
  headerOverlay: {
    left: appSpacing['2xl'],
    position: 'absolute',
    right: appSpacing['2xl'],
    top: appSpacing['2xl'],
    zIndex: 2,
  },
  headerOverlayCompact: {
    left: appSpacing.xl,
    right: appSpacing.xl,
    top: appSpacing.xl,
  },
  headerVeil: {
    height: '48%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  mediaCard: { position: 'relative' },
  memoryChip: { alignSelf: 'flex-start' },
  pagination: {
    alignItems: 'center',
    bottom: appSpacing.lg,
    flexDirection: 'row',
    gap: appSpacing.xs,
    position: 'absolute',
    right: appSpacing.xl,
  },
  paginationDot: {
    backgroundColor: appColors.text.disabled,
    borderRadius: 3,
    height: 5,
    width: 5,
  },
  paginationDotActive: {
    backgroundColor: appColors.accent.purpleIcon,
    width: 14,
  },
});
