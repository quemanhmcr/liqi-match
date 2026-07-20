import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import {
  LiqiBadge,
  LiqiBottomNav,
  LiqiButton,
  LiqiCard,
  LiqiChip,
  LiqiOrbButton,
  LiqiSectionHeader,
} from '@/shared/components/liqi';
import { LiqiScreen } from '@/shared/layouts/LiqiScreen';
import { liqiColors, liqiTypography } from '@/shared/theme/liqi-design-system';

const playgroundTabs = [
  { icon: 'home', key: 'home', label: 'Home' },
  { icon: 'compass-outline', key: 'explore', label: 'Explore' },
  { icon: 'chatbubble-ellipses-outline', key: 'messages', label: 'Messages' },
  { icon: 'person-outline', key: 'profile', label: 'Profile' },
] as const;

export default function DesignSystemPlayground() {
  return (
    <LiqiScreen
      bottomSlot={
        <LiqiBottomNav
          activeKey="home"
          items={playgroundTabs}
          renderIcon={(tab, active) => (
            <Ionicons
              color={
                active ? liqiColors.text.primary : liqiColors.icon.inactive
              }
              name={tab.icon}
              size={active ? 20 : 19}
            />
          )}
        />
      }
      subtitle="Token semantic và component chuẩn hóa từ Trang Chủ."
      title="LiQi Design System"
    >
      <LiqiSectionHeader label="BUTTONS" title="CTA hierarchy" />
      <View style={styles.rowWrap}>
        <LiqiButton variant="primary">Primary</LiqiButton>
        <LiqiButton variant="secondary">Secondary</LiqiButton>
        <LiqiButton variant="rank">Rank</LiqiButton>
        <LiqiButton variant="team">Team</LiqiButton>
        <LiqiButton variant="ghost">Ghost</LiqiButton>
      </View>

      <LiqiSectionHeader label="CHIPS" title="Filters and tags" />
      <View style={styles.rowWrap}>
        <LiqiChip selected>Selected</LiqiChip>
        <LiqiChip>Default</LiqiChip>
        <LiqiChip variant="purple">Purple</LiqiChip>
        <LiqiChip variant="cyan">Cyan</LiqiChip>
        <LiqiChip variant="orange">Orange</LiqiChip>
        <LiqiChip density="tag" variant="purple">
          Aya
        </LiqiChip>
      </View>

      <LiqiSectionHeader label="CARDS" title="Surfaces and density" />
      <View style={styles.cardStack}>
        <LiqiCard variant="purple">
          <Text style={styles.cardTitle}>Purple matched card</Text>
          <Text style={styles.body}>Social, tri kỉ hoặc matched context.</Text>
        </LiqiCard>
        <LiqiCard variant="cyan">
          <Text style={styles.cardTitle}>Cyan rank card</Text>
          <Text style={styles.body}>
            Rank, online hoặc competitive context.
          </Text>
        </LiqiCard>
        <LiqiCard density="list" emphasis="low" variant="orange">
          <Text style={styles.cardTitle}>List row card</Text>
          <Text style={styles.body}>
            Dùng cho thread/settings row hiệu năng nhẹ.
          </Text>
        </LiqiCard>
      </View>

      <LiqiSectionHeader label="BADGES / ORBS" title="Small system elements" />
      <View style={styles.rowWrap}>
        <LiqiBadge>1</LiqiBadge>
        <LiqiBadge variant="cyan">8</LiqiBadge>
        <LiqiBadge variant="orange" size="sm">
          3
        </LiqiBadge>
        <LiqiOrbButton accessibilityLabel="Demo orb" size={52}>
          <Ionicons
            color={liqiColors.text.primary}
            name="notifications-outline"
            size={21}
          />
        </LiqiOrbButton>
      </View>

      <LiqiSectionHeader label="SURFACES" title="Low-emphasis examples" />
      <View style={styles.cardStack}>
        <LiqiCard density="list" emphasis="none" surfaceTone="low">
          <Text style={styles.cardTitle}>Low-emphasis surface</Text>
          <Text style={styles.body}>
            Bề mặt tối rõ ràng, viền nhẹ và độ tương phản ổn định.
          </Text>
        </LiqiCard>
      </View>
    </LiqiScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    ...liqiTypography.body,
    marginTop: 6,
  },
  cardStack: {
    gap: 12,
    marginTop: 12,
  },
  cardTitle: {
    ...liqiTypography.cardTitle,
  },
  rowWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
});
