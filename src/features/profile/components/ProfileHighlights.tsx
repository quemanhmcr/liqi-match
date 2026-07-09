import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';

import {
  LiquidBadge,
  LiquidCard,
  LiquidOrbButton,
} from '@/shared/components/liquid';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import { profileMockReviews, type ProfileMockReview } from '../profile.mock';
import { ProfileSectionHeader } from './ProfileSectionHeader';
import { ProfileText } from './ProfileShared';

const reviewAvatarMinhAnh =
  require('../../../../assets/anh_mau_3/avatar_minh_anh_support.png') as ImageSourcePropType;
const reviewAvatars = [
  reviewAvatarMinhAnh,
  require('../../../../assets/anh_mau_3/avatar_khoa_jungle_assassin.png') as ImageSourcePropType,
];

export function ProfileHighlights({ mode }: { mode: 'self' | 'other' }) {
  const icon =
    mode === 'self' ? 'sparkles-outline' : 'chatbubble-ellipses-outline';

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
      surfaceBackground="rgba(8,12,28,0.38)"
      withInnerReflection
      withShadow={false}
    >
      <ProfileSectionHeader icon={icon} title="Nhận xét nổi bật" />
      <View style={styles.rows}>
        {profileMockReviews.map((row, index) => (
          <HighlightRow
            avatar={
              reviewAvatars[index % reviewAvatars.length] ?? reviewAvatarMinhAnh
            }
            index={index}
            key={row.author}
            row={row}
          />
        ))}
      </View>
    </LiquidCard>
  );
}

function HighlightRow({
  avatar,
  index,
  row,
}: {
  avatar: ImageSourcePropType;
  index: number;
  row: ProfileMockReview;
}) {
  return (
    <View style={styles.row}>
      <LinearGradient
        colors={['rgba(106,101,255,0.46)', 'rgba(103,232,255,0.34)']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.avatarRing}
      >
        <Image source={avatar} style={styles.avatar} />
      </LinearGradient>
      <View style={styles.copy}>
        <View style={styles.authorRow}>
          <ProfileText numberOfLines={1} style={styles.rowTitle}>
            {row.author}
          </ProfileText>
          <LiquidBadge size="sm" variant="cyan" style={styles.checkBadge}>
            ✓
          </LiquidBadge>
        </View>
        <ProfileText numberOfLines={1} style={styles.rowBody}>
          {row.body}
        </ProfileText>
      </View>
      <LiquidOrbButton
        accessibilityLabel={`Thích nhận xét ${index + 1}`}
        glassIntensity="low"
        glowIntensity="low"
        size={33}
        style={styles.likeButton}
      >
        <Ionicons
          color="rgba(185,239,255,0.84)"
          name="thumbs-up-outline"
          size={16}
        />
      </LiquidOrbButton>
    </View>
  );
}

const styles = StyleSheet.create({
  authorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minWidth: 0,
  },
  avatar: {
    borderRadius: 17,
    height: 34,
    width: 34,
  },
  avatarRing: {
    alignItems: 'center',
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  checkBadge: {
    borderRadius: 999,
    flexShrink: 0,
    height: 16,
    minWidth: 16,
    paddingHorizontal: 4,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  likeButton: {
    flexShrink: 0,
  },
  row: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.032)',
    borderColor: 'rgba(255,255,255,0.075)',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 9,
    minHeight: 49,
    overflow: 'visible',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  rowBody: {
    color: liquidColors.text.secondary,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 1,
  },
  rows: {
    gap: 7,
    marginTop: 10,
  },
  rowTitle: {
    ...liquidTypography.chip,
    color: liquidColors.text.primary,
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  sectionFrame: {
    marginTop: 10,
  },
  sectionSurface: {
    borderRadius: 25,
    padding: 12,
  },
});
