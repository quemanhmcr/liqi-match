import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppSurface } from './AppSurface';
import { AppText } from './AppText';
import { sharedUiRecipes } from './internal/component-recipes';

export type AppNoticeTone =
  'info' | 'neutral' | 'success' | 'warning' | 'danger';

export type AppNoticeProps = Readonly<{
  /** Spoken label for the complete notice when visible copy is insufficient. */
  accessibilityLabel?: string;
  /** Optional recovery or follow-up action rendered below the notice copy. */
  action?: ReactNode;
  /** Explanatory copy. Business truth remains owned by the caller. */
  children: ReactNode;
  /** Semantic Ionicons glyph; it must reinforce rather than replace the title. */
  icon: ComponentProps<typeof Ionicons>['name'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Short visible heading describing the state or guard. */
  title: string;
  /** Visual and accessibility urgency. Warning and danger are polite alerts. */
  tone?: AppNoticeTone;
}>;

/**
 * Persistent inline status, guard or explanation with shared semantic tone.
 *
 * Warning and danger notices are announced as polite alerts. Use a toast for
 * transient confirmation and a dialog for decisions that block the flow; this
 * component must not infer errors, permissions or authority from visual state.
 */
export function AppNotice({
  accessibilityLabel,
  action,
  children,
  icon,
  style,
  testID,
  title,
  tone = 'neutral',
}: AppNoticeProps) {
  const recipe = sharedUiRecipes.notice.tones[tone];
  const urgent = tone === 'danger' || tone === 'warning';

  return (
    <AppSurface
      backgroundColor={recipe.background}
      borderColor={recipe.border}
      contentStyle={styles.content}
      emphasis="none"
      radius={sharedUiRecipes.notice.radius}
      style={style}
      surfaceTone="low"
      testID={testID}
      variant="card"
      withHighlight={false}
      withShadow={false}
    >
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityLiveRegion={urgent ? 'polite' : 'none'}
        accessibilityRole={urgent ? 'alert' : undefined}
        style={styles.row}
      >
        <View
          style={[styles.iconShell, { backgroundColor: recipe.iconSurface }]}
        >
          <Ionicons color={recipe.icon} name={icon} size={18} />
        </View>
        <View style={styles.copy}>
          <AppText variant="label">{title}</AppText>
          <AppText tone="secondary" variant="bodySmall">
            {children}
          </AppText>
          {action ? <View style={styles.action}>{action}</View> : null}
        </View>
      </View>
    </AppSurface>
  );
}

const styles = StyleSheet.create({
  action: {
    alignSelf: 'flex-start',
    marginTop: sharedUiRecipes.notice.actionGap,
  },
  content: { padding: sharedUiRecipes.notice.padding },
  copy: { flex: 1, gap: sharedUiRecipes.notice.copyGap, minWidth: 0 },
  iconShell: {
    alignItems: 'center',
    borderRadius: sharedUiRecipes.notice.iconSize / 2,
    height: sharedUiRecipes.notice.iconSize,
    justifyContent: 'center',
    width: sharedUiRecipes.notice.iconSize,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: sharedUiRecipes.notice.gap,
  },
});
