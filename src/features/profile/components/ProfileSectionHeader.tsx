import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import { ProfileText } from './ProfileShared';

export type ProfileSectionHeaderProps = {
  accessibilityLabel?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  title: string;
  withChevron?: boolean;
};

export function ProfileSectionHeader({
  accessibilityLabel,
  icon,
  onPress,
  title,
  withChevron = true,
}: ProfileSectionHeaderProps) {
  const content = (
    <>
      <View style={styles.titleRow}>
        <LinearGradient
          colors={['rgba(106,101,255,0.22)', 'rgba(103,232,255,0.12)']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.iconSlot}
        >
          <Ionicons color="rgba(205,244,255,0.82)" name={icon} size={12} />
        </LinearGradient>
        <ProfileText style={styles.title}>{title}</ProfileText>
      </View>
      {withChevron ? (
        <Ionicons
          color="rgba(218,225,255,0.48)"
          name="chevron-forward"
          size={17}
        />
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.shell}>{content}</View>;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconSlot: {
    alignItems: 'center',
    borderColor: 'rgba(103,232,255,0.14)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 23,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 23,
  },
  pressed: { opacity: 0.76 },
  shell: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: liquidColors.text.primary,
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.22,
  },
  titleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 0,
  },
});
