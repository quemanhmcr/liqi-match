import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LiquidButton, LiquidGlassSurface } from '@/shared/components/liquid';

const profileBackground =
  require('../../../../assets/anh_mau_4/background-chon-ho-so.png') as number;
const liqiLogoMark =
  require('../../../../assets/anh_mau_4/logo-emblem.png') as number;
const backgroundAspectRatio = 1844 / 853;

type ShellTone = 'purple' | 'cyan' | 'orange';
type HeaderDensity = 'regular' | 'compact';

type OnboardingCinematicShellProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  headerDensity?: HeaderDensity;
  scroll?: boolean;
  step: number;
  subtitle: string;
  title: string;
  tone?: ShellTone;
  totalSteps?: number;
};

const toneCopy: Record<ShellTone, { accent: string }> = {
  cyan: { accent: 'rgba(103,232,255,0.94)' },
  orange: { accent: 'rgba(255,184,107,0.94)' },
  purple: { accent: 'rgba(170,101,255,0.96)' },
};

export function OnboardingCinematicShell({
  children,
  contentContainerStyle,
  footer,
  headerDensity = 'regular',
  scroll = true,
  step,
  subtitle,
  title,
  tone = 'purple',
  totalSteps = 6,
}: OnboardingCinematicShellProps) {
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const compactScreen = screenHeight < 840;
  const compactHeader = headerDensity === 'compact' || compactScreen;
  const backgroundWidth = screenWidth * (compactHeader ? 1.2 : 1.3);
  const backgroundHeight = backgroundWidth / backgroundAspectRatio;
  const backgroundLeft = -(backgroundWidth - screenWidth) * 0.5;
  const progressPercent = Math.min(100, Math.max(0, (step / totalSteps) * 100));
  const toneValues = toneCopy[tone];

  const header = (
    <View style={[styles.header, compactHeader && styles.headerCompact]}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={liqiLogoMark}
        style={[styles.logoMark, compactHeader && styles.logoMarkCompact]}
      />
      <Text
        accessibilityRole="header"
        style={[styles.title, compactHeader && styles.titleCompact]}
      >
        {title}
      </Text>
      <Text style={[styles.subtitle, compactHeader && styles.subtitleCompact]}>
        {subtitle}
      </Text>
      <Text style={styles.stepLabel}>
        <Text style={{ color: toneValues.accent }}>Bước</Text> {step}/
        {totalSteps}
      </Text>
      <View style={styles.progressTrack}>
        <LinearGradient
          colors={[
            'rgba(179,82,255,0.68)',
            'rgba(165,113,255,0.58)',
            'rgba(128,156,255,0.46)',
          ]}
          end={{ x: 1, y: 0.5 }}
          start={{ x: 0, y: 0.5 }}
          style={[
            styles.progressFill,
            { width: `${progressPercent}%` as `${number}%` },
          ]}
        />
      </View>
    </View>
  );

  const body = scroll ? (
    <ScrollView
      bounces={false}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {header}
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.staticContent, contentContainerStyle]}>
      {header}
      {children}
    </View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#020613', '#030717', '#01030A']}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={profileBackground}
        style={[
          styles.backgroundImage,
          {
            height: backgroundHeight,
            left: backgroundLeft,
            opacity: compactHeader ? 0.42 : 0.48,
            width: backgroundWidth,
          },
        ]}
      />
      <LinearGradient
        colors={[
          'rgba(2,5,14,0.34)',
          'rgba(2,5,14,0.66)',
          'rgba(2,5,14,0.94)',
          '#02050E',
        ]}
        locations={[0, 0.36, 0.77, 1]}
        pointerEvents="none"
        style={[
          styles.backgroundFade,
          { top: Math.max(backgroundHeight * 0.62, 118) },
        ]}
      />
      <LinearGradient
        colors={['rgba(2,5,14,0.94)', 'rgba(2,5,14,0.47)', 'rgba(2,5,14,0.95)']}
        end={{ x: 1, y: 0.5 }}
        pointerEvents="none"
        start={{ x: 0, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        {body}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </SafeAreaView>
    </View>
  );
}

type OnboardingPrimaryButtonProps = {
  accessibilityLabel?: string;
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
  showArrow?: boolean;
  style?: StyleProp<ViewStyle>;
  tone?: ShellTone;
};

export function OnboardingPrimaryButton({
  accessibilityLabel,
  children,
  disabled,
  onPress,
  showArrow = true,
  style,
}: OnboardingPrimaryButtonProps) {
  return (
    <LiquidButton
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      glowIntensity="low"
      gradientColors={[
        'rgba(162,70,236,0.76)',
        'rgba(111,70,204,0.74)',
        'rgba(74,111,212,0.68)',
      ]}
      gradientLocations={[0, 0.46, 1]}
      onPress={onPress}
      radius={24}
      style={[styles.primaryButton, style]}
      contentStyle={styles.primaryButtonContent}
      variant="primary"
    >
      <View style={styles.primaryButtonRow}>
        {typeof children === 'string' || typeof children === 'number' ? (
          <Text style={styles.primaryButtonText}>{children}</Text>
        ) : (
          children
        )}
        {showArrow ? <Text style={styles.primaryButtonArrow}>→</Text> : null}
      </View>
    </LiquidButton>
  );
}

type OnboardingSecondaryActionProps = {
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
};

export function OnboardingSecondaryAction({
  children,
  disabled,
  onPress,
}: OnboardingSecondaryActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryAction,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.secondaryActionText}>{children}</Text>
    </Pressable>
  );
}

type OnboardingOptionRowProps = {
  disabled?: boolean;
  meta?: string;
  onPress: () => void;
  selected?: boolean;
  title: string;
  trailing?: ReactNode;
};

export function OnboardingOptionRow({
  disabled,
  meta,
  onPress,
  selected,
  title,
  trailing,
}: OnboardingOptionRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionHost,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <LiquidGlassSurface
        baseStrokeOpacity={selected ? 0.075 : 0.035}
        glowIntensity="none"
        glassIntensity="low"
        radius={18}
        surfaceBackground={
          selected ? 'rgba(20,16,42,0.34)' : 'rgba(4,8,19,0.28)'
        }
        variant="card"
        withShadow={false}
        contentStyle={styles.optionContent}
      >
        <View style={styles.optionCopy}>
          <Text style={styles.optionTitle}>{title}</Text>
          {meta ? <Text style={styles.optionMeta}>{meta}</Text> : null}
        </View>
        {trailing ? (
          <View style={styles.optionTrailing}>{trailing}</View>
        ) : null}
      </LiquidGlassSurface>
    </Pressable>
  );
}

type OnboardingSectionProps = {
  children: ReactNode;
  meta?: string;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  title: string;
};

export function OnboardingSection({
  children,
  meta,
  style,
  subtitle,
  title,
}: OnboardingSectionProps) {
  return (
    <LiquidGlassSurface
      baseStrokeOpacity={0.06}
      glowIntensity="none"
      glassIntensity="low"
      radius={24}
      surfaceBackground="rgba(5,10,24,0.40)"
      variant="card"
      withShadow={false}
      contentStyle={[styles.sectionContent, style]}
    >
      <View style={styles.sectionHead}>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.sectionSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
        {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
      </View>
      {children}
    </LiquidGlassSurface>
  );
}

type OnboardingChipProps = {
  disabled?: boolean;
  meta?: string;
  onPress: () => void;
  selected?: boolean;
  title: string;
};

export function OnboardingChip({
  disabled,
  meta,
  onPress,
  selected,
  title,
}: OnboardingChipProps) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chipHost,
        selected && styles.chipHostActive,
        disabled && !selected && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={
          selected
            ? ['rgba(142,77,225,0.16)', 'rgba(72,88,190,0.07)']
            : ['rgba(255,255,255,0.026)', 'rgba(255,255,255,0.009)']
        }
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.chipGradient}
      >
        <Text style={[styles.chipText, selected && styles.chipTextActive]}>
          {title}
        </Text>
        {meta ? <Text style={styles.chipMeta}>{meta}</Text> : null}
      </LinearGradient>
    </Pressable>
  );
}

export function OnboardingInfoCard({ children }: { children: ReactNode }) {
  return (
    <LiquidGlassSurface
      baseStrokeColor="rgba(103,232,255,0.34)"
      baseStrokeOpacity={0.08}
      glowIntensity="none"
      glassIntensity="low"
      radius={22}
      surfaceBackground="rgba(38,159,218,0.045)"
      variant="card"
      withShadow={false}
      contentStyle={styles.infoCard}
    >
      {children}
    </LiquidGlassSurface>
  );
}

const styles = StyleSheet.create({
  backgroundFade: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
  },
  chipGradient: {
    alignItems: 'center',
    borderColor: 'rgba(160,178,230,0.075)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 70,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipHost: { borderRadius: 16, overflow: 'hidden' },
  chipHostActive: {
    shadowColor: '#A65CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
  },
  chipMeta: {
    color: 'rgba(222,228,251,0.36)',
    fontSize: 9,
    fontWeight: '500',
    lineHeight: 11,
  },
  chipText: {
    color: 'rgba(248,250,255,0.72)',
    fontSize: 12.2,
    fontWeight: '500',
  },
  chipTextActive: { color: 'rgba(248,250,255,0.88)' },
  disabled: { opacity: 0.46 },
  footer: {
    paddingBottom: 26,
    paddingHorizontal: 66,
    paddingTop: 4,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  headerCompact: {
    paddingTop: 8,
  },
  infoCard: {
    borderColor: 'rgba(103,232,255,0.08)',
    borderWidth: 1,
    padding: 13,
  },
  logoMark: {
    height: 48,
    opacity: 0.96,
    width: 48,
  },
  logoMarkCompact: {
    height: 38,
    width: 38,
  },
  optionContent: {
    alignItems: 'center',
    borderColor: 'rgba(160,178,230,0.04)',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  optionCopy: { flex: 1, gap: 2 },
  optionHost: { borderRadius: 18, overflow: 'visible' },
  optionMeta: {
    color: 'rgba(222,228,251,0.36)',
    fontSize: 10.2,
    fontWeight: '400',
    lineHeight: 13.6,
  },
  optionTitle: {
    color: 'rgba(248,250,255,0.86)',
    fontSize: 13.2,
    fontWeight: '500',
    letterSpacing: -0.04,
  },
  optionTrailing: { alignItems: 'flex-end', justifyContent: 'center' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  primaryButton: {
    alignSelf: 'stretch',
  },
  primaryButtonArrow: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 20,
    fontWeight: '300',
    lineHeight: 23,
  },
  primaryButtonContent: {
    minHeight: 48,
    paddingHorizontal: 18,
  },
  primaryButtonRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15.6,
    fontWeight: '600',
    letterSpacing: -0.08,
    textAlign: 'center',
  },
  progressFill: {
    borderRadius: 999,
    height: '100%',
    shadowColor: '#A65CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  progressTrack: {
    backgroundColor: 'rgba(155,166,205,0.10)',
    borderRadius: 999,
    height: 2,
    marginTop: 7,
    overflow: 'hidden',
    width: '40%',
  },
  root: { backgroundColor: '#02050E', flex: 1 },
  safe: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 14,
    paddingHorizontal: 26,
  },
  secondaryAction: {
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 8,
    minHeight: 28,
    paddingHorizontal: 18,
    paddingVertical: 4,
  },
  secondaryActionText: {
    color: 'rgba(210,218,248,0.62)',
    fontSize: 13.1,
    fontWeight: '500',
  },
  sectionContent: {
    borderColor: 'rgba(160,178,230,0.03)',
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  sectionCopy: { flex: 1 },
  sectionHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionMeta: {
    color: 'rgba(177,126,255,0.62)',
    fontSize: 10.2,
    fontWeight: '500',
  },
  sectionSubtitle: {
    color: 'rgba(222,228,251,0.38)',
    fontSize: 10.2,
    fontWeight: '400',
    lineHeight: 13.8,
    marginTop: 3,
  },
  sectionTitle: {
    color: 'rgba(248,250,255,0.86)',
    fontSize: 13.2,
    fontWeight: '500',
    letterSpacing: -0.04,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: 24,
  },
  stepLabel: {
    color: 'rgba(238,241,255,0.50)',
    fontSize: 10.4,
    fontWeight: '500',
    marginTop: 9,
  },
  subtitle: {
    color: 'rgba(223,229,251,0.46)',
    fontSize: 12.8,
    fontWeight: '400',
    lineHeight: 18.5,
    marginTop: 8,
    maxWidth: 288,
    textAlign: 'center',
  },
  subtitleCompact: {
    fontSize: 11.8,
    lineHeight: 16.8,
    maxWidth: 278,
  },
  title: {
    color: 'rgba(248,250,255,0.94)',
    fontSize: 29.2,
    fontWeight: '700',
    letterSpacing: -0.44,
    lineHeight: 34,
    marginTop: 15,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.36)',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 8,
  },
  titleCompact: {
    fontSize: 22.2,
    lineHeight: 27,
    marginTop: 11,
  },
});
