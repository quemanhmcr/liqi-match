import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StyleSheet,
  ToastAndroid,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';

import {
  LiquidButton,
  LiquidCard,
  LiquidChip,
  LiquidOrbButton,
} from '@/shared/components/liquid';
import { useAuth } from '@/shared/auth/auth-context';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';
import {
  liquidColors,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

import { ProfileText } from './components/ProfileShared';
import { profileMockStats } from './profile.mock';
import {
  buildPreviewProfile,
  fetchProfileView,
  type ProfileViewModel,
} from './profile-service';

type ShareRatio = 'story' | 'feed' | 'square';
type ShareTemplate = 'fantasy' | 'minimal' | 'rank';
type ShareCta = 'teamup' | 'clean' | 'rank' | 'support';

type Option<Value extends string> = {
  id: Value;
  label: string;
  meta?: string;
};

const ctaOptions: (Option<ShareCta> & { text: string })[] = [
  {
    id: 'teamup',
    label: 'Tìm đồng đội',
    text: 'Đang tìm đồng đội leo rank tối nay',
  },
  {
    id: 'clean',
    label: 'Không toxic',
    text: 'Teamwork, giao tranh sạch, không toxic',
  },
  {
    id: 'rank',
    label: 'Leo rank',
    text: 'Cần team sạch để leo rank tối nay',
  },
  {
    id: 'support',
    label: 'Teamplay',
    text: 'Support/teamplay, mic on, đánh bình tĩnh',
  },
];

const ratioOptions: Option<ShareRatio>[] = [
  { id: 'story', label: 'Story 9:16', meta: 'đăng story' },
  { id: 'feed', label: 'Feed 4:5', meta: 'bài đăng' },
  { id: 'square', label: 'Vuông 1:1', meta: 'gửi chat' },
];

const templateOptions: Option<ShareTemplate>[] = [
  { id: 'fantasy', label: 'Fantasy', meta: 'premium game' },
  { id: 'minimal', label: 'Tối giản', meta: 'sạch, ít hiệu ứng' },
  { id: 'rank', label: 'Rank', meta: 'nhấn cấp độ' },
];

export function ProfileShareScreen() {
  const { session } = useAuth();
  const [template, setTemplate] = useState<ShareTemplate>('fantasy');
  const [ratio, setRatio] = useState<ShareRatio>('story');
  const [cta, setCta] = useState<ShareCta>('teamup');
  const [exporting, setExporting] = useState<'save' | 'share' | null>(null);
  const cardRef = useRef<View>(null);

  const profileQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => {
      if (!session) throw new Error('Missing auth session');
      return fetchProfileView({ session });
    },
    queryKey: ['profile-view', 'self', session?.user.id],
  });

  const profile =
    profileQuery.data ?? buildPreviewProfile(session, session?.user.id);
  const selectedCta = useMemo(
    () => ctaOptions.find((item) => item.id === cta) ?? ctaOptions[0]!,
    [cta],
  );

  return (
    <LiquidScreen
      contentContainerStyle={styles.scrollContent}
      withBottomNavPadding={false}
      withHeader={false}
    >
      <ShareTopBar loading={profileQuery.isLoading} />

      <View style={styles.previewStage}>
        <SocialProfileCard
          captureRef={cardRef}
          cta={selectedCta.text}
          profile={profile}
          ratio={ratio}
          template={template}
        />
      </View>

      <ShareControls>
        <OptionRow
          label="Phong cách"
          options={templateOptions}
          selected={template}
          tone="purple"
          onSelect={setTemplate}
        />
        <OptionRow
          label="Tỉ lệ ảnh"
          options={ratioOptions}
          selected={ratio}
          tone="cyan"
          onSelect={setRatio}
        />
        <OptionRow
          label="Dòng trên ảnh"
          options={ctaOptions}
          selected={cta}
          tone="purple"
          onSelect={setCta}
        />
      </ShareControls>

      <View style={styles.actionRow}>
        <LiquidButton
          accessibilityLabel="Lưu ảnh hồ sơ"
          disabled={exporting !== null}
          glowIntensity="low"
          onPress={async () => {
            setExporting('save');
            await exportShareImage({
              action: 'save',
              captureTargetRef: cardRef,
              profile,
            });
            setExporting(null);
          }}
          radius={22}
          style={styles.secondaryAction}
          variant="ghost"
          withShadow={false}
        >
          {exporting === 'save' ? (
            <ActivityIndicator color="rgba(231,236,255,0.78)" size="small" />
          ) : (
            <Ionicons
              color="rgba(231,236,255,0.78)"
              name="download-outline"
              size={16}
            />
          )}
          <ProfileText style={styles.secondaryActionText}>Lưu ảnh</ProfileText>
        </LiquidButton>
        <LiquidButton
          accessibilityLabel="Chia sẻ ảnh hồ sơ"
          disabled={exporting !== null}
          glowIntensity="medium"
          onPress={async () => {
            setExporting('share');
            await exportShareImage({
              action: 'share',
              captureTargetRef: cardRef,
              profile,
            });
            setExporting(null);
          }}
          radius={22}
          style={styles.primaryAction}
          withShadow={false}
        >
          {exporting === 'share' ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons color="#FFFFFF" name="share-social-outline" size={16} />
          )}
          <ProfileText style={styles.primaryActionText}>
            Chia sẻ ảnh
          </ProfileText>
        </LiquidButton>
      </View>

      <ProfileText style={styles.exportNote}>
        Preview này được render thành PNG thật để lưu vào máy hoặc gửi qua
        native share sheet. Không kèm QR, deep link hay link mở app.
      </ProfileText>
    </LiquidScreen>
  );
}

function ShareTopBar({ loading }: { loading: boolean }) {
  return (
    <View style={styles.topBar}>
      <LiquidOrbButton
        accessibilityLabel="Quay lại hồ sơ"
        glassIntensity="low"
        glowIntensity="low"
        onPress={() => {
          selectionImpact();
          router.back();
        }}
        size={42}
        style={styles.topOrb}
      >
        <Ionicons
          color={liquidColors.text.primary}
          name="chevron-back"
          size={20}
        />
      </LiquidOrbButton>
      <View style={styles.titleBlock}>
        <ProfileText style={styles.title}>Chia sẻ ảnh hồ sơ</ProfileText>
        <ProfileText style={styles.subtitle}>
          Tạo một thẻ fantasy gaming để lưu hoặc gửi lên social.
        </ProfileText>
      </View>
      <View style={styles.topRightSlot}>
        {loading ? <ActivityIndicator color="#C679FF" size="small" /> : null}
      </View>
    </View>
  );
}

function SocialProfileCard({
  captureRef,
  cta,
  profile,
  ratio,
  template,
}: {
  captureRef: RefObject<View | null>;
  cta: string;
  profile: ProfileViewModel;
  ratio: ShareRatio;
  template: ShareTemplate;
}) {
  const ratioStyle =
    ratio === 'square'
      ? styles.cardSquare
      : ratio === 'feed'
        ? styles.cardFeed
        : styles.cardStory;
  const isMinimal = template === 'minimal';
  const isRank = template === 'rank';
  const meta = [
    profile.rankName ?? 'Chưa rõ rank',
    profile.roleNames[0] ?? 'Chưa chọn vai trò',
    profile.region ?? 'Global',
  ];
  const heroNames = profile.favoriteHeroes.map((hero) => hero.name).slice(0, 3);
  const playstyleTags = profile.playStyleTags.slice(0, 5);

  return (
    <View
      ref={captureRef}
      collapsable={false}
      renderToHardwareTextureAndroid
      style={[styles.socialCard, ratioStyle]}
    >
      {profile.coverUrl ? (
        <>
          <Image
            blurRadius={isMinimal ? 2 : 5}
            resizeMode="cover"
            source={{ uri: profile.coverUrl }}
            style={styles.cardCoverBlur}
          />
          <Image
            resizeMode="cover"
            source={{ uri: profile.coverUrl }}
            style={styles.cardCoverClarity}
          />
        </>
      ) : (
        <LinearGradient
          colors={[
            'rgba(42,28,96,0.72)',
            'rgba(9,18,42,0.92)',
            'rgba(3,6,18,1)',
          ]}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View pointerEvents="none" style={styles.cardDimLayer} />
      <LinearGradient
        colors={[
          'rgba(2,5,16,0.92)',
          'rgba(2,5,16,0.62)',
          'rgba(2,5,16,0.30)',
          'rgba(2,5,16,0.62)',
        ]}
        end={{ x: 1, y: 0.46 }}
        locations={[0, 0.4, 0.74, 1]}
        pointerEvents="none"
        start={{ x: 0, y: 0.46 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(2,5,16,0.56)', 'rgba(2,5,16,0.08)', 'rgba(2,5,16,0.84)']}
        end={{ x: 0.5, y: 1 }}
        locations={[0, 0.42, 1]}
        pointerEvents="none"
        start={{ x: 0.5, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {!isMinimal ? (
        <>
          <View pointerEvents="none" style={styles.cornerGlow} />
          <LinearGradient
            colors={[
              isRank ? 'rgba(255,212,76,0.20)' : 'rgba(130,92,255,0.20)',
              'rgba(103,232,255,0.10)',
              'rgba(255,255,255,0.00)',
            ]}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : null}

      <View style={styles.cardContent}>
        <View style={styles.brandRow}>
          <ProfileText style={styles.brandText}>LIQI MATCH</ProfileText>
          <ProfileText style={styles.brandMeta}>
            Fantasy Profile Card
          </ProfileText>
        </View>

        <View style={styles.identityRow}>
          <AvatarPoster profile={profile} />
          <View style={styles.identityCopy}>
            <View style={styles.nameRow}>
              <ProfileText numberOfLines={1} style={styles.posterName}>
                {profile.displayName}
              </ProfileText>
              {profile.verified ? <VerifiedBadge /> : null}
            </View>
            <ProfileText numberOfLines={1} style={styles.posterRank}>
              {meta.join(' · ')}
            </ProfileText>
            <View style={styles.statusLine}>
              <View style={styles.readyDot} />
              <ProfileText numberOfLines={1} style={styles.statusText}>
                {profile.statusLabel}
              </ProfileText>
            </View>
          </View>
        </View>

        <ProfileText numberOfLines={2} style={styles.posterBio}>
          “{profile.bio}”
        </ProfileText>
        <ProfileText numberOfLines={2} style={styles.posterCta}>
          {cta}
        </ProfileText>

        <View style={styles.statsBox}>
          <PosterStat label="Trận" value={String(profileMockStats.matches)} />
          <PosterStat label="Win" value={`${profileMockStats.winRate}%`} />
          <PosterStat label="Rating" value={String(profileMockStats.rating)} />
        </View>

        {heroNames.length ? (
          <PosterGroup label="Tướng tủ" values={heroNames} tone="hero" />
        ) : null}
        {playstyleTags.length ? (
          <PosterGroup label="Phong cách" values={playstyleTags} tone="tag" />
        ) : null}

        <View style={styles.footerLine}>
          <ProfileText style={styles.footerText}>
            Gaming profile made for social share
          </ProfileText>
        </View>
      </View>
    </View>
  );
}

function AvatarPoster({ profile }: { profile: ProfileViewModel }) {
  return (
    <LinearGradient
      colors={['rgba(142,92,255,0.92)', 'rgba(103,232,255,0.82)']}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={styles.avatarRingOuter}
    >
      <View style={styles.avatarRingInner}>
        {profile.avatarUrl ? (
          <Image
            source={{ uri: profile.avatarUrl }}
            style={styles.avatarImage}
          />
        ) : (
          <ProfileText style={styles.avatarInitial}>
            {profile.displayName.charAt(0).toUpperCase() || 'L'}
          </ProfileText>
        )}
      </View>
    </LinearGradient>
  );
}

function VerifiedBadge() {
  return (
    <View style={styles.verifiedBadge}>
      <Ionicons color="rgba(220,248,255,0.96)" name="checkmark" size={13} />
    </View>
  );
}

function PosterStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <ProfileText style={styles.statValue}>{value}</ProfileText>
      <ProfileText style={styles.statLabel}>{label}</ProfileText>
    </View>
  );
}

function PosterGroup({
  label,
  tone,
  values,
}: {
  label: string;
  tone: 'hero' | 'tag';
  values: string[];
}) {
  return (
    <View style={styles.posterGroup}>
      <ProfileText style={styles.posterGroupLabel}>{label}</ProfileText>
      <View style={styles.posterPills}>
        {values.map((value) => (
          <View
            key={value}
            style={[styles.posterPill, tone === 'hero' && styles.heroPill]}
          >
            <ProfileText numberOfLines={1} style={styles.posterPillText}>
              {value}
            </ProfileText>
          </View>
        ))}
      </View>
    </View>
  );
}

function ShareControls({ children }: { children: ReactNode }) {
  return (
    <LiquidCard
      density="regular"
      glowIntensity="low"
      style={styles.controlsCard}
      surfaceBackground="rgba(7,10,24,0.44)"
    >
      {children}
    </LiquidCard>
  );
}

function OptionRow<Value extends string>({
  label,
  onSelect,
  options,
  selected,
  tone,
}: {
  label: string;
  onSelect: (value: Value) => void;
  options: Option<Value>[];
  selected: Value;
  tone: 'cyan' | 'purple';
}) {
  return (
    <View style={styles.optionRow}>
      <ProfileText style={styles.optionLabel}>{label}</ProfileText>
      <View style={styles.optionChips}>
        {options.map((option) => (
          <LiquidChip
            accessibilityLabel={`${label} ${option.label}`}
            accessibilityState={{ selected: selected === option.id }}
            density="compact"
            key={option.id}
            onPress={() => {
              selectionImpact();
              onSelect(option.id);
            }}
            selected={selected === option.id}
            textStyle={styles.optionChipText}
            variant={tone}
          >
            {option.label}
          </LiquidChip>
        ))}
      </View>
    </View>
  );
}

async function exportShareImage({
  action,
  captureTargetRef,
  profile,
}: {
  action: 'save' | 'share';
  captureTargetRef: RefObject<View | null>;
  profile: ProfileViewModel;
}) {
  impactLight();
  try {
    const uri = await captureShareCard(captureTargetRef, profile.displayName);

    if (action === 'save') {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Cần quyền lưu ảnh',
          'Bạn cần cấp quyền thư viện ảnh để Liqi Match lưu thẻ hồ sơ vào máy.',
        );
        return;
      }

      await MediaLibrary.saveToLibraryAsync(uri);
      showFeedback('Đã lưu ảnh hồ sơ');
      return;
    }

    const shareAvailable = await Sharing.isAvailableAsync();
    if (!shareAvailable) {
      Alert.alert(
        'Không chia sẻ được',
        'Thiết bị hiện không hỗ trợ native share sheet cho file ảnh.',
      );
      return;
    }

    await Sharing.shareAsync(uri, {
      dialogTitle: `Chia sẻ ảnh hồ sơ của ${profile.displayName}`,
      mimeType: 'image/png',
      UTI: 'public.png',
    });
  } catch (error) {
    Alert.alert(
      action === 'save' ? 'Không lưu được ảnh' : 'Không chia sẻ được ảnh',
      error instanceof Error ? error.message : 'Vui lòng thử lại.',
    );
  }
}

async function captureShareCard(
  captureTargetRef: RefObject<View | null>,
  displayName: string,
) {
  if (!captureTargetRef.current) {
    throw new Error('Thẻ ảnh chưa sẵn sàng. Vui lòng thử lại sau một chút.');
  }

  await new Promise((resolve) => requestAnimationFrame(resolve));

  const safeName = displayName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return captureRef(captureTargetRef.current, {
    fileName: `liqi-profile-${safeName || 'player'}-${Date.now()}`,
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });
}

function showFeedback(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }

  Alert.alert(message);
}

function impactLight() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
    () => undefined,
  );
}

function selectionImpact() {
  void Haptics.selectionAsync().catch(() => undefined);
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 8, marginTop: 10 },
  avatarImage: { borderRadius: 42, height: '100%', width: '100%' },
  avatarInitial: { color: '#FFFFFF', fontSize: 34, fontWeight: '900' },
  avatarRingInner: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,14,30,0.82)',
    borderRadius: 42,
    height: 84,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 84,
  },
  avatarRingOuter: {
    alignItems: 'center',
    borderRadius: 47,
    height: 94,
    justifyContent: 'center',
    shadowColor: '#67E8FF',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    width: 94,
  },
  brandMeta: {
    color: 'rgba(210,220,248,0.42)',
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  brandText: {
    color: 'rgba(235,242,255,0.52)',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 18,
    position: 'relative',
    zIndex: 3,
  },
  cardCoverBlur: {
    bottom: 0,
    left: 0,
    opacity: 0.62,
    position: 'absolute',
    right: 0,
    top: 0,
    transform: [{ scale: 1.035 }],
  },
  cardCoverClarity: {
    bottom: 0,
    left: 0,
    opacity: 0.16,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cardDimLayer: {
    backgroundColor: 'rgba(2,5,16,0.18)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cardFeed: { minHeight: 438 },
  cardSquare: { minHeight: 354 },
  cardStory: { minHeight: 548 },
  controlsCard: { marginBottom: 2 },
  cornerGlow: {
    backgroundColor: 'rgba(103,232,255,0.12)',
    borderRadius: 120,
    height: 160,
    position: 'absolute',
    right: -78,
    top: 80,
    width: 160,
  },
  exportNote: {
    color: 'rgba(205,216,245,0.46)',
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 15,
    marginTop: 2,
    textAlign: 'center',
  },
  footerLine: {
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 17,
    paddingTop: 10,
  },
  footerText: {
    color: 'rgba(209,221,255,0.42)',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.22,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  heroPill: { borderColor: 'rgba(142,92,255,0.34)' },
  identityCopy: { flex: 1, minWidth: 0 },
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
    minWidth: 0,
  },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 6, minWidth: 0 },
  optionChipText: { fontSize: 11, fontWeight: '800' },
  optionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  optionLabel: {
    color: 'rgba(235,242,255,0.72)',
    fontSize: 11.5,
    fontWeight: '800',
    marginBottom: 8,
  },
  optionRow: { marginBottom: 13 },
  posterBio: {
    color: 'rgba(231,236,255,0.72)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 18,
  },
  posterCta: {
    color: 'rgba(126,236,255,0.94)',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginTop: 13,
  },
  posterGroup: { marginTop: 15 },
  posterGroupLabel: {
    color: 'rgba(250,252,255,0.82)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.15,
    marginBottom: 7,
    textTransform: 'uppercase',
  },
  posterName: {
    ...liquidTypography.screenName,
    color: 'rgba(252,254,255,0.98)',
    flexShrink: 1,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 29,
  },
  posterPill: {
    backgroundColor: 'rgba(7,12,28,0.58)',
    borderColor: 'rgba(103,232,255,0.22)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  posterPillText: {
    color: 'rgba(232,242,255,0.86)',
    fontSize: 10.5,
    fontWeight: '800',
  },
  posterPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  posterRank: {
    color: 'rgba(219,226,255,0.64)',
    fontSize: 12.2,
    fontWeight: '700',
    marginTop: 3,
  },
  previewStage: { alignItems: 'center', marginBottom: 14, marginTop: 8 },
  primaryAction: { flex: 1.1 },
  primaryActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  readyDot: {
    backgroundColor: 'rgba(103,232,255,0.94)',
    borderRadius: 4,
    height: 8,
    shadowColor: '#67E8FF',
    shadowOpacity: 0.32,
    shadowRadius: 7,
    width: 8,
  },
  scrollContent: { paddingBottom: 44, paddingTop: 3 },
  secondaryAction: { flex: 0.88 },
  secondaryActionText: {
    color: 'rgba(231,236,255,0.78)',
    fontSize: 12,
    fontWeight: '900',
  },
  socialCard: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(4,8,20,0.98)',
    borderColor: 'rgba(103,232,255,0.18)',
    borderRadius: 31,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#67E8FF',
    shadowOpacity: 0.13,
    shadowRadius: 20,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statLabel: {
    color: 'rgba(198,211,241,0.54)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  statValue: {
    color: 'rgba(252,254,255,0.96)',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  statsBox: {
    backgroundColor: 'rgba(4,8,20,0.62)',
    borderColor: 'rgba(150,190,255,0.13)',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    marginTop: 18,
    paddingHorizontal: 9,
    paddingVertical: 12,
  },
  statusLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
  },
  statusText: {
    color: 'rgba(235,244,255,0.84)',
    fontSize: 12,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(205,216,245,0.58)',
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 2,
    textAlign: 'center',
  },
  title: {
    ...liquidTypography.sectionTitle,
    color: liquidColors.text.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.22,
  },
  titleBlock: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 10,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    minHeight: 54,
  },
  topOrb: { height: 42, width: 42 },
  topRightSlot: { alignItems: 'flex-end', minWidth: 42 },
  verifiedBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(38,130,188,0.70)',
    borderColor: 'rgba(103,232,255,0.28)',
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
});
