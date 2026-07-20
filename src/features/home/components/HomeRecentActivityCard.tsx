import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { appColors, appMotion } from '@/shared/ui';

import { homeUi } from '../ui/home-ui';

export type HomeRecentActivityCardProps = Readonly<{
  badge?: string | null;
  compact: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'] | null;
  image: ImageSourcePropType;
  meta: string;
  onPress: () => void;
  title: string;
}>;

/** Approved Home recent-activity tile, including compact geometry and states. */
export function HomeRecentActivityCard({
  badge,
  compact,
  icon,
  image,
  meta,
  onPress,
  title,
}: HomeRecentActivityCardProps) {
  return (
    <Pressable
      accessibilityLabel={`${title}, ${meta}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        pressed && styles.pressed,
      ]}
      testID={`home-recent-activity-${title}`}
    >
      <ImageBackground
        imageStyle={[styles.imageRadius, compact && styles.imageRadiusCompact]}
        resizeMode="cover"
        source={image}
        style={styles.image}
      >
        <LinearGradient
          colors={homeUi.gradients.recentFade}
          locations={[0.38, 1]}
          style={StyleSheet.absoluteFill}
        />
        {badge ? (
          <View style={styles.badge}>
            <Text maxFontSizeMultiplier={1} style={styles.badgeText}>
              {badge}
            </Text>
          </View>
        ) : null}
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text
              maxFontSizeMultiplier={1}
              numberOfLines={1}
              style={[styles.title, compact && styles.titleCompact]}
            >
              {title}
            </Text>
            {icon ? (
              <Ionicons
                color={
                  icon === 'heart'
                    ? homeUi.colors.recentHeart
                    : homeUi.colors.recentAccent
                }
                name={icon}
                size={12}
              />
            ) : null}
          </View>
          <Text
            maxFontSizeMultiplier={1}
            numberOfLines={1}
            style={[styles.meta, compact && styles.metaCompact]}
          >
            {meta}
          </Text>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: homeUi.colors.mvpBackground,
    borderBottomRightRadius: 9,
    left: 0,
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: 'absolute',
    top: 0,
  },
  badgeText: {
    color: homeUi.colors.mvpText,
    fontSize: 8,
    fontWeight: '900',
  },
  card: {
    borderColor: homeUi.colors.recentBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    height: homeUi.metrics.recent.cardHeight,
    minWidth: 0,
    overflow: 'hidden',
  },
  cardCompact: {
    borderRadius: 12,
    height: homeUi.metrics.recent.cardHeightCompact,
  },
  copy: {
    bottom: 0,
    gap: 3,
    left: 0,
    paddingBottom: 8,
    paddingHorizontal: 7,
    position: 'absolute',
    right: 0,
  },
  image: { flex: 1 },
  imageRadius: { borderRadius: 14 },
  imageRadiusCompact: { borderRadius: 12 },
  meta: {
    color: appColors.text.tertiary,
    fontSize: 8.5,
    fontWeight: '500',
  },
  metaCompact: { fontSize: 7.5 },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: appMotion.subtlePressScale }],
  },
  title: {
    color: appColors.text.onAccent,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  titleCompact: { fontSize: 9 },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
});
