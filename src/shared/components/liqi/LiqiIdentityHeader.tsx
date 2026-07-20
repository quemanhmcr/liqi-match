import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  liqiColors,
  liqiComponentColors,
  liqiComponentGradients,
  liqiComponents,
  liqiOpacity,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

export type LiqiIdentityHeaderAction = Readonly<{
  accessibilityLabel: string;
  emphasized?: boolean;
  icon: ComponentProps<typeof Ionicons>['name'];
  indicator?: boolean;
  indicatorTestID?: string;
  onPress: () => void;
  testID?: string;
}>;

export type LiqiIdentityHeaderProps = Readonly<{
  actions?: readonly LiqiIdentityHeaderAction[];
  avatar?: ReactNode;
  leadingAction?: LiqiIdentityHeaderAction;
  compact: boolean;
  online?: boolean;
  presentation?: 'identity' | 'page';
  subtitle: string;
  testID?: string;
  title: string;
  titleAccessory?: ReactNode;
}>;

/**
 * Canonical identity header extracted from the approved Home reference.
 * Feature screens own the copy and actions; geometry and interaction treatment
 * remain shared so Home, Profile and future social surfaces cannot drift.
 */
export function LiqiIdentityHeader({
  actions = [],
  avatar,
  compact,
  leadingAction,
  online = true,
  presentation = 'identity',
  subtitle,
  testID,
  title,
  titleAccessory,
}: LiqiIdentityHeaderProps) {
  const pagePresentation = presentation === 'page';

  return (
    <View
      style={[
        styles.header,
        compact && styles.headerCompact,
        pagePresentation && styles.pageHeader,
        pagePresentation && compact && styles.pageHeaderCompact,
      ]}
      testID={testID}
    >
      {leadingAction ? (
        <HeaderAction action={leadingAction} compact={compact} />
      ) : null}
      <View
        style={[
          styles.identity,
          compact && styles.identityCompact,
          pagePresentation && styles.pageIdentity,
        ]}
      >
        {avatar ? (
          <View style={styles.avatarWrap}>
            {avatar}
            {online ? <View style={styles.onlineDot} /> : null}
          </View>
        ) : null}
        <View style={[styles.copy, pagePresentation && styles.pageCopy]}>
          <View style={styles.titleLine}>
            <Text
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1}
              minimumFontScale={0.76}
              numberOfLines={1}
              style={[
                styles.title,
                compact && styles.titleCompact,
                pagePresentation && styles.pageTitle,
                pagePresentation && compact && styles.pageTitleCompact,
              ]}
            >
              {title}
            </Text>
            {titleAccessory ? (
              <View style={styles.titleAccessory}>{titleAccessory}</View>
            ) : null}
          </View>
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1}
            minimumFontScale={0.78}
            numberOfLines={pagePresentation ? 2 : 1}
            style={[
              styles.subtitle,
              compact && styles.subtitleCompact,
              pagePresentation && styles.pageSubtitle,
              pagePresentation && compact && styles.pageSubtitleCompact,
            ]}
          >
            {subtitle}
          </Text>
        </View>
      </View>

      {actions.length ? (
        <View style={[styles.actions, compact && styles.actionsCompact]}>
          {actions.map((action) => (
            <HeaderAction
              action={action}
              compact={compact}
              key={action.accessibilityLabel}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function HeaderAction({
  action,
  compact,
}: Readonly<{
  action: LiqiIdentityHeaderAction;
  compact: boolean;
}>) {
  if (action.emphasized) {
    return (
      <Pressable
        accessibilityLabel={action.accessibilityLabel}
        accessibilityRole="button"
        onPress={action.onPress}
        style={({ pressed }) => [
          styles.emphasizedAction,
          compact && styles.emphasizedActionCompact,
          pressed && styles.pressed,
        ]}
        testID={action.testID}
      >
        <LinearGradient
          colors={liqiComponentGradients.identityHeader.action}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons
          color={liqiColors.accent.purpleIcon}
          name={action.icon}
          size={compact ? 25 : 28}
        />
        {action.indicator ? (
          <View style={styles.indicator} testID={action.indicatorTestID} />
        ) : null}
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel={action.accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={action.onPress}
      style={({ pressed }) => [
        styles.plainAction,
        compact && styles.plainActionCompact,
        pressed && styles.pressed,
      ]}
      testID={action.testID}
    >
      <Ionicons
        color={liqiColors.icon.primary}
        name={action.icon}
        size={compact ? 23 : 25}
      />
      {action.indicator ? (
        <View style={styles.indicator} testID={action.indicatorTestID} />
      ) : null}
    </Pressable>
  );
}

export function liqiDisplayFirstName(name: string) {
  const value = name.trim();
  if (!value || value === 'Bạn') return 'Linh';
  return value.split(/\s+/)[0] ?? value;
}

export function liqiDaypartCopy(date = new Date()) {
  const hour = date.getHours();
  if (hour < 11) return 'Buổi sáng nhẹ nhàng';
  if (hour < 17) return 'Buổi chiều chill';
  return 'Buổi tối chill';
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionsCompact: { gap: 4 },
  avatarWrap: { position: 'relative' },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  emphasizedAction: {
    alignItems: 'center',
    borderColor: liqiComponentColors.identityHeader.actionBorder,
    borderRadius: liqiComponents.identityHeader.emphasizedAction / 2,
    borderWidth: StyleSheet.hairlineWidth,
    height: liqiComponents.identityHeader.emphasizedAction,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: liqiComponentColors.identityHeader.actionShadow,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    width: liqiComponents.identityHeader.emphasizedAction,
  },
  emphasizedActionCompact: {
    borderRadius: liqiComponents.identityHeader.emphasizedActionCompact / 2,
    height: liqiComponents.identityHeader.emphasizedActionCompact,
    width: liqiComponents.identityHeader.emphasizedActionCompact,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: liqiComponents.identityHeader.minHeight,
  },
  headerCompact: { minHeight: liqiComponents.identityHeader.minHeightCompact },
  identity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 11,
    minWidth: 0,
  },
  identityCompact: { gap: 9 },
  indicator: {
    backgroundColor: liqiComponentColors.identityHeader.indicator,
    borderColor: liqiComponentColors.identityHeader.indicatorBorder,
    borderRadius: 5,
    borderWidth: 1.5,
    height: 10,
    position: 'absolute',
    right: 5,
    top: 4,
    width: 10,
  },
  pageCopy: { gap: 5 },
  pageHeader: { minHeight: 72 },
  pageHeaderCompact: { minHeight: 66 },
  pageIdentity: { alignItems: 'flex-start' },
  pageSubtitle: { ...liqiTypography.body, maxWidth: 310 },
  pageSubtitleCompact: { ...liqiTypography.bodyCompact, maxWidth: 230 },
  pageTitle: { ...liqiTypography.displayHero },
  pageTitleCompact: { ...liqiTypography.displayHeroCompact },
  onlineDot: {
    backgroundColor: liqiColors.status.online,
    borderColor: liqiComponentColors.identityHeader.avatarFrame,
    borderRadius: 6,
    borderWidth: 2,
    bottom: 0,
    height: 13,
    position: 'absolute',
    right: -1,
    width: 13,
  },
  plainAction: {
    alignItems: 'center',
    height: liqiComponents.identityHeader.plainActionHeight,
    justifyContent: 'center',
    position: 'relative',
    width: liqiComponents.identityHeader.plainActionWidth,
  },
  plainActionCompact: {
    height: liqiComponents.identityHeader.plainActionHeightCompact,
    width: liqiComponents.identityHeader.plainActionWidthCompact,
  },
  pressed: { opacity: liqiOpacity.pressed },
  subtitle: { ...liqiTypography.subtitle },
  subtitleCompact: { ...liqiTypography.subtitleCompact },
  title: {
    ...liqiTypography.greeting,
    color: liqiColors.text.onAccent,
    flexShrink: 1,
  },
  titleAccessory: { flexShrink: 0 },
  titleCompact: { ...liqiTypography.greetingCompact },
  titleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
});
