import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { liqiComponents } from '@/shared/theme/liqi-design-system';

import {
  LiqiSurface,
  type LiqiEmphasis,
  type LiqiSurfaceTone,
} from './LiqiSurface';

type LiqiCardVariant = 'default' | 'purple' | 'cyan' | 'orange';
type LiqiCardDensity = 'list' | 'compact' | 'regular' | 'large';
type GradientColors = readonly [string, string, ...string[]];

const densityPadding: Record<LiqiCardDensity, number> =
  liqiComponents.card.densityPadding;

export type LiqiCardProps = Readonly<{
  backgroundColor?: string;
  backgroundSlot?: ReactNode;
  borderColor?: string;
  borderOpacity?: number;
  borderWidth?: number;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  density?: LiqiCardDensity;
  emphasis?: LiqiEmphasis;
  frameGradient?: GradientColors;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  surfaceTone?: LiqiSurfaceTone;
  testID?: string;
  variant?: LiqiCardVariant;
  withHighlight?: boolean;
  withShadow?: boolean;
}>;

export function LiqiCard({
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
  radius = liqiComponents.card.defaultRadius,
  style,
  surfaceTone,
  testID,
  variant = 'default',
  withHighlight = false,
  withShadow = true,
}: LiqiCardProps) {
  return (
    <LiqiSurface
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
    </LiqiSurface>
  );
}
