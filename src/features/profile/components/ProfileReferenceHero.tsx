import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { useAssetResolver } from '@/entities/media-asset';
import {
  AppButton,
  AppChip,
  AppIconButton,
  AppText,
  appColors,
  appRadii,
  appSpacing,
} from '@/shared/ui';

import { resolveProfileMedia } from '../model/profile-media';
import {
  presentProfileBio,
  presentProfileHeroTags,
  profileMetaLine,
} from '../model/profile-surface-presenter';
import type { ProfileViewModel } from '../services/profile-service';
import { profileUi } from '../ui/profile-ui';

export type ProfileHeroMode = 'self' | 'other';

export function ProfileReferenceHero({
  compact,
  inviteDisabled,
  messageDisabled,
  mode,
  onBack,
  onEdit,
  onInvite,
  onMessage,
  onMore,
  onSettings,
  onShare,
  profile,
}: Readonly<{
  compact: boolean;
  inviteDisabled: boolean;
  messageDisabled: boolean;
  mode: ProfileHeroMode;
  onBack: () => void;
  onEdit?: () => void;
  onInvite: () => void;
  onMessage: () => void;
  onMore: () => void;
  onSettings?: () => void;
  onShare?: () => void;
  profile: ProfileViewModel;
}>) {
  const resolver = useAssetResolver();
  const cover = resolveProfileMedia(resolver, {
    assetKey: profile.coverAssetKey,
    uri: profile.coverUrl,
  });
  const avatar = resolveProfileMedia(resolver, {
    assetKey: profile.avatarAssetKey,
    uri: profile.avatarUrl ?? profile.avatarFallbackUrl,
  });
  const avatarSize = compact
    ? profileUi.hero.avatarCompact
    : profileUi.hero.avatar;
  const meta = profileMetaLine(profile);
  const heroTags = presentProfileHeroTags(profile);
  const actions =
    mode === 'other' ? (
      <View style={[styles.actionColumn, compact && styles.actionRowCompact]}>
        <HeroButton
          compact={compact}
          disabled={messageDisabled}
          icon="chatbubble-ellipses"
          label="Nhắn tin"
          onPress={onMessage}
          primary
        />
        <HeroButton
          compact={compact}
          disabled={inviteDisabled}
          icon="people-outline"
          label="Mời vào Phòng"
          onPress={onInvite}
        />
      </View>
    ) : onEdit || onShare ? (
      <View style={[styles.actionColumn, compact && styles.actionRowCompact]}>
        {onEdit ? (
          <HeroButton
            compact={compact}
            icon="create-outline"
            label="Chỉnh sửa"
            onPress={onEdit}
            primary
          />
        ) : null}
        {onShare ? (
          <HeroButton
            compact={compact}
            icon="share-social-outline"
            label="Chia sẻ"
            onPress={onShare}
          />
        ) : null}
      </View>
    ) : null;
  const bio = (
    <AppText
      numberOfLines={2}
      testID="profile-hero-bio"
      tone="secondary"
      variant={compact ? 'bodySmall' : 'body'}
    >
      {presentProfileBio(profile.bio)}
    </AppText>
  );
  const chips = (
    <View style={styles.chipRow}>
      <AppChip
        density="tag"
        icon={<Ionicons color={appColors.accent.pink} name="heart" size={13} />}
        variant="purple"
        withSheen={false}
      >
        {heroTags.playStyle}
      </AppChip>
      <AppChip
        density="tag"
        icon={
          <View
            style={[
              styles.statusDot,
              { backgroundColor: statusColor(profile.statusValue) },
            ]}
          />
        }
        variant="default"
        withSheen={false}
      >
        {profile.statusLabel}
      </AppChip>
      {heroTags.availability ? (
        <AppChip
          accessibilityLabel={`Lịch chơi ${heroTags.availability}`}
          density="tag"
          icon={
            <Ionicons
              color={appColors.accent.cyan}
              name="calendar-outline"
              size={13}
            />
          }
          variant="cyan"
          withSheen={false}
        >
          {heroTags.availability}
        </AppChip>
      ) : null}
      {heroTags.favoriteHero ? (
        <AppChip
          accessibilityLabel={`Tướng tủ ${heroTags.favoriteHero}`}
          density="tag"
          icon={
            <Ionicons
              color={appColors.accent.amber}
              name="game-controller-outline"
              size={13}
            />
          }
          variant="orange"
          withSheen={false}
        >
          {heroTags.favoriteHero}
        </AppChip>
      ) : null}
    </View>
  );

  return (
    <View testID="profile-identity-header">
      <View
        style={[
          styles.cover,
          {
            height: compact
              ? profileUi.hero.coverHeightCompact
              : profileUi.hero.coverHeight,
          },
        ]}
        testID="profile-hero-cover"
      >
        <ProfileCover media={cover} profileName={profile.displayName} />
        <LinearGradient
          colors={profileUi.gradients.coverBottom}
          locations={[0, 0.62, 1]}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[styles.navigationRow, compact && styles.navigationRowCompact]}
        >
          {mode === 'other' ? (
            <HeroIconButton
              accessibilityLabel="Quay lại"
              icon="chevron-back"
              compact={compact}
              onPress={onBack}
            />
          ) : (
            <View style={styles.navigationSpacer} />
          )}
          {mode === 'other' ? (
            <HeroIconButton
              accessibilityLabel="Tùy chọn hồ sơ"
              compact={compact}
              icon="ellipsis-horizontal"
              onPress={onMore}
            />
          ) : onSettings ? (
            <HeroIconButton
              accessibilityLabel="Cài đặt hồ sơ"
              compact={compact}
              icon="settings-outline"
              onPress={onSettings}
            />
          ) : (
            <View style={styles.navigationSpacer} />
          )}
        </View>
      </View>

      <View
        style={[
          styles.identitySurface,
          compact && styles.identitySurfaceCompact,
        ]}
        testID="profile-identity-hero"
      >
        <View
          style={[styles.identityRow, compact && styles.identityRowCompact]}
        >
          <ProfileAvatar
            avatar={avatar}
            compact={compact}
            displayName={profile.displayName}
            online={profile.statusValue === 'ready'}
            size={avatarSize}
          />
          <View
            style={[styles.identityCopy, compact && styles.identityCopyCompact]}
          >
            <View style={styles.nameRow}>
              <AppText
                adjustsFontSizeToFit
                compact={compact}
                minimumFontScale={0.76}
                numberOfLines={1}
                style={styles.displayName}
                testID="profile-hero-display-name"
                variant={compact ? 'h1' : 'display'}
              >
                {profile.displayName}
              </AppText>
              {profile.verified ? (
                <Ionicons
                  accessibilityLabel="Hồ sơ đã xác minh"
                  color={appColors.accent.purpleIcon}
                  name="planet"
                  size={20}
                  style={styles.verifiedBadge}
                  testID="profile-hero-verified-badge"
                />
              ) : null}
            </View>
            {meta ? (
              <AppText numberOfLines={1} tone="tertiary" variant="caption">
                {meta}
              </AppText>
            ) : null}
            {!compact ? bio : null}
            {!compact ? chips : null}
          </View>
          {!compact ? actions : null}
        </View>
        {compact ? (
          <View
            style={styles.compactDetails}
            testID="profile-hero-compact-details"
          >
            {bio}
            {chips}
          </View>
        ) : null}
        {compact ? actions : null}
      </View>
    </View>
  );
}

function ProfileCover({
  media,
  profileName,
}: Readonly<{
  media: ReturnType<typeof resolveProfileMedia>;
  profileName: string;
}>) {
  if (media.source) {
    return (
      <Image
        accessibilityLabel={`Ảnh bìa hồ sơ ${profileName}`}
        resizeMode="cover"
        source={media.source}
        style={StyleSheet.absoluteFill}
      />
    );
  }

  return (
    <LinearGradient
      accessibilityLabel={`Ảnh bìa hồ sơ ${media.state}`}
      colors={profileUi.colors.coverFallback}
      style={[StyleSheet.absoluteFill, styles.coverFallback]}
    >
      <Ionicons
        color={appColors.icon.inactive}
        name="image-outline"
        size={30}
      />
      <AppText tone="muted" variant="caption">
        Chưa có ảnh bìa
      </AppText>
    </LinearGradient>
  );
}

function ProfileAvatar({
  avatar,
  compact,
  displayName,
  online,
  size,
}: Readonly<{
  avatar: ReturnType<typeof resolveProfileMedia>;
  compact: boolean;
  displayName: string;
  online: boolean;
  size: number;
}>) {
  return (
    <View
      style={[
        styles.avatarHost,
        compact && styles.avatarHostCompact,
        profileUi.shadow.avatar,
        { height: size, width: size },
      ]}
      testID="profile-avatar-frame"
    >
      <LinearGradient
        colors={profileUi.gradients.avatarRing}
        style={[
          styles.avatarRing,
          { borderRadius: size / 2, height: size, width: size },
        ]}
      >
        {avatar.source ? (
          <Image
            accessibilityLabel={`Avatar ${displayName}`}
            resizeMode="cover"
            source={avatar.source as ImageSourcePropType}
            style={{
              borderRadius: (size - profileUi.hero.avatarRingWidth * 2) / 2,
              height: size - profileUi.hero.avatarRingWidth * 2,
              width: size - profileUi.hero.avatarRingWidth * 2,
            }}
          />
        ) : (
          <View
            accessibilityLabel={`Avatar hồ sơ ${avatar.state}`}
            style={[
              styles.avatarFallback,
              {
                borderRadius: (size - profileUi.hero.avatarRingWidth * 2) / 2,
                height: size - profileUi.hero.avatarRingWidth * 2,
                width: size - profileUi.hero.avatarRingWidth * 2,
              },
            ]}
          >
            <AppText variant="h1">
              {displayName.trim().charAt(0).toUpperCase() || 'L'}
            </AppText>
          </View>
        )}
      </LinearGradient>
      <View style={styles.presenceFrame}>
        <View
          style={[
            styles.presenceDot,
            {
              backgroundColor: online
                ? appColors.status.online
                : appColors.text.disabled,
            },
          ]}
        />
      </View>
    </View>
  );
}

function HeroIconButton({
  accessibilityLabel,
  compact,
  icon,
  onPress,
}: Readonly<{
  accessibilityLabel: string;
  compact: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}>) {
  return (
    <AppIconButton
      accessibilityLabel={accessibilityLabel}
      backgroundColor={profileUi.colors.artworkScrim}
      emphasis="none"
      onPress={onPress}
      size={profileUi.hero.navSize}
      withHighlight={false}
    >
      <Ionicons
        color={appColors.icon.primary}
        name={icon}
        size={compact ? 19 : 21}
      />
    </AppIconButton>
  );
}

function HeroButton({
  compact,
  disabled = false,
  icon,
  label,
  onPress,
  primary = false,
}: Readonly<{
  compact: boolean;
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
}>) {
  return (
    <AppButton
      accessibilityLabel={heroButtonAccessibilityLabel(label)}
      contentStyle={[
        styles.heroButtonContent,
        compact && styles.heroButtonContentCompact,
      ]}
      disabled={disabled}
      emphasis={primary ? 'low' : 'none'}
      onPress={onPress}
      style={styles.heroButton}
      variant={primary ? 'primary' : 'secondary'}
      withShadow={false}
    >
      <View style={styles.heroButtonCopy}>
        <Ionicons
          color={
            primary ? appColors.text.onAccent : appColors.accent.purpleIcon
          }
          name={icon}
          size={compact ? 15 : 17}
        />
        <AppText
          style={
            primary ? styles.primaryButtonText : styles.secondaryButtonText
          }
          variant={compact ? 'label' : 'button'}
        >
          {label}
        </AppText>
      </View>
    </AppButton>
  );
}

function heroButtonAccessibilityLabel(label: string) {
  if (label === 'Chỉnh sửa') return 'Chỉnh sửa hồ sơ';
  if (label === 'Chia sẻ') return 'Chia sẻ hồ sơ';
  return label;
}

function statusColor(status: ProfileViewModel['statusValue']) {
  if (status === 'ready') return appColors.status.online;
  if (status === 'busy') return appColors.status.warning;
  if (status === 'friends') return appColors.accent.purple;
  return appColors.text.disabled;
}

const styles = StyleSheet.create({
  actionColumn: {
    flexShrink: 0,
    gap: appSpacing.md,
    width: profileUi.hero.actionColumnWidth,
  },
  actionRowCompact: {
    flexDirection: 'row',
    gap: appSpacing.md,
    marginTop: appSpacing.md,
    width: '100%',
  },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: profileUi.colors.avatarFallback,
    justifyContent: 'center',
  },
  avatarHost: {
    flexShrink: 0,
    marginTop: -profileUi.hero.identityTopOverlap,
    position: 'relative',
  },
  avatarHostCompact: {
    marginTop: -profileUi.hero.identityTopOverlapCompact,
  },
  avatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: profileUi.hero.avatarRingWidth,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appSpacing.sm,
  },
  cover: {
    backgroundColor: appColors.background.deep,
    overflow: 'hidden',
    position: 'relative',
  },
  coverFallback: {
    alignItems: 'center',
    gap: appSpacing.md,
    justifyContent: 'center',
  },
  displayName: { flex: 1, minWidth: 0 },
  heroButton: { flex: 1, minWidth: 0 },
  heroButtonContent: {
    minHeight: 42,
    paddingHorizontal: appSpacing.lg,
    paddingVertical: appSpacing.sm,
  },
  heroButtonContentCompact: {
    minHeight: 40,
    paddingHorizontal: appSpacing.md,
    paddingVertical: appSpacing.xs,
  },
  heroButtonCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.md,
    justifyContent: 'center',
  },
  compactDetails: {
    gap: appSpacing.sm,
    marginTop: appSpacing.xs,
  },
  identityCopy: {
    flex: 1,
    gap: appSpacing.sm,
    minWidth: 0,
  },
  identityCopyCompact: { gap: appSpacing.xs },
  identityRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: profileUi.hero.identityGap,
  },
  identityRowCompact: { gap: appSpacing.lg },
  identitySurface: {
    backgroundColor: profileUi.colors.heroIdentity,
    minHeight: profileUi.hero.identityMinHeight,
    paddingBottom: profileUi.hero.identityPaddingBottom,
    paddingHorizontal: profileUi.hero.identityPaddingHorizontal,
    paddingTop: profileUi.hero.identityPaddingTop,
  },
  identitySurfaceCompact: {
    minHeight: profileUi.hero.identityMinHeightCompact,
    paddingBottom: profileUi.hero.identityPaddingBottomCompact,
    paddingHorizontal: profileUi.hero.identityPaddingHorizontalCompact,
    paddingTop: profileUi.hero.identityPaddingTopCompact,
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.md,
    minWidth: 0,
  },
  navigationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: profileUi.hero.navInset,
    position: 'absolute',
    right: profileUi.hero.navInset,
    top: profileUi.hero.navInset,
  },
  navigationRowCompact: {
    left: profileUi.hero.navInsetCompact,
    right: profileUi.hero.navInsetCompact,
    top: profileUi.hero.navInsetCompact,
  },
  navigationSpacer: {
    height: profileUi.hero.navSize,
    width: profileUi.hero.navSize,
  },
  presenceDot: {
    borderRadius: appRadii.pill,
    height: profileUi.hero.presenceSize - 6,
    width: profileUi.hero.presenceSize - 6,
  },
  presenceFrame: {
    alignItems: 'center',
    backgroundColor: appColors.background.base,
    borderRadius: appRadii.pill,
    bottom: 2,
    height: profileUi.hero.presenceSize,
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
    width: profileUi.hero.presenceSize,
  },
  primaryButtonText: { color: appColors.text.onAccent },
  secondaryButtonText: { color: appColors.text.primary },
  statusDot: {
    borderRadius: appRadii.pill,
    height: 7,
    width: 7,
  },
  verifiedBadge: { flexShrink: 0 },
});
