import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { sharedUiRecipes } from './internal/component-recipes';

import {
  AppSurface,
  type AppSurfaceEmphasis,
  type AppSurfaceTone,
} from './AppSurface';

type AppCardVariant = 'default' | 'purple' | 'cyan' | 'orange';
type AppCardDensity = 'list' | 'compact' | 'regular' | 'large';
type GradientColors = readonly [string, string, ...string[]];

const densityPadding: Record<AppCardDensity, number> =
  sharedUiRecipes.card.densityPadding;

export type AppCardProps = Readonly<{
  backgroundColor?: string;
  backgroundSlot?: ReactNode;
  borderColor?: string;
  borderOpacity?: number;
  borderWidth?: number;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  density?: AppCardDensity;
  emphasis?: AppSurfaceEmphasis;
  frameGradient?: GradientColors;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  surfaceTone?: AppSurfaceTone;
  testID?: string;
  variant?: AppCardVariant;
  withHighlight?: boolean;
  withShadow?: boolean;
}>;

export function AppCard({
  backgroundColor,
  backgroundSlot,
  borderColor,
  borderOpacity,
  borderWidth,
  children,
  contentStyle,
  density = 'regular',
  emphasis,
  frameGradient,
  radius = sharedUiRecipes.card.defaultRadius,
  style,
  surfaceTone,
  testID,
  variant = 'default',
  withHighlight = false,
  withShadow = true,
}: AppCardProps) {
  return (
    <AppSurface
      backgroundColor={backgroundColor}
      backgroundSlot={backgroundSlot}
      borderColor={borderColor}
      borderOpacity={borderOpacity}
      borderWidth={borderWidth}
      contentStyle={[{ padding: densityPadding[density] }, contentStyle]}
      emphasis={
        emphasis ??
        (density === 'list' ? 'none' : variant === 'default' ? 'low' : 'medium')
      }
      frameGradient={frameGradient}
      radius={radius}
      style={style}
      surfaceTone={surfaceTone ?? (density === 'list' ? 'low' : 'medium')}
      testID={testID}
      variant="card"
      withHighlight={withHighlight}
      withShadow={withShadow}
    >
      {children}
    </AppSurface>
  );
}
