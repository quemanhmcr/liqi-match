import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { HEROES } from '@/entities/hero';
import {
  liqiColors,
  liqiComponentColors,
  liqiComponentGradients,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import type { ProfileFavoriteHero } from '../services/profile-service';
import { ProfileSurface } from './ProfilePresentationPrimitives';
import { ProfileSectionHeader } from './ProfileSectionHeader';
import { ProfileText } from './ProfileShared';

const heroImageByKey = HEROES.reduce<Record<string, ImageSourcePropType>>(
  (images, hero) => {
    images[normalizeKey(hero.id)] = hero.image;
    images[normalizeKey(hero.name)] = hero.image;
    return images;
  },
  {},
);

export function ProfileFavoriteHeroes({
  compact,
  heroes,
  onOpen,
  style,
}: {
  compact: boolean;
  heroes: ProfileFavoriteHero[];
  onOpen?: () => void;
  showWinRate?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const items = heroes.slice(0, 3);
  const avatarSize = compact ? 56 : 44;

  return (
    <ProfileSurface compact={compact} style={[styles.frame, style]}>
      <ProfileSectionHeader
        accessibilityLabel="Chỉnh sửa tướng yêu thích"
        compact={compact}
        onPress={onOpen}
        title="Tướng yêu thích"
        withChevron={Boolean(onOpen)}
      />
      <View style={styles.heroGrid}>
        {items.length ? (
          items.map((hero, index) => {
            const source = heroImage(hero);
            return (
              <View key={`${hero.name}-${index}`} style={styles.heroItem}>
                <LinearGradient
                  colors={liqiComponentGradients.profile.avatarRing}
                  style={[
                    styles.heroRing,
                    {
                      borderRadius: (avatarSize + 4) / 2,
                      height: avatarSize + 4,
                      width: avatarSize + 4,
                    },
                  ]}
                >
                  {source ? (
                    <Image
                      accessibilityLabel={`Tướng ${hero.name}`}
                      resizeMode="cover"
                      source={source}
                      style={{
                        borderRadius: avatarSize / 2,
                        height: avatarSize,
                        width: avatarSize,
                      }}
                    />
                  ) : (
                    <View
                      accessibilityLabel={`Ảnh tướng ${hero.name} không khả dụng`}
                      style={[
                        styles.heroFallback,
                        {
                          borderRadius: avatarSize / 2,
                          height: avatarSize,
                          width: avatarSize,
                        },
                      ]}
                    >
                      <Ionicons
                        color={liqiComponentColors.profile.subtleIcon}
                        name="shield-outline"
                        size={18}
                      />
                    </View>
                  )}
                </LinearGradient>
                <ProfileText numberOfLines={1} style={styles.heroName}>
                  {hero.name}
                </ProfileText>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Ionicons
              color={liqiComponentColors.profile.subtleIcon}
              name="shield-outline"
              size={22}
            />
            <ProfileText style={styles.emptyText}>
              Chưa chọn tướng yêu thích.
            </ProfileText>
          </View>
        )}
      </View>
    </ProfileSurface>
  );
}

function heroImage(hero: ProfileFavoriteHero) {
  return heroImageByKey[normalizeKey(hero.slug ?? hero.name)];
}

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

const styles = StyleSheet.create({
  emptyState: {
    alignItems: 'center',
    flex: 1,
    gap: liqiSpacing.md,
    justifyContent: 'center',
    minHeight: 82,
  },
  emptyText: {
    ...liqiTypography.caption,
    color: liqiColors.text.muted,
    textAlign: 'center',
  },
  frame: { flex: 1, minHeight: 154, minWidth: 0 },
  heroFallback: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.profile.mediaFallback,
    justifyContent: 'center',
  },
  heroGrid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: liqiSpacing.sm,
    justifyContent: 'space-between',
    marginTop: liqiSpacing.xl,
  },
  heroItem: { alignItems: 'center', flex: 1, minWidth: 0 },
  heroName: {
    ...liqiTypography.caption,
    color: liqiColors.text.secondary,
    fontSize: 10.5,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: liqiSpacing.sm,
    maxWidth: '100%',
    textAlign: 'center',
  },
  heroRing: { alignItems: 'center', justifyContent: 'center' },
});
