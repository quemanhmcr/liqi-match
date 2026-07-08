import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { LiquidCard, LiquidChip } from '@/shared/components/liquid';

import { ProfileSectionHeader } from './ProfileSectionHeader';

export function ProfilePlayStyle({ tags }: { tags: string[] }) {
  const visibleTags = buildVisibleTags(tags);

  return (
    <LiquidCard
      baseStrokeColor="rgba(103,232,255,0.16)"
      baseStrokeOpacity={0.075}
      blurIntensity={28}
      contentStyle={styles.sectionSurface}
      density="regular"
      frameColors={[
        'rgba(106,101,255,0.13)',
        'rgba(255,255,255,0.030)',
        'rgba(103,232,255,0.12)',
      ]}
      glassIntensity="low"
      glowIntensity="low"
      radius={26}
      style={styles.sectionFrame}
      surfaceBackground="rgba(8,12,28,0.37)"
      withInnerReflection
      withShadow={false}
    >
      <ProfileSectionHeader icon="radio-button-on-outline" title="Phong cách chơi" withChevron={false} />
      <View style={styles.chipWrap}>
        {visibleTags.map((tag, index) => (
          <LiquidChip
            contentStyle={styles.chip}
            density="compact"
            icon={<Ionicons color={iconColor(index)} name={iconForTag(tag)} size={12} />}
            key={`${tag}-${index}`}
            selected={index === 0}
            textStyle={styles.chipText}
            variant={index === 0 ? 'selected' : index === 3 ? 'cyan' : 'purple'}
          >
            {tag}
          </LiquidChip>
        ))}
      </View>
    </LiquidCard>
  );
}

function buildVisibleTags(tags: string[]) {
  const normalized = tags.map(normalizeTag).filter(Boolean);
  const unique = Array.from(new Set(normalized));
  const preferred = ['Cân bằng', 'Mic on', 'Buổi tối', 'Rank', 'Teamplay'];
  const ordered = [
    ...preferred.filter((tag) => unique.includes(tag)),
    ...unique.filter((tag) => !preferred.includes(tag)),
  ];
  return ordered.slice(0, 5);
}

function normalizeTag(tag: string) {
  const lower = tag.toLowerCase();
  if (lower.includes('cân') || lower.includes('can bang')) return 'Cân bằng';
  if (lower.includes('mic') || lower.includes('voice')) return 'Mic on';
  if (lower.includes('tối') || lower.includes('toi')) return 'Buổi tối';
  if (lower.includes('rank')) return 'Rank';
  if (lower.includes('team') || lower.includes('phối') || lower.includes('phoi')) return 'Teamplay';
  if (lower.includes('ping') || lower.includes('chat')) return 'Ping/chat';
  if (lower.includes('toxic')) return 'Không toxic';
  return tag.length > 12 ? `${tag.slice(0, 10)}…` : tag;
}

function iconColor(index: number) {
  return index === 0 ? 'rgba(194,205,255,0.78)' : 'rgba(185,239,255,0.58)';
}

function iconForTag(tag: string): keyof typeof Ionicons.glyphMap {
  const lower = tag.toLowerCase();
  if (lower.includes('mic') || lower.includes('voice')) return 'mic-outline';
  if (lower.includes('tối')) return 'moon-outline';
  if (lower.includes('team') || lower.includes('phối')) return 'people-outline';
  if (lower.includes('toxic')) return 'happy-outline';
  return 'disc-outline';
}


const styles = StyleSheet.create({
  chip: {
    minHeight: 27,
    paddingHorizontal: 8,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.02,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  sectionFrame: {
    marginTop: 10,
  },
  sectionSurface: {
    borderRadius: 25,
    padding: 12,
  },
});
