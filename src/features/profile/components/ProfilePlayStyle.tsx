import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  liqiColors,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import {
  ProfilePill,
  ProfileSurface,
  type ProfilePillTone,
} from './ProfilePresentationPrimitives';
import { ProfileSectionHeader } from './ProfileSectionHeader';
import { ProfileText } from './ProfileShared';

export function ProfilePlayStyle({
  compact,
  style,
  tags,
}: {
  compact: boolean;
  style?: StyleProp<ViewStyle>;
  tags: string[];
}) {
  const visibleTags = buildVisibleTags(tags).slice(0, 4);

  return (
    <ProfileSurface compact={compact} style={[styles.frame, style]}>
      <ProfileSectionHeader
        compact={compact}
        title="Sở thích"
        withChevron={false}
      />
      {visibleTags.length ? (
        <View style={styles.pillGrid}>
          {visibleTags.map((tag, index) => (
            <ProfilePill
              icon={iconForTag(tag)}
              key={`${tag}-${index}`}
              label={tag}
              style={styles.pill}
              tone={toneForTag(tag, index)}
            />
          ))}
        </View>
      ) : (
        <ProfileText style={styles.emptyText}>
          Chưa cập nhật sở thích.
        </ProfileText>
      )}
    </ProfileSurface>
  );
}

function buildVisibleTags(tags: string[]) {
  const normalized = tags.map(normalizeTag).filter(Boolean);
  const unique = Array.from(new Set(normalized));
  const preferred = ['Cân bằng', 'Mic on', 'Buổi tối', 'Rank', 'Teamplay'];
  return [
    ...preferred.filter((tag) => unique.includes(tag)),
    ...unique.filter((tag) => !preferred.includes(tag)),
  ].slice(0, 4);
}

function normalizeTag(tag: string) {
  const lower = tag.toLowerCase();
  if (lower.includes('cân') || lower.includes('can bang')) return 'Cân bằng';
  if (lower.includes('mic') || lower.includes('voice')) return 'Mic on';
  if (lower.includes('tối') || lower.includes('toi')) return 'Buổi tối';
  if (lower.includes('rank')) return 'Rank';
  if (
    lower.includes('team') ||
    lower.includes('phối') ||
    lower.includes('phoi')
  )
    return 'Teamplay';
  if (lower.includes('ping') || lower.includes('chat')) return 'Ping/chat';
  if (lower.includes('toxic')) return 'Không toxic';
  return tag.length > 14 ? `${tag.slice(0, 12)}…` : tag;
}

function toneForTag(tag: string, index: number): ProfilePillTone {
  const lower = tag.toLowerCase();
  if (lower.includes('rank')) return 'amber';
  if (lower.includes('mic')) return 'cyan';
  if (lower.includes('tối')) return 'purple';
  if (lower.includes('toxic')) return 'pink';
  return index % 2 === 0 ? 'purple' : 'neutral';
}

function iconForTag(tag: string): keyof typeof Ionicons.glyphMap {
  const lower = tag.toLowerCase();
  if (lower.includes('mic')) return 'mic-outline';
  if (lower.includes('tối')) return 'moon-outline';
  if (lower.includes('rank')) return 'trophy-outline';
  if (lower.includes('team')) return 'people-outline';
  if (lower.includes('toxic')) return 'happy-outline';
  return 'game-controller-outline';
}

const styles = StyleSheet.create({
  emptyText: {
    ...liqiTypography.caption,
    color: liqiColors.text.muted,
    marginTop: liqiSpacing.xl,
  },
  frame: { flex: 1, minHeight: 154, minWidth: 0 },
  pill: {
    flexBasis: '46%',
    flexGrow: 1,
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: liqiSpacing.md,
    marginTop: liqiSpacing.xl,
  },
});
