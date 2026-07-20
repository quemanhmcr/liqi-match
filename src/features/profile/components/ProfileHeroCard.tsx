import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View } from 'react-native';

import { useAssetResolver } from '@/entities/media-asset';
import {
  liqiColors,
  liqiComponentColors,
  liqiComponentGradients,
  liqiComponents,
  liqiRadius,
  liqiShadow,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

import { resolveProfileMedia } from '../model/profile-media';
import type { ProfileViewModel } from '../services/profile-service';
import {
  ProfileActionButton,
  ProfilePill,
  type ProfilePillTone,
} from './ProfilePresentationPrimitives';
import { ProfileText } from './ProfileShared';

const profileHeroArtwork = require('../../../../assets/anh_mau_4/background-chon-ho-so.png');

export type ProfileHeroMode = 'self' | 'other';

export type ProfileHeroCardProps = {
  compact: boolean;
  inviteDisabled?: boolean;
  messageDisabled?: boolean;
  mode: ProfileHeroMode;
  onInvite?: () => void;
  onMessage?: () => void;
  profile: ProfileViewModel;
};

export function ProfileHeroCard({
  compact,
  inviteDisabled = false,
  messageDisabled = false,
  mode,
  onInvite,
  onMessage,
  profile,
}: ProfileHeroCardProps) {
  const assetResolver = useAssetResolver();
  const avatarMedia = resolveProfileMedia(assetResolver, {
    assetKey: profile.avatarAssetKey,
    uri: profile.avatarUrl ?? profile.avatarFallbackUrl,
  });
  const avatarSize = compact
    ? liqiComponents.profile.hero.avatarCompact
    : liqiComponents.profile.hero.avatar;
  const meta = [
    genderLabel(profile.gender),
    profile.rankName,
    profile.region,
  ].filter(Boolean);
  const tags = profileTags(profile);

  return (
    <View
      style={[styles.hero, compact && styles.heroCompact]}
      testID="profile-identity-hero"
    >
      <Image
        accessibilityLabel="Không gian fantasy của hồ sơ LiQi"
        resizeMode="cover"
        source={profileHeroArtwork}
        style={styles.coverImage}
      />
      <View pointerEvents="none" style={styles.coverNeutralizer} />
      <LinearGradient
        colors={liqiComponentGradients.profile.heroCover}
        end={{ x: 1, y: 0.48 }}
        locations={[0, 0.38, 0.72, 1]}
        pointerEvents="none"
        start={{ x: 0, y: 0.48 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={liqiComponentGradients.profile.heroBottom}
        locations={[0.28, 0.68, 1]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, compact && styles.contentCompact]}>
        <View
          style={[styles.identityRow, compact && styles.identityRowCompact]}
        >
          <View
            style={[
              styles.avatarColumn,
              { width: avatarSize + liqiSpacing.md },
            ]}
          >
            <LinearGradient
              colors={liqiComponentGradients.profile.avatarRing}
              style={[
                styles.avatarRing,
                {
                  borderRadius: avatarSize / 2,
                  height: avatarSize,
                  width: avatarSize,
                },
              ]}
            >
              {avatarMedia.source ? (
                <Image
                  accessibilityLabel={`Avatar ${profile.displayName}`}
                  resizeMode="cover"
                  source={avatarMedia.source}
                  style={{
                    borderRadius: avatarSize / 2 - 3,
                    height: avatarSize - 6,
                    width: avatarSize - 6,
                  }}
                />
              ) : (
                <View
                  accessibilityLabel={`Avatar hồ sơ ${avatarMedia.state}`}
                  style={[
                    styles.avatarFallback,
                    {
                      borderRadius: avatarSize / 2 - 3,
                      height: avatarSize - 6,
                      width: avatarSize - 6,
                    },
                  ]}
                >
                  <ProfileText style={styles.avatarInitials}>
                    {profile.displayName.trim().charAt(0).toUpperCase() || 'L'}
                  </ProfileText>
                </View>
              )}
            </LinearGradient>
            <View
              style={[
                styles.presenceDot,
                {
                  backgroundColor: profileStatusColor(profile.statusValue),
                  top: avatarSize - 22,
                },
              ]}
            />
            <View style={styles.statusPill}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: profileStatusColor(profile.statusValue) },
                ]}
              />
              <ProfileText numberOfLines={1} style={styles.statusText}>
                {profile.statusLabel}
              </ProfileText>
            </View>
          </View>

          <View style={styles.copyColumn}>
            <View style={styles.nameRow}>
              <ProfileText
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                numberOfLines={1}
                style={[styles.name, compact && styles.nameCompact]}
              >
                {profile.displayName}
              </ProfileText>
              {profile.verified ? (
                <Ionicons
                  accessibilityLabel="Hồ sơ đã xác minh"
                  color={liqiColors.accent.purpleIcon}
                  name="checkmark-circle"
                  size={18}
                />
              ) : null}
            </View>
            {meta.length ? (
              <ProfileText numberOfLines={1} style={styles.meta}>
                {meta.join(' · ')}
              </ProfileText>
            ) : null}
            <ProfileText numberOfLines={2} style={styles.bio}>
              {profile.bio}
            </ProfileText>
            <View style={styles.tagRow}>
              {tags.map((tag, index) => (
                <ProfilePill
                  icon={tagIcon(index)}
                  key={`${tag.label}-${index}`}
                  label={tag.label}
                  tone={tag.tone}
                />
              ))}
            </View>
          </View>
        </View>

        {mode === 'other' ? (
          <View style={styles.actionRow}>
            <ProfileActionButton
              disabled={messageDisabled}
              icon="chatbubble-ellipses-outline"
              label="Nhắn tin"
              onPress={onMessage}
              style={styles.actionButton}
              variant="secondary"
            />
            <ProfileActionButton
              disabled={inviteDisabled}
              icon="people-outline"
              label="Mời vào set"
              onPress={onInvite}
              style={styles.actionButton}
              variant="primary"
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function profileStatusColor(status: ProfileViewModel['statusValue']) {
  switch (status) {
    case 'ready':
      return liqiColors.status.online;
    case 'busy':
      return liqiColors.status.warning;
    case 'friends':
      return liqiColors.accent.purple;
    case 'offline':
      return liqiColors.text.disabled;
  }
}

function genderLabel(gender: ProfileViewModel['gender']) {
  if (gender === 'female') return 'Nữ';
  if (gender === 'male') return 'Nam';
  return undefined;
}

function profileTags(profile: ProfileViewModel) {
  const values: { label?: string; tone: ProfilePillTone }[] = [
    { label: profile.roleNames[0], tone: 'purple' },
    { label: profile.rankName, tone: 'amber' },
    { label: profile.playStyleTags[0], tone: 'cyan' },
  ];
  return values
    .filter((value): value is { label: string; tone: ProfilePillTone } =>
      Boolean(value.label?.trim()),
    )
    .slice(0, 3);
}

function tagIcon(index: number): keyof typeof Ionicons.glyphMap {
  if (index === 1) return 'trophy';
  if (index === 2) return 'happy-outline';
  return 'heart-circle-outline';
}

const styles = StyleSheet.create({
  actionButton: { flex: 1, minWidth: 0 },
  actionRow: {
    flexDirection: 'row',
    gap: liqiSpacing.lg,
    marginTop: liqiSpacing.xl,
  },
  avatarColumn: {
    alignItems: 'center',
    flexShrink: 0,
    position: 'relative',
  },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.profile.avatarFallback,
    justifyContent: 'center',
  },
  avatarInitials: {
    ...liqiTypography.screenTitle,
    color: liqiColors.text.primary,
  },
  avatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  bio: {
    ...liqiTypography.body,
    color: liqiColors.text.secondary,
    marginTop: liqiSpacing.xl,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: liqiSpacing['4xl'],
    position: 'relative',
    zIndex: 2,
  },
  contentCompact: { padding: liqiSpacing['2xl'] },
  copyColumn: {
    flex: 1,
    minWidth: 0,
    paddingTop: liqiSpacing.sm,
  },
  coverImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  coverNeutralizer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: liqiComponentColors.profile.heroOverlay,
  },
  hero: {
    ...liqiShadow.card,
    backgroundColor: liqiComponentColors.profile.surfaceStrong,
    borderColor: liqiComponentColors.profile.heroStroke,
    borderRadius: liqiComponents.profile.hero.radius,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: liqiComponents.profile.hero.minHeight,
    overflow: 'hidden',
  },
  heroCompact: { minHeight: liqiComponents.profile.hero.minHeightCompact },
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing['4xl'],
  },
  identityRowCompact: { gap: liqiSpacing.xl },
  meta: {
    ...liqiTypography.subtitle,
    color: liqiColors.text.tertiary,
    marginTop: liqiSpacing.xs,
  },
  name: {
    ...liqiTypography.screenTitle,
    color: liqiColors.text.onAccent,
    flexShrink: 1,
  },
  nameCompact: { fontSize: 23, lineHeight: 28 },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: liqiSpacing.sm,
    minWidth: 0,
  },
  presenceDot: {
    borderColor: liqiComponentColors.profile.onlineFrame,
    borderRadius: liqiRadius.pill,
    borderWidth: 2,
    height: 17,
    position: 'absolute',
    right: liqiSpacing.md,
    width: 17,
  },
  statusDot: {
    borderRadius: liqiRadius.pill,
    height: 7,
    width: 7,
  },
  statusPill: {
    alignItems: 'center',
    backgroundColor: liqiComponentColors.profile.actions.secondary.background,
    borderColor: liqiComponentColors.profile.actions.secondary.border,
    borderRadius: liqiRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: liqiSpacing.sm,
    marginTop: -liqiSpacing.md,
    maxWidth: '100%',
    minHeight: 28,
    paddingHorizontal: liqiSpacing.lg,
  },
  statusText: {
    ...liqiTypography.caption,
    color: liqiColors.text.secondary,
    fontWeight: '700',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: liqiSpacing.sm,
    marginTop: liqiSpacing.xl,
  },
});
