import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PlayerTrustProjectionV2 } from '@/shared/contracts/core-v2';
import {
  liqiColors,
  liqiComponentColors,
  liqiComponents,
  liqiMotion,
  liqiOpacity,
  liqiRadius,
  liqiShadow,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import { ProfileText } from './ProfileShared';

type ProfileStatTone = 'amber' | 'pink' | 'purple';

type ProfileStatItem = Readonly<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: ProfileStatTone;
  value: string;
}>;

export function ProfileStatsBar({
  compact,
  onOpenTrust,
  projection,
}: {
  compact: boolean;
  onOpenTrust?: () => void;
  projection?: PlayerTrustProjectionV2;
}) {
  const stats: readonly ProfileStatItem[] = [
    {
      icon: 'heart',
      label: 'Buổi đã chơi',
      tone: 'pink',
      value: projection ? String(projection.completedSessions) : '—',
    },
    {
      icon: 'people',
      label: 'Đồng đội quen',
      tone: 'purple',
      value: projection ? String(projection.repeatTeammateCount) : '—',
    },
    {
      icon: 'shield-checkmark',
      label: 'Độ tin cậy',
      tone: 'amber',
      value: projection
        ? `${Math.round(projection.completionReliabilityBps / 100)}%`
        : '—',
    },
  ];

  const trustNote = (
    <View style={styles.trustNoteContent}>
      <Ionicons color={liqiColors.accent.pink} name="sparkles" size={14} />
      <ProfileText style={styles.trustNoteValue}>
        {projection ? String(projection.positiveEndorsements) : '—'}
      </ProfileText>
      <ProfileText style={styles.trustNoteLabel}>Lời khen</ProfileText>
      <View style={styles.trustNoteSpacer} />
      <ProfileText numberOfLines={1} style={styles.trustNoteMeta}>
        Dữ liệu uy tín đã xác minh
      </ProfileText>
      {onOpenTrust ? (
        <Ionicons
          color={liqiComponentColors.profile.subtleIcon}
          name="chevron-forward"
          size={16}
        />
      ) : null}
    </View>
  );

  return (
    <View style={styles.container} testID="profile-trust-summary">
      <View style={[styles.row, compact && styles.rowCompact]}>
        {stats.map((item) => (
          <View
            key={item.label}
            style={[styles.card, compact && styles.cardCompact]}
          >
            <View
              style={[
                styles.iconOrb,
                compact && styles.iconOrbCompact,
                toneOrbStyle(item.tone),
              ]}
            >
              <Ionicons
                color={colorForTone(item.tone)}
                name={item.icon}
                size={compact ? 18 : 22}
              />
            </View>
            <View style={styles.copy}>
              <ProfileText numberOfLines={1} style={styles.label}>
                {item.label}
              </ProfileText>
              <ProfileText
                numberOfLines={1}
                style={[styles.value, compact && styles.valueCompact]}
              >
                {item.value}
              </ProfileText>
            </View>
          </View>
        ))}
      </View>

      {onOpenTrust ? (
        <Pressable
          accessibilityLabel="Mở lịch sử uy tín"
          accessibilityRole="button"
          onPress={onOpenTrust}
          style={({ pressed }) => [styles.trustNote, pressed && styles.pressed]}
        >
          {trustNote}
        </Pressable>
      ) : (
        <View style={styles.trustNote}>{trustNote}</View>
      )}
    </View>
  );
}

function colorForTone(tone: ProfileStatTone) {
  if (tone === 'pink') return liqiComponentColors.profile.statPink;
  if (tone === 'amber') return liqiComponentColors.profile.statAmber;
  return liqiComponentColors.profile.statPurple;
}

function toneOrbStyle(tone: ProfileStatTone) {
  if (tone === 'pink') return styles.iconOrbPink;
  if (tone === 'amber') return styles.iconOrbAmber;
  return styles.iconOrbPurple;
}

const styles = StyleSheet.create({
  card: {
    ...liqiShadow.card,
    alignItems: 'center',
    backgroundColor: liqiComponentColors.profile.surface,
    borderColor: liqiComponentColors.profile.surfaceBorder,
    borderRadius: liqiComponents.profile.detailCardRadius,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: liqiSpacing.lg,
    height: liqiComponents.profile.statCardHeight,
    minWidth: 0,
    paddingHorizontal: liqiSpacing.xl,
  },
  cardCompact: {
    gap: liqiSpacing.xs,
    height: liqiComponents.profile.statCardHeightCompact,
    paddingHorizontal: liqiSpacing.sm,
  },
  container: { gap: liqiSpacing.md },
  copy: { flex: 1, minWidth: 0 },
  iconOrb: {
    alignItems: 'center',
    borderRadius: liqiRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: liqiComponents.profile.statIcon,
    justifyContent: 'center',
    width: liqiComponents.profile.statIcon,
  },
  iconOrbAmber: {
    backgroundColor: liqiComponentColors.profile.statIconAmberSurface,
    borderColor: liqiComponentColors.profile.statAmber,
  },
  iconOrbCompact: {
    height: liqiComponents.profile.statIconCompact,
    width: liqiComponents.profile.statIconCompact,
  },
  iconOrbPink: {
    backgroundColor: liqiComponentColors.profile.statIconPinkSurface,
    borderColor: liqiComponentColors.profile.statPink,
  },
  iconOrbPurple: {
    backgroundColor: liqiComponentColors.profile.statIconPurpleSurface,
    borderColor: liqiComponentColors.profile.statPurple,
  },
  label: {
    ...liqiTypography.caption,
    color: liqiColors.text.secondary,
    fontSize: 10,
    lineHeight: 13,
  },
  pressed: {
    opacity: liqiOpacity.subtlePressed,
    transform: [{ scale: liqiMotion.subtlePressScale }],
  },
  row: { flexDirection: 'row', gap: liqiSpacing.lg },
  rowCompact: { gap: liqiSpacing.md },
  trustNote: {
    backgroundColor: liqiComponentColors.profile.actions.ghost.background,
    borderColor: liqiComponentColors.profile.actions.ghost.border,
    borderRadius: liqiRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 38,
    paddingHorizontal: liqiSpacing.xl,
  },
  trustNoteContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: liqiSpacing.sm,
    minHeight: 38,
  },
  trustNoteLabel: {
    ...liqiTypography.caption,
    color: liqiColors.text.secondary,
  },
  trustNoteMeta: {
    ...liqiTypography.caption,
    color: liqiColors.text.muted,
    flexShrink: 1,
  },
  trustNoteSpacer: { flex: 1 },
  trustNoteValue: {
    ...liqiTypography.caption,
    color: liqiColors.text.primary,
    fontWeight: '800',
  },
  value: {
    ...liqiTypography.screenTitle,
    color: liqiColors.text.onAccent,
    fontSize: 23,
    lineHeight: 27,
    marginTop: liqiSpacing.xs,
  },
  valueCompact: { fontSize: 20, lineHeight: 24 },
});
