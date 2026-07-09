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
  LiquidButton,
  LiquidChip,
  LiquidGlassSurface,
} from '@/shared/components/liquid';
import { liquidTypography } from '@/shared/theme/liquid-glass.tokens';
import {
  heroGlowSegments,
  profileFantasyBlueGlowSegments,
} from '@/shared/theme/liquid-glow.presets';

import type { ProfileViewModel } from '../profile-service';
import { ProfileStatsBar } from './ProfileStatsBar';
import { ProfileText } from './ProfileShared';

export type ProfileHeroMode = 'self' | 'other';

const fallbackAvatar =
  require('../../../../assets/anh_mau_3/avatar_khoa_jungle_assassin.png') as ImageSourcePropType;
const fallbackMinhAnhAvatar =
  require('../../../../assets/anh_mau_3/avatar_minh_anh_support.png') as ImageSourcePropType;
const heroArtwork =
  require('../../../../assets/anh_mau_3/background_hero_trang_chu.png') as ImageSourcePropType;

export type ProfileHeroCardProps = {
  mode: ProfileHeroMode;
  onEdit?: () => void;
  onInvite?: () => void;
  onMessage?: () => void;
  onShare?: () => void;
  profile: ProfileViewModel;
  vibe?: number;
};

export function ProfileHeroCard({
  mode,
  onEdit,
  onInvite,
  onMessage,
  onShare,
  profile,
  vibe,
}: ProfileHeroCardProps) {
  const avatarUri = profile.avatarUrl ?? profile.avatarFallbackUrl;
  const avatarSource =
    imageSource(avatarUri) ??
    (isMinhAnhProfile(profile.displayName)
      ? fallbackMinhAnhAvatar
      : fallbackAvatar);
  const uploadedCoverSource = imageSource(profile.coverUrl);
  const hasUploadedCover = Boolean(uploadedCoverSource);
  const heroSource = uploadedCoverSource ?? heroArtwork;
  const heroImageStyle = hasUploadedCover
    ? styles.heroCoverImage
    : styles.heroArtwork;
  const meta = [
    profile.rankName ?? 'Cao Thủ',
    profile.roleNames.slice(0, 2).join(' / ') || 'Trợ Thủ',
    profile.region ?? 'Global',
  ].join(' · ');
  const isSelf = mode === 'self';

  return (
    <LiquidGlassSurface
      baseStrokeColor="rgba(103,232,255,0.30)"
      baseStrokeOpacity={0.09}
      baseStrokeWidth={0.58}
      blurIntensity={34}
      contentStyle={styles.heroSurface}
      frameColors={[
        'rgba(142,92,255,0.22)',
        'rgba(210,225,255,0.040)',
        'rgba(103,232,255,0.28)',
      ]}
      glassIntensity="high"
      glowIntensity="medium"
      glowPad={18}
      glowPreset={heroGlowSegments}
      radius={30}
      style={styles.heroFrame}
      surfaceBackground="rgba(7,10,24,0.48)"
      variant="hero"
      withInnerReflection
      withShadow
    >
      <LinearGradient
        colors={[
          'rgba(3,6,18,0.96)',
          'rgba(6,10,29,0.82)',
          'rgba(8,15,38,0.50)',
          'rgba(3,6,18,0.34)',
        ]}
        end={{ x: 1, y: 0.46 }}
        start={{ x: 0, y: 0.42 }}
        style={StyleSheet.absoluteFill}
      />
      <Image
        blurRadius={hasUploadedCover ? 4 : 0}
        resizeMode="cover"
        source={heroSource}
        style={heroImageStyle}
      />
      {hasUploadedCover ? (
        <>
          <Image
            resizeMode="cover"
            source={heroSource}
            style={styles.heroCoverClarityImage}
          />
          <View pointerEvents="none" style={styles.uploadedCoverDimLayer} />
          <LinearGradient
            colors={[
              'rgba(1,3,12,0.84)',
              'rgba(1,3,12,0.56)',
              'rgba(1,3,12,0.18)',
              'rgba(1,3,12,0.30)',
            ]}
            end={{ x: 1, y: 0.44 }}
            locations={[0, 0.38, 0.72, 1]}
            pointerEvents="none"
            start={{ x: 0, y: 0.44 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[
              'rgba(2,5,16,0.58)',
              'rgba(2,5,16,0.14)',
              'rgba(2,5,16,0.78)',
            ]}
            end={{ x: 0.5, y: 1 }}
            locations={[0, 0.48, 1]}
            pointerEvents="none"
            start={{ x: 0.5, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[
              'rgba(92,96,255,0.13)',
              'rgba(36,178,255,0.06)',
              'rgba(2,5,16,0.00)',
            ]}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            start={{ x: 0.06, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[
              'rgba(0,0,0,0.34)',
              'rgba(0,0,0,0.00)',
              'rgba(0,0,0,0.38)',
            ]}
            end={{ x: 1, y: 0.5 }}
            pointerEvents="none"
            start={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : (
        <>
          <LinearGradient
            colors={[
              'rgba(3,6,18,0.96)',
              'rgba(3,6,18,0.78)',
              'rgba(3,6,18,0.18)',
              'rgba(3,6,18,0.00)',
            ]}
            end={{ x: 1, y: 0.42 }}
            pointerEvents="none"
            start={{ x: 0.12, y: 0.42 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[
              'rgba(106,101,255,0.15)',
              'rgba(56,215,255,0.13)',
              'rgba(3,7,20,0.00)',
            ]}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            start={{ x: 0.04, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[
              'rgba(106,101,255,0.00)',
              'rgba(106,101,255,0.11)',
              'rgba(103,232,255,0.12)',
              'rgba(3,7,20,0.00)',
            ]}
            end={{ x: 1, y: 0.5 }}
            pointerEvents="none"
            start={{ x: 0.42, y: 0.46 }}
            style={styles.artPresence}
          />
        </>
      )}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.16)',
          'rgba(255,255,255,0.035)',
          'rgba(255,255,255,0.00)',
        ]}
        end={{ x: 0.84, y: 0 }}
        pointerEvents="none"
        start={{ x: 0.08, y: 0 }}
        style={styles.topHighlight}
      />
      <LinearGradient
        colors={[
          'rgba(3,6,18,0.00)',
          hasUploadedCover ? 'rgba(3,6,18,0.54)' : 'rgba(3,6,18,0.38)',
          hasUploadedCover ? 'rgba(3,6,18,0.90)' : 'rgba(3,6,18,0.78)',
        ]}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        start={{ x: 0.5, y: 0.42 }}
        style={StyleSheet.absoluteFill}
      />
      {hasUploadedCover ? (
        <LinearGradient
          colors={[
            'rgba(3,6,18,0.00)',
            'rgba(3,6,18,0.66)',
            'rgba(3,6,18,0.94)',
          ]}
          locations={[0, 0.42, 1]}
          pointerEvents="none"
          style={styles.uploadedCoverStatsScrim}
        />
      ) : null}

      <View style={styles.contentLayer}>
        <View style={styles.identityRow}>
          <View style={styles.avatarWrap}>
            <LinearGradient
              colors={['rgba(142,92,255,0.70)', 'rgba(103,232,255,0.64)']}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.avatarRing}
            >
              <Image source={avatarSource} style={styles.avatarImage} />
            </LinearGradient>
          </View>

          <View style={styles.identityCopy}>
            <View style={styles.nameRow}>
              <ProfileText
                ellipsizeMode="tail"
                numberOfLines={1}
                style={styles.name}
              >
                {profile.displayName}
              </ProfileText>
              {profile.verified ? (
                <LiquidBadge
                  size="sm"
                  variant="cyan"
                  style={styles.verifiedBadge}
                >
                  ✓
                </LiquidBadge>
              ) : null}
            </View>
            <ProfileText numberOfLines={1} style={styles.meta}>
              {meta}
            </ProfileText>
            <View style={styles.statusRow}>
              <LiquidChip
                contentStyle={styles.readyChip}
                density="compact"
                icon={<View style={styles.readyDot} />}
                selected
                textStyle={styles.statusText}
                variant="cyan"
              >
                {profile.statusLabel}
              </LiquidChip>
              {!isSelf && vibe ? (
                <LiquidChip
                  contentStyle={styles.statusChip}
                  density="compact"
                  icon={
                    <Ionicons
                      color="rgba(224,170,255,0.92)"
                      name="heart"
                      size={12}
                    />
                  }
                  textStyle={styles.statusText}
                  variant="purple"
                >
                  Hợp vibe {vibe}%
                </LiquidChip>
              ) : null}
            </View>
          </View>
        </View>

        <ProfileText numberOfLines={2} style={styles.bio}>
          “{profile.bio}”
        </ProfileText>

        <View style={styles.actionRow}>
          <LiquidButton
            accessibilityLabel={isSelf ? 'Chỉnh sửa hồ sơ' : 'Nhắn tin'}
            contentStyle={styles.secondaryActionContent}
            glowIntensity="none"
            gradientColors={['rgba(24,28,47,0.42)', 'rgba(13,17,32,0.34)']}
            onPress={isSelf ? onEdit : onMessage}
            radius={22}
            style={styles.messageButton}
            variant="secondary"
            withShadow={false}
          >
            <Ionicons
              color="rgba(231,236,255,0.88)"
              name={isSelf ? 'create-outline' : 'chatbubble-ellipses-outline'}
              size={16}
            />
            <ProfileText style={styles.secondaryButtonText}>
              {isSelf ? 'Chỉnh sửa' : 'Nhắn tin'}
            </ProfileText>
          </LiquidButton>
          <LiquidButton
            accessibilityLabel={isSelf ? 'Chia sẻ hồ sơ' : 'Mời vào set'}
            contentStyle={styles.primaryActionContent}
            glowIntensity="medium"
            glowPreset={profileFantasyBlueGlowSegments}
            gradientColors={[
              'rgba(92,96,255,0.78)',
              'rgba(70,116,255,0.86)',
              'rgba(48,170,255,0.86)',
              'rgba(72,226,255,0.82)',
            ]}
            gradientLocations={[0, 0.2, 0.58, 1]}
            onPress={isSelf ? onShare : onInvite}
            radius={22}
            style={styles.inviteButton}
            variant="primary"
            withShadow={false}
          >
            <Ionicons
              color="#FFFFFF"
              name={isSelf ? 'share-social-outline' : 'people-outline'}
              size={17}
            />
            <ProfileText style={styles.primaryButtonText}>
              {isSelf ? 'Chia sẻ' : 'Mời vào set'}
            </ProfileText>
          </LiquidButton>
        </View>

        <ProfileStatsBar embedded showWinRate={profile.showWinRate} />
      </View>
    </LiquidGlassSurface>
  );
}

function imageSource(uri: string | undefined): ImageSourcePropType | undefined {
  return uri ? { uri } : undefined;
}

function isMinhAnhProfile(displayName: string) {
  return displayName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes('minh anh');
}

const styles = StyleSheet.create({
  artPresence: {
    bottom: 26,
    opacity: 0.88,
    position: 'absolute',
    right: -16,
    top: 18,
    width: 228,
  },
  actionRow: { flexDirection: 'row', gap: 9, marginTop: 15 },
  avatarImage: { borderRadius: 33, height: 66, width: 66 },
  avatarRing: {
    alignItems: 'center',
    borderRadius: 37,
    height: 74,
    justifyContent: 'center',
    width: 74,
  },
  avatarWrap: { height: 78, position: 'relative', width: 78 },
  bio: {
    color: 'rgba(222,228,255,0.58)',
    fontSize: 10.5,
    fontWeight: '500',
    letterSpacing: -0.06,
    lineHeight: 15.5,
    marginTop: 12,
    maxWidth: 242,
  },
  contentLayer: {
    minHeight: 254,
    padding: 16,
    paddingTop: 17,
    position: 'relative',
    zIndex: 3,
  },
  heroArtwork: {
    height: 224,
    opacity: 0.4,
    position: 'absolute',
    right: -84,
    top: -27,
    width: 318,
  },
  heroCoverClarityImage: {
    bottom: 82,
    left: 0,
    opacity: 0.24,
    position: 'absolute',
    right: 0,
    top: 0,
    transform: [{ scale: 1.006 }],
  },
  heroCoverImage: {
    bottom: 82,
    left: 0,
    opacity: 0.44,
    position: 'absolute',
    right: 0,
    top: 0,
    transform: [{ scale: 1.018 }],
  },
  heroFrame: { marginTop: 8, overflow: 'visible' },
  heroSurface: {
    borderRadius: 29,
    minHeight: 254,
    overflow: 'hidden',
    padding: 0,
  },
  identityCopy: { flex: 1, minWidth: 0, paddingTop: 5 },
  identityRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 11,
    minWidth: 0,
  },
  inviteButton: { flex: 1.04, minWidth: 0 },
  messageButton: { flex: 0.94, minWidth: 0 },
  meta: {
    color: 'rgba(219,226,255,0.58)',
    fontSize: 11.5,
    fontWeight: '500',
    letterSpacing: -0.03,
    marginTop: 2,
  },
  name: {
    ...liquidTypography.screenName,
    color: 'rgba(250,252,255,0.94)',
    flexShrink: 1,
    maxWidth: 188,
    fontSize: 21.5,
    fontWeight: '700',
    letterSpacing: -0.42,
    lineHeight: 26,
    minWidth: 0,
  },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 5, minWidth: 0 },
  primaryActionContent: {
    borderColor: 'rgba(103,232,255,0.38)',
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.03,
  },
  readyDot: {
    backgroundColor: 'rgba(103,232,255,0.92)',
    borderRadius: 4,
    height: 8,
    shadowColor: '#67E8FF',
    shadowOpacity: 0.28,
    shadowRadius: 5,
    width: 8,
  },
  secondaryActionContent: {
    borderColor: 'rgba(190,218,255,0.10)',
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    color: 'rgba(231,237,255,0.78)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.03,
  },
  readyChip: {
    backgroundColor: 'rgba(37,72,128,0.28)',
    borderColor: 'rgba(103,232,255,0.18)',
    minHeight: 25,
    minWidth: 78,
    paddingHorizontal: 8,
  },
  statusChip: { minHeight: 25, minWidth: 104, paddingHorizontal: 8 },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    marginTop: 9,
    width: 232,
  },
  statusText: { fontSize: 10.4, fontWeight: '600', letterSpacing: -0.01 },
  uploadedCoverDimLayer: {
    backgroundColor: 'rgba(1,3,10,0.06)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  uploadedCoverStatsScrim: {
    bottom: 0,
    height: 126,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  topHighlight: {
    height: 1,
    left: 14,
    opacity: 0.7,
    position: 'absolute',
    right: 20,
    top: 1,
  },
  verifiedBadge: {
    borderRadius: 999,
    flexShrink: 0,
    shadowColor: '#67E8FF',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    transform: [{ scale: 0.92 }],
  },
});
