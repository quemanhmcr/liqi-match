import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import {
  LiquidBadge,
  LiquidBottomNav,
  LiquidButton,
  LiquidCard,
  LiquidChip,
  LiquidOrbButton,
  LiquidSectionHeader,
} from '@/shared/components/liquid';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

const playgroundTabs = [
  { icon: 'home', key: 'home', label: 'Home' },
  { icon: 'compass-outline', key: 'explore', label: 'Explore' },
  { icon: 'chatbubble-ellipses-outline', key: 'messages', label: 'Messages' },
  { icon: 'person-outline', key: 'profile', label: 'Profile' },
] as const;

export default function LiquidSystemPlayground() {
  return (
    <LiquidScreen
      bottomSlot={
        <LiquidBottomNav
          activeKey="home"
          items={playgroundTabs}
          renderIcon={(tab, active) => (
            <Ionicons
              color={active ? liquidColors.text.primary : '#A8AFC6'}
              name={tab.icon}
              size={active ? 20 : 19}
            />
          )}
        />
      }
      subtitle="Token, preset và shared component dùng cho toàn app."
      title="Liquid System"
    >
      <LiquidSectionHeader label="BUTTONS" title="CTA hierarchy" />
      <View style={styles.rowWrap}>
        <LiquidButton variant="primary">Primary</LiquidButton>
        <LiquidButton variant="secondary">Secondary</LiquidButton>
        <LiquidButton variant="rank">Rank</LiquidButton>
        <LiquidButton variant="team">Team</LiquidButton>
        <LiquidButton variant="ghost">Ghost</LiquidButton>
      </View>

      <LiquidSectionHeader label="CHIPS" title="Filters and tags" />
      <View style={styles.rowWrap}>
        <LiquidChip selected>Selected</LiquidChip>
        <LiquidChip>Default</LiquidChip>
        <LiquidChip variant="purple">Purple</LiquidChip>
        <LiquidChip variant="cyan">Cyan</LiquidChip>
        <LiquidChip variant="orange">Orange</LiquidChip>
        <LiquidChip density="tag" variant="purple">
          Aya
        </LiquidChip>
      </View>

      <LiquidSectionHeader label="CARDS" title="Surfaces and density" />
      <View style={styles.cardStack}>
        <LiquidCard variant="purple">
          <Text style={styles.cardTitle}>Purple matched card</Text>
          <Text style={styles.body}>Social, tri kỉ hoặc matched context.</Text>
        </LiquidCard>
        <LiquidCard variant="cyan">
          <Text style={styles.cardTitle}>Cyan rank card</Text>
          <Text style={styles.body}>
            Rank, online hoặc competitive context.
          </Text>
        </LiquidCard>
        <LiquidCard density="list" glowIntensity="low" variant="orange">
          <Text style={styles.cardTitle}>List row card</Text>
          <Text style={styles.body}>
            Dùng cho thread/settings row hiệu năng nhẹ.
          </Text>
        </LiquidCard>
      </View>

      <LiquidSectionHeader
        label="BADGES / ORBS"
        title="Small system elements"
      />
      <View style={styles.rowWrap}>
        <LiquidBadge>1</LiquidBadge>
        <LiquidBadge variant="cyan">8</LiquidBadge>
        <LiquidBadge variant="orange" size="sm">
          3
        </LiquidBadge>
        <LiquidOrbButton accessibilityLabel="Demo orb" size={52}>
          <Ionicons
            color={liquidColors.text.primary}
            name="notifications-outline"
            size={21}
          />
        </LiquidOrbButton>
      </View>

      <LiquidSectionHeader label="FALLBACK" title="Reduced glass examples" />
      <View style={styles.cardStack}>
        <LiquidCard density="list" glowIntensity="none" reducedGlass>
          <Text style={styles.cardTitle}>Reduced transparency row</Text>
          <Text style={styles.body}>
            Ít blur, không glow, contrast giữ an toàn.
          </Text>
        </LiquidCard>
      </View>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    ...liquidTypography.body,
    marginTop: 6,
  },
  cardStack: {
    gap: 12,
    marginTop: 12,
  },
  cardTitle: {
    ...liquidTypography.cardTitle,
  },
  rowWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
});
