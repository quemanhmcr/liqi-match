import { BlurMask, Canvas, Path } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type EdgeGlowSegment = {
  bloomOpacity?: number;
  bloomWidth?: number;
  blur?: number;
  color: string;
  end: number;
  id: string;
  lineOpacity?: number;
  lineWidth?: number;
  start: number;
};

type LiquidEdgeGlowProps = {
  baseStrokeColor?: string;
  baseStrokeOpacity?: number;
  baseStrokeWidth?: number;
  height?: number;
  pad?: number;
  radius: number;
  segments: readonly EdgeGlowSegment[];
  style?: StyleProp<ViewStyle>;
  width?: number;
};

type Size = { height: number; width: number };

function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);

  return [
    `M ${x + r} ${y}`,
    `H ${x + width - r}`,
    `A ${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `V ${y + height - r}`,
    `A ${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

export const LiquidEdgeGlow = memo(function LiquidEdgeGlow({
  baseStrokeColor = 'rgba(255,255,255,0.14)',
  baseStrokeOpacity = 0.18,
  baseStrokeWidth = 0.7,
  height,
  pad = 14,
  radius,
  segments,
  style,
  width,
}: LiquidEdgeGlowProps) {
  const fixedSize = useMemo(
    () => (width && height ? { height, width } : null),
    [height, width],
  );
  const [measuredSize, setMeasuredSize] = useState<Size | null>(null);
  const size = fixedSize ?? measuredSize;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    if (height <= 0 || width <= 0) return;

    if (fixedSize) return;

    setMeasuredSize((current) => {
      if (
        current &&
        Math.abs(current.height - height) < 0.5 &&
        Math.abs(current.width - width) < 0.5
      ) {
        return current;
      }
      return { height, width };
    });
  }, [fixedSize]);

  const path = useMemo(() => {
    if (!size) return '';
    return roundedRectPath(pad, pad, size.width, size.height, radius);
  }, [pad, radius, size]);

  return (
    <View
      onLayout={onLayout}
      pointerEvents="none"
      style={[styles.host, style]}
    >
      {size ? (
        <Canvas
          style={[
            styles.canvas,
            {
              height: size.height + pad * 2,
              left: -pad,
              top: -pad,
              width: size.width + pad * 2,
            },
          ]}
        >
          <Path
            color={baseStrokeColor}
            end={1}
            opacity={baseStrokeOpacity}
            path={path}
            start={0}
            strokeJoin="round"
            strokeWidth={baseStrokeWidth}
            style="stroke"
          />
          {segments.map((segment) => (
            <Path
              color={segment.color}
              end={segment.end}
              key={`bloom-${segment.id}`}
              opacity={segment.bloomOpacity ?? 0.24}
              path={path}
              start={segment.start}
              strokeCap="round"
              strokeJoin="round"
              strokeWidth={segment.bloomWidth ?? 5}
              style="stroke"
            >
              <BlurMask blur={segment.blur ?? 10} style="normal" />
            </Path>
          ))}
          {segments.map((segment) => (
            <Path
              color={segment.color}
              end={segment.end}
              key={`line-${segment.id}`}
              opacity={segment.lineOpacity ?? 0.52}
              path={path}
              start={segment.start}
              strokeCap="round"
              strokeJoin="round"
              strokeWidth={segment.lineWidth ?? 0.9}
              style="stroke"
            />
          ))}
        </Canvas>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  canvas: { position: 'absolute' },
  host: {
    bottom: 0,
    left: 0,
    overflow: 'visible',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
});
