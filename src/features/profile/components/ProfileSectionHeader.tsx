import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  liqiColors,
  liqiComponentColors,
  liqiOpacity,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import { ProfileText } from './ProfileShared';

export type ProfileSectionHeaderProps = {
  accessibilityLabel?: string;
  compact?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  title: string;
  withChevron?: boolean;
};

export function ProfileSectionHeader({
  accessibilityLabel,
  compact = false,
  icon,
  onPress,
  title,
  withChevron = true,
}: ProfileSectionHeaderProps) {
  const content = (
    <>
      <View style={styles.titleRow}>
        {icon ? (
          <Ionicons
            color={liqiComponentColors.profile.interestIcon}
            name={icon}
            size={16}
          />
        ) : null}
        <ProfileText
          adjustsFontSizeToFit
          minimumFontScale={0.88}
          numberOfLines={1}
          style={[styles.title, compact && styles.titleCompact]}
        >
          {title}
        </ProfileText>
      </View>
      {withChevron ? (
        <Ionicons
          color={liqiComponentColors.profile.subtleIcon}
          name="chevron-forward"
          size={18}
        />
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.shell}>{content}</View>;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: liqiOpacity.pressed },
  shell: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing.sm,
    justifyContent: 'space-between',
    minHeight: 24,
  },
  title: {
    ...liqiTypography.sectionTitle,
    color: liqiColors.text.onAccent,
    flex: 1,
    minWidth: 0,
  },
  titleCompact: { ...liqiTypography.sectionTitleCompact },
  titleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: liqiSpacing.sm,
    minWidth: 0,
  },
});
