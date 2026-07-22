import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View } from 'react-native';
import type { RefObject } from 'react';

import { useAssetResolver } from '@/entities/media-asset';
import type { PlayerTrustProjectionV2 } from '@/shared/contracts/core-v2';
import { AppText, appColors, appRadii, appSpacing } from '@/shared/ui';

import { resolveProfileMedia } from '../model/profile-media';
import {
  profileShareRatioConfig,
  type ProfileShareRatio,
  type ProfileShareTemplate,
} from '../share/profile-share-model';
import type { ProfileViewModel } from '../services/profile-service';
import { profileShareUi } from '../ui/profile-share-ui';

export function ProfileShareCard({
  captureRef,
  cta,
  previewWidth,
  profile,
  ratio,
  template,
  trustProjection,
}: Readonly<{
  captureRef: RefObject<View | null>;
  cta: string;
  previewWidth: number;
  profile: ProfileViewModel;
  ratio: ProfileShareRatio;
  template: ProfileShareTemplate;
  trustProjection?: PlayerTrustProjectionV2;
}>) {
  const resolver = useAssetResolver();
  const cover = resolveProfileMedia(resolver, {
    assetKey: profile.coverAssetKey,
    uri: profile.coverUrl,
  });
  const config = profileShareRatioConfig(ratio);
  const glow =
    template === 'minimal'
      ? profileShareUi.gradients.minimalGlow
      : template === 'rank'
        ? profileShareUi.gradients.rankGlow
        : profileShareUi.gradients.fantasyGlow;
  const heroNames = profile.favoriteHeroes.map((hero) => hero.name).slice(0, 3);
  const tags = profile.playStyleTags.slice(0, ratio === 'story' ? 4 : 3);

  return (
    <View
      collapsable={false}
      ref={captureRef}
      renderToHardwareTextureAndroid
      style={[
        styles.card,
        {
          aspectRatio: config.aspectRatio,
          width: previewWidth,
        },
      ]}
      testID="profile-share-card"
    >
      {cover.source ? (
        <Image resizeMode="cover" source={cover.source} style={styles.fill} />
      ) : (
        <LinearGradient
          colors={profileShareUi.gradients.fallbackCover}
          style={styles.fill}
        />
      )}
      <LinearGradient
        colors={profileShareUi.gradients.sideScrim}
        end={{ x: 1, y: 0.5 }}
        start={{ x: 0, y: 0.5 }}
        style={styles.fill}
      />
      <LinearGradient
        colors={profileShareUi.gradients.scrim}
        end={{ x: 0.5, y: 1 }}
        start={{ x: 0.5, y: 0 }}
        style={styles.fill}
      />
      <LinearGradient colors={glow} style={styles.fill} />

      <View
        style={[
          styles.content,
          ratio === 'story' ? styles.contentStory : styles.contentCompact,
        ]}
      >
        <View style={styles.brandRow}>
          <AppText style={styles.brand} variant="label">
            LIQI MATCH
          </AppText>
          <AppText tone="muted" variant="caption">
            SOCIAL GAMING PROFILE
          </AppText>
        </View>

        <View style={styles.identityRow}>
          <PosterAvatar profile={profile} size={ratio === 'story' ? 68 : 58} />
          <View style={styles.identityCopy}>
            <View style={styles.nameRow}>
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                numberOfLines={1}
                style={
                  ratio === 'story' ? styles.nameStory : styles.nameCompact
                }
                variant="h1"
              >
                {profile.displayName}
              </AppText>
              {profile.verified ? (
                <Ionicons
                  color={appColors.accent.purpleIcon}
                  name="planet"
                  size={18}
                />
              ) : null}
            </View>
            <AppText numberOfLines={1} tone="secondary" variant="caption">
              {[profile.rankName, profile.roleNames[0], profile.region]
                .filter(Boolean)
                .join(' · ') || 'Hồ sơ người chơi LiQi'}
            </AppText>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: profileShareStatusColor(
                      profile.statusValue,
                    ),
                  },
                ]}
              />
              <AppText tone="secondary" variant="caption">
                {profile.statusLabel}
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.storyCopy}>
          <AppText
            numberOfLines={ratio === 'story' ? 3 : 2}
            style={styles.bio}
            tone="primary"
            variant="bodySmall"
          >
            “{profile.bio.trim() || 'Sẵn sàng kết nối theo cách của mình.'}”
          </AppText>
          <AppText
            numberOfLines={2}
            style={styles.cta}
            tone="accent"
            variant="h3"
          >
            {cta}
          </AppText>
        </View>

        <View style={styles.stats}>
          <PosterStat
            label="Buổi chơi"
            value={
              trustProjection ? String(trustProjection.completedSessions) : '—'
            }
          />
          <PosterStat
            label="Hoàn tất"
            value={profileShareReliabilityLabel(trustProjection)}
          />
          <PosterStat
            label="Lời khen"
            value={
              trustProjection
                ? String(trustProjection.positiveEndorsements)
                : '—'
            }
          />
        </View>

        {ratio === 'story' && heroNames.length ? (
          <PosterGroup label="Tướng tủ" values={heroNames} />
        ) : null}
        {tags.length ? <PosterGroup label="Phong cách" values={tags} /> : null}

        <View style={styles.footer}>
          <AppText tone="muted" variant="caption">
            liqi.match · Tìm đúng người, chơi đúng nhịp
          </AppText>
        </View>
      </View>
    </View>
  );
}

function PosterAvatar({
  profile,
  size,
}: Readonly<{ profile: ProfileViewModel; size: number }>) {
  const resolver = useAssetResolver();
  const avatar = resolveProfileMedia(resolver, {
    assetKey: profile.avatarAssetKey,
    uri: profile.avatarUrl ?? profile.avatarFallbackUrl,
  });
  return (
    <LinearGradient
      colors={profileShareUi.gradients.avatarRing}
      style={[
        styles.avatarRing,
        { borderRadius: size / 2 + 3, height: size + 6, width: size + 6 },
      ]}
    >
      <View
        style={[
          styles.avatarInner,
          { borderRadius: size / 2, height: size, width: size },
        ]}
      >
        {avatar.source ? (
          <Image
            resizeMode="cover"
            source={avatar.source}
            style={[styles.fill, { borderRadius: size / 2 }]}
          />
        ) : (
          <AppText variant="h1">
            {profile.displayName.trim().charAt(0).toUpperCase() || 'L'}
          </AppText>
        )}
      </View>
    </LinearGradient>
  );
}

function PosterStat({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <View style={styles.statItem}>
      <AppText
        style={styles.statValue}
        testID={`profile-share-stat-${label}`}
        variant="h2"
      >
        {value}
      </AppText>
      <AppText tone="muted" variant="caption">
        {label}
      </AppText>
    </View>
  );
}

function PosterGroup({
  label,
  values,
}: Readonly<{ label: string; values: readonly string[] }>) {
  return (
    <View style={styles.group}>
      <AppText tone="muted" variant="caption">
        {label.toUpperCase()}
      </AppText>
      <View style={styles.pills}>
        {values.map((value) => (
          <View key={value} style={styles.pill}>
            <AppText numberOfLines={1} tone="secondary" variant="caption">
              {value}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

function profileShareReliabilityLabel(
  projection: PlayerTrustProjectionV2 | undefined,
) {
  if (!projection) return '—';
  const sample = projection.completedSessions + projection.noShowCount;
  return sample > 0
    ? `${Math.round(projection.completionReliabilityBps / 100)}%`
    : '—';
}

function profileShareStatusColor(status: ProfileViewModel['statusValue']) {
  if (status === 'ready') return appColors.status.online;
  if (status === 'busy') return appColors.status.warning;
  if (status === 'friends') return appColors.accent.purple;
  return appColors.text.disabled;
}

const styles = StyleSheet.create({
  avatarInner: {
    alignItems: 'center',
    backgroundColor: profileShareUi.colors.cardBase,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarRing: { alignItems: 'center', justifyContent: 'center' },
  bio: { lineHeight: 19 },
  brand: { color: profileShareUi.colors.brand, letterSpacing: 1.2 },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: profileShareUi.colors.cardBase,
    borderColor: profileShareUi.colors.cardBorder,
    borderRadius: profileShareUi.radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
  },
  content: { flex: 1 },
  contentCompact: { gap: appSpacing.lg, padding: appSpacing['3xl'] },
  contentStory: { gap: appSpacing.xl, padding: appSpacing['4xl'] },
  cta: { lineHeight: 21 },
  fill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  footer: {
    borderTopColor: profileShareUi.colors.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 'auto',
    paddingTop: appSpacing.md,
  },
  group: { gap: appSpacing.sm },
  identityCopy: { flex: 1, gap: appSpacing.xs, minWidth: 0 },
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.xl,
  },
  nameCompact: { fontSize: 20, lineHeight: 24 },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appSpacing.sm,
    minWidth: 0,
  },
  nameStory: { fontSize: 24, lineHeight: 29 },
  pill: {
    backgroundColor: profileShareUi.colors.posterPill,
    borderColor: profileShareUi.colors.posterPillBorder,
    borderRadius: appRadii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '48%',
    paddingHorizontal: appSpacing.md,
    paddingVertical: appSpacing.xs,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: appSpacing.sm },
  statItem: { alignItems: 'center', flex: 1, gap: appSpacing.xxs },
  stats: {
    backgroundColor: profileShareUi.colors.statSurface,
    borderColor: profileShareUi.colors.statBorder,
    borderRadius: appRadii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: appSpacing.md,
    paddingVertical: appSpacing.lg,
  },
  statValue: { fontVariant: ['tabular-nums'] },
  statusDot: {
    borderRadius: appRadii.pill,
    height: 6,
    width: 6,
  },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: appSpacing.xs },
  storyCopy: { gap: appSpacing.md },
});
