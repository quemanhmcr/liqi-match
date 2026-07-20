import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { LiqiBadge, LiqiCard } from '@/shared/components/liqi';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';
import { liqiColors } from '@/shared/theme/liqi-design-system';

export type FeatureStageScreenProps = {
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
};

/** A consistent owned-state screen while a product tab is implemented. */
export function FeatureStageScreen({
  body,
  icon,
  title,
}: FeatureStageScreenProps) {
  return (
    <LiqiScreen subtitle="Không gian riêng cho feature này" title={title}>
      <LiqiCard style={styles.card} variant="purple">
        <View style={styles.iconWrap}>
          <Ionicons color="#CFA8FF" name={icon} size={28} />
        </View>
        <LiqiBadge size="sm" variant="pink">
          ĐANG PHÁT TRIỂN
        </LiqiBadge>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
      </LiqiCard>
    </LiqiScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: 'rgba(220,226,248,0.62)',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    textAlign: 'center',
  },
  card: { alignItems: 'center', marginTop: 26, padding: 24 },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(179,115,255,0.12)',
    borderRadius: 999,
    height: 64,
    justifyContent: 'center',
    marginBottom: 16,
    width: 64,
  },
  title: {
    color: liqiColors.text.primary,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 13,
  },
});
