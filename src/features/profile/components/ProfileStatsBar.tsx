import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { LiquidCard } from '@/shared/components/liquid';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import type { ProfileStats } from '../services/profile-service';
import { ProfileText } from './ProfileShared';

type StatItem = {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
};

function buildStats(stats: ProfileStats): StatItem[] {
  return [
    {
      color: 'rgba(142,118,255,0.78)',
      icon: 'sparkles-outline',
      label: 'Trận',
      value: `${stats.matches}`,
    },
    {
      color: 'rgba(170,190,255,0.72)',
      icon: 'trophy-outline',
      label: 'Tỷ lệ thắng',
      value: `${stats.winRate}%`,
    },
    {
      color: 'rgba(255,205,74,0.88)',
      icon: 'star-outline',
      label: 'Đánh giá',
      value: `${stats.rating}`,
    },
    {
      color: 'rgba(103,232,255,0.88)',
      icon: 'shield-checkmark-outline',
      label: 'Uy tín',
      value: `${stats.reputation}`,
    },
  ];
}

export function ProfileStatsBar({
  embedded = false,
  showWinRate = true,
  stats,
}: {
  embedded?: boolean;
  showWinRate?: boolean;
  stats: ProfileStats;
}) {
  const items = showWinRate
    ? buildStats(stats)
    : buildStats(stats).filter((item) => item.label !== 'Tỷ lệ thắng');

  return (
    <LiquidCard
      baseStrokeColor={
        embedded ? 'rgba(150,190,255,0.14)' : 'rgba(103,232,255,0.20)'
      }
      baseStrokeOpacity={embedded ? 0.045 : 0.06}
      blurIntensity={embedded ? 18 : 28}
      contentStyle={[styles.surface, embedded && styles.embeddedSurface]}
      density="compact"
      frameColors={
        embedded
          ? [
              'rgba(106,101,255,0.075)',
              'rgba(210,225,255,0.018)',
              'rgba(103,232,255,0.075)',
            ]
          : [
              'rgba(106,101,255,0.14)',
              'rgba(210,225,255,0.030)',
              'rgba(103,232,255,0.15)',
            ]
      }
      glassIntensity="low"
      glowIntensity={embedded ? 'none' : 'low'}
      radius={embedded ? 24 : 27}
      style={[styles.frame, embedded && styles.embeddedFrame]}
      surfaceBackground={embedded ? 'rgba(4,8,20,0.76)' : undefined}
      withInnerReflection
      withShadow={false}
    >
      <LinearGradient
        colors={
          embedded
            ? [
                'rgba(106,101,255,0.034)',
                'rgba(56,215,255,0.026)',
                'rgba(255,255,255,0)',
              ]
            : [
                'rgba(106,101,255,0.060)',
                'rgba(56,215,255,0.050)',
                'rgba(255,255,255,0)',
              ]
        }
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.00)']}
        end={{ x: 1, y: 0 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={styles.topHighlight}
      />
      <View style={styles.row}>
        {items.map((item, index) => (
          <View key={item.label} style={styles.statSlot}>
            {index > 0 ? <View style={styles.separator} /> : null}
            <Ionicons color={item.color} name={item.icon} size={15} />
            <ProfileText style={styles.value}>{item.value}</ProfileText>
            <ProfileText numberOfLines={1} style={styles.label}>
              {item.label}
            </ProfileText>
          </View>
        ))}
      </View>
    </LiquidCard>
  );
}

const styles = StyleSheet.create({
  embeddedFrame: {
    marginTop: 11,
  },
  embeddedSurface: {
    paddingVertical: 5,
  },
  frame: {
    marginTop: 10,
  },
  label: {
    color: liquidColors.text.muted,
    fontSize: 8.5,
    fontWeight: '500',
    marginTop: 0,
  },
  row: {
    flexDirection: 'row',
  },
  separator: {
    backgroundColor: 'rgba(255,255,255,0.052)',
    bottom: 11,
    left: 0,
    position: 'absolute',
    top: 11,
    width: StyleSheet.hairlineWidth,
  },
  statSlot: {
    alignItems: 'center',
    flex: 1,
    gap: 0,
    justifyContent: 'center',
    minHeight: 50,
    position: 'relative',
  },
  surface: {
    borderRadius: 25,
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  topHighlight: {
    height: 1,
    left: 18,
    opacity: 0.4,
    position: 'absolute',
    right: 18,
    top: 1,
  },
  value: {
    ...liquidTypography.cardTitle,
    color: 'rgba(250,252,255,0.94)',
    fontSize: 18.5,
    fontWeight: '700',
    letterSpacing: -0.34,
    marginTop: 0,
  },
});
