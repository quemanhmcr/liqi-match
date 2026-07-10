import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { HEROES } from '@/features/onboarding/hero-selection-data';
import { LiquidCard } from '@/shared/components/liquid';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import type { ProfileFavoriteHero } from '../profile-service';
import { ProfileSectionHeader } from './ProfileSectionHeader';
import { ProfileText } from './ProfileShared';

const fallbackHeroImage =
  require('../../../../assets/anh_mau2/heroes/aya.webp') as ImageSourcePropType;

const heroImageByKey = HEROES.reduce<Record<string, ImageSourcePropType>>(
  (images, hero) => {
    images[normalizeKey(hero.id)] = hero.image;
    images[normalizeKey(hero.name)] = hero.image;
    return images;
  },
  {},
);

export function ProfileFavoriteHeroes({
  heroes,
  onOpen,
  showWinRate = true,
}: {
  heroes: ProfileFavoriteHero[];
  onOpen?: () => void;
  showWinRate?: boolean;
}) {
  const items = heroes.slice(0, 3);

  return (
    <LiquidCard
      baseStrokeColor="rgba(103,232,255,0.18)"
      baseStrokeOpacity={0.08}
      blurIntensity={26}
      contentStyle={styles.sectionSurface}
      density="regular"
      frameColors={[
        'rgba(106,101,255,0.13)',
        'rgba(255,255,255,0.028)',
        'rgba(103,232,255,0.12)',
      ]}
      glassIntensity="low"
      glowIntensity="low"
      radius={25}
      style={styles.sectionFrame}
      surfaceBackground="rgba(8,12,28,0.36)"
      withInnerReflection
      withShadow={false}
    >
      <ProfileSectionHeader
        accessibilityLabel="Chỉnh sửa tướng tủ"
        icon="shield-checkmark-outline"
        title="Tướng tủ"
        withChevron={Boolean(onOpen)}
        onPress={onOpen}
      />
      <ScrollView
        contentContainerStyle={styles.heroGrid}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {items.length ? (
          items.map((hero, index) => (
            <LiquidCard
              contentStyle={styles.heroMiniSurface}
              density="list"
              frameColors={[
                'rgba(106,101,255,0.10)',
                'rgba(255,255,255,0.026)',
                'rgba(103,232,255,0.09)',
              ]}
              glassIntensity="low"
              glowIntensity="low"
              key={`${hero.name}-${index}`}
              radius={18}
              style={styles.heroMiniFrame}
              surfaceBackground="rgba(11,15,32,0.28)"
              withInnerReflection={false}
              withShadow={false}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.00)']}
                end={{ x: 1, y: 0 }}
                pointerEvents="none"
                start={{ x: 0, y: 0 }}
                style={styles.heroMiniHighlight}
              />
              <View style={styles.heroAvatarWrap}>
                <LinearGradient
                  colors={['rgba(142,92,255,0.60)', 'rgba(103,232,255,0.52)']}
                  end={{ x: 1, y: 1 }}
                  start={{ x: 0, y: 0 }}
                  style={styles.heroAvatarRing}
                >
                  <Image source={heroImage(hero)} style={styles.heroAvatar} />
                </LinearGradient>
                <View style={styles.roleBadge}>
                  <Ionicons
                    color="rgba(205,244,255,0.86)"
                    name="sparkles"
                    size={10}
                  />
                </View>
              </View>
              <View style={styles.heroMiniCopy}>
                <ProfileText numberOfLines={1} style={styles.heroName}>
                  {hero.name}
                </ProfileText>
                {heroStatsLabel(hero, showWinRate) ? (
                  <ProfileText numberOfLines={1} style={styles.heroMeta}>
                    {heroStatsLabel(hero, showWinRate)}
                  </ProfileText>
                ) : null}
              </View>
            </LiquidCard>
          ))
        ) : (
          <View style={styles.emptyHeroes}>
            <ProfileText style={styles.emptyText}>
              Chưa chọn tướng tủ.
            </ProfileText>
          </View>
        )}
      </ScrollView>
    </LiquidCard>
  );
}

function heroStatsLabel(hero: ProfileFavoriteHero, showWinRate: boolean) {
  if (hero.matches !== undefined && hero.winRate !== undefined && showWinRate) {
    return `${hero.matches} trận · ${hero.winRate}% win`;
  }

  if (hero.matches !== undefined) return `${hero.matches} trận`;
  if (hero.winRate !== undefined && showWinRate) return `${hero.winRate}% win`;
  return undefined;
}

function heroImage(hero: ProfileFavoriteHero) {
  const key = normalizeKey(hero.slug ?? hero.name);
  return heroImageByKey[key] ?? fallbackHeroImage;
}

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

const styles = StyleSheet.create({
  emptyHeroes: {
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  emptyText: {
    color: 'rgba(205,216,245,0.54)',
    fontSize: 11,
    fontWeight: '600',
  },
  heroAvatar: {
    borderRadius: 19,
    height: 38,
    width: 38,
  },
  heroAvatarRing: {
    alignItems: 'center',
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  heroAvatarWrap: {
    height: 44,
    position: 'relative',
    width: 44,
  },
  heroGrid: {
    gap: 8,
    marginTop: 10,
    paddingRight: 2,
  },
  heroMeta: {
    color: 'rgba(186,239,255,0.58)',
    fontSize: 9.4,
    fontWeight: '600',
    marginTop: 3,
  },
  heroMiniHighlight: {
    height: 1,
    left: 13,
    opacity: 0.54,
    position: 'absolute',
    right: 13,
    top: 1,
  },
  heroMiniFrame: {
    minWidth: 120,
    width: 122,
  },
  heroMiniCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroMiniSurface: {
    alignItems: 'center',
    borderRadius: 17,
    flexDirection: 'row',
    gap: 8,
    minHeight: 54,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  heroName: {
    ...liquidTypography.chip,
    color: liquidColors.text.primary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 0,
    maxWidth: '100%',
  },
  roleBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(45,28,88,0.86)',
    borderColor: 'rgba(103,232,255,0.24)',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: -1,
    height: 17,
    justifyContent: 'center',
    left: -2,
    position: 'absolute',
    width: 17,
  },
  sectionFrame: {
    marginTop: 10,
  },
  sectionSurface: {
    borderRadius: 25,
    padding: 12,
  },
});
