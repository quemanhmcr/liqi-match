import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppCard, AppText, appColors, appRadii, appSpacing } from '@/shared/ui';

import { ProfileArtwork } from '../../components/ProfileArtwork';
import type { ProfilePlayStyleTile } from '../../model/profile-play-style-presenter';
import { profileEditUi } from '../../ui/profile-edit-ui';

export const PROFILE_PLAY_STYLE_CHANGE_PREVIEW_MS = 2200;

const ENTER_DURATION_MS = 160;
const EXIT_DURATION_MS = 180;
const EXIT_DELAY_MS = PROFILE_PLAY_STYLE_CHANGE_PREVIEW_MS - EXIT_DURATION_MS;

/**
 * A lightweight, non-interactive confirmation for an archetype change.
 *
 * It behaves like a quiet in-app notification rather than a second content
 * card: compact copy, a small artwork thumbnail, no layout participation and
 * no queued notifications. The parent sequence guard owns stale-dismissal
 * protection when a newer preview replaces this one.
 */
export function ProfilePlayStyleChangePreview({
  onDismiss,
  sequence,
  tile,
}: Readonly<{
  onDismiss: (sequence: number) => void;
  sequence: number;
  tile: ProfilePlayStyleTile;
}>) {
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(-6));

  useEffect(() => {
    const enterAnimation = Animated.parallel([
      Animated.timing(opacity, {
        duration: ENTER_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: ENTER_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]);
    enterAnimation.start();

    const exitTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          duration: EXIT_DURATION_MS,
          easing: Easing.in(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          duration: EXIT_DURATION_MS,
          easing: Easing.in(Easing.cubic),
          toValue: -4,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onDismiss(sequence);
      });
    }, EXIT_DELAY_MS);

    return () => {
      clearTimeout(exitTimer);
      enterAnimation.stop();
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [onDismiss, opacity, sequence, translateY]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.overlay,
        {
          opacity,
          top: insets.top + appSpacing.sm,
          transform: [{ translateY }],
        },
      ]}
      testID="profile-play-style-change-preview"
    >
      <AppCard
        backgroundColor={profileEditUi.colors.quickPreviewSurface}
        borderColor={profileEditUi.colors.quickPreviewBorder}
        borderOpacity={1}
        contentStyle={styles.content}
        density="compact"
        emphasis="none"
        radius={appRadii.lg}
        style={styles.card}
        surfaceTone="low"
        testID={`profile-play-style-change-preview-${tile.slot}`}
        withShadow={false}
      >
        <View style={styles.artwork}>
          <ProfileArtwork
            accessibilityLabel={`Bản xem trước ${tile.label}: ${tile.title}`}
            recyclingKey={`profile-play-style-change-${tile.archetypeId ?? tile.slot}`}
            source={tile.image}
            variant="play-style"
          />
        </View>
        <View style={styles.copy}>
          <View style={styles.statusRow}>
            <Ionicons
              color={appColors.accent.purpleIcon}
              name="checkmark-circle"
              size={14}
            />
            <AppText
              numberOfLines={1}
              style={styles.statusLabel}
              tone="secondary"
              variant="caption"
            >
              {tile.label} ĐÃ CẬP NHẬT
            </AppText>
          </View>
          <AppText numberOfLines={1} variant="label">
            {tile.title}
          </AppText>
        </View>
      </AppCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  artwork: {
    borderRadius: appRadii.md,
    height: 44,
    overflow: 'hidden',
    width: 44,
  },
  card: {
    maxWidth: 352,
    width: '100%',
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.md,
    minHeight: 66,
    paddingHorizontal: appSpacing.lg,
    paddingVertical: appSpacing.sm,
  },
  copy: { flex: 1, gap: appSpacing.xxs, minWidth: 0 },
  overlay: {
    alignItems: 'center',
    left: appSpacing.xl,
    position: 'absolute',
    right: appSpacing.xl,
    zIndex: 24,
  },
  statusLabel: { letterSpacing: 0.45 },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.xs,
  },
});
