import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const heroImage = require('../../assets/anh_mau2/liqi-login-hero.png');
const BASE_WIDTH = 393;

type AuthProvider = 'google' | 'facebook' | 'tiktok';
type TrustIconType = 'shield' | 'mic' | 'target';

const trustItems: { icon: TrustIconType; title: string }[] = [
  { icon: 'shield', title: 'Người thật' },
  { icon: 'mic', title: 'Voice nhanh' },
  { icon: 'target', title: 'Ghép chuẩn' },
];

const legalLinks = {
  privacy: 'https://liqimatch.app/privacy',
  terms: 'https://liqimatch.app/terms',
};

function TrustIcon({ type }: { type: TrustIconType }) {
  if (type === 'mic') {
    return (
      <View style={styles.trustIconShell}>
        <View style={styles.micHead} />
        <View style={styles.micStem} />
        <View style={styles.micBase} />
      </View>
    );
  }

  if (type === 'target') {
    return (
      <View style={styles.trustIconShell}>
        <View style={styles.targetOuter}>
          <View style={styles.targetInner}>
            <View style={styles.targetDot} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.trustIconShell}>
      <View style={styles.shield}>
        <View style={styles.checkLong} />
        <View style={styles.checkShort} />
      </View>
    </View>
  );
}

function GoogleIcon() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.googleIcon}
    >
      <Text style={styles.googleGlyph}>G</Text>
    </View>
  );
}

function FacebookIcon() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.facebookIcon}
    >
      <Text style={styles.facebookGlyph}>f</Text>
    </View>
  );
}

function TikTokIcon() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.tiktokIcon}
    >
      <Text style={[styles.tiktokGlyph, styles.tiktokCyan]}>♪</Text>
      <Text style={[styles.tiktokGlyph, styles.tiktokPink]}>♪</Text>
      <Text style={styles.tiktokGlyph}>♪</Text>
    </View>
  );
}

function ProviderIcon({ provider }: { provider: AuthProvider }) {
  if (provider === 'google') return <GoogleIcon />;
  if (provider === 'facebook') return <FacebookIcon />;
  return <TikTokIcon />;
}

function providerLabel(provider: AuthProvider) {
  if (provider === 'google') return 'Tiếp tục với Google';
  if (provider === 'facebook') return 'Tiếp tục với Facebook';
  return 'Tiếp tục với TikTok';
}

function SocialAuthButton({
  disabled,
  loading,
  onPress,
  primary = false,
  provider,
}: {
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
  primary?: boolean;
  provider: AuthProvider;
}) {
  const label = providerLabel(provider);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.socialButton,
        primary ? styles.googleButton : styles.secondarySocialButton,
        pressed && !disabled && styles.buttonPressed,
        disabled && !loading && styles.buttonDisabled,
      ]}
    >
      <View style={styles.socialButtonIcon}>
        {loading ? (
          <ActivityIndicator
            color={primary ? '#20232B' : '#EAF0FF'}
            size="small"
          />
        ) : (
          <ProviderIcon provider={provider} />
        )}
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.socialButtonText,
          primary ? styles.googleButtonText : styles.secondarySocialText,
        ]}
      >
        {label}
      </Text>
      <Text
        style={[styles.socialArrow, !primary && styles.secondarySocialArrow]}
      >
        →
      </Text>
    </Pressable>
  );
}

export default function LoginScreen() {
  const { height, width } = useWindowDimensions();
  const [loadingProvider, setLoadingProvider] = useState<AuthProvider | null>(
    null,
  );

  const scale = useMemo(
    () => Math.max(0.9, Math.min(width / BASE_WIDTH, 1.06)),
    [width],
  );
  const compact = height < 790;
  const horizontal = 18 * scale;
  const authDisabled = Boolean(loadingProvider);

  const showAuthError = (provider: AuthProvider, error: unknown) => {
    Alert.alert(getAuthErrorTitle(provider), getFriendlyAuthError(provider, error), [
      { text: 'Đã hiểu' },
    ]);
  };

  const startOAuth = async (provider: AuthProvider) => {
    if (loadingProvider) return;

    setLoadingProvider(provider);

    try {
      await connectOAuthProvider(provider);
      router.push('/rank');
    } catch (error) {
      showAuthError(provider, error);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleGoogleLogin = () => startOAuth('google');
  const handleFacebookLogin = () => startOAuth('facebook');
  const handleTikTokLogin = () => startOAuth('tiktok');

  const openLegalLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Không thể mở liên kết', 'Vui lòng thử lại sau.', [
        { text: 'Đã hiểu' },
      ]);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#050817', '#020611', '#01040B']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glow, styles.glowLeft]} />
      <View style={[styles.glow, styles.glowRight]} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <ScrollView
          bounces={false}
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: compact ? 10 : 16,
              paddingHorizontal: horizontal,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[styles.brandBlock, compact && styles.brandBlockCompact]}
          >
            <View style={styles.brandHeader}>
              <View style={styles.headerSide} />
              <View accessibilityLabel="Liqi Match" style={styles.logoRow}>
                <Text style={[styles.logoLiqi, { fontSize: 38 * scale }]}> 
                  Liqi
                </Text>
                <Text style={[styles.logoMatch, { fontSize: 38 * scale }]}> 
                  {' '}
                  Match
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Mở cài đặt"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() =>
                  Alert.alert(
                    'Cài đặt',
                    'Cài đặt sẽ khả dụng sau khi đăng nhập.',
                    [{ text: 'Đã hiểu' }],
                  )
                }
                style={({ pressed }) => [
                  styles.settingsButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.settingsGlyph}>⚙</Text>
              </Pressable>
            </View>
            <View style={styles.taglineRow}>
              <LinearGradient
                colors={['#A53DFF', '#3E67FF']}
                style={styles.taglineDash}
              />
              <Text style={styles.tagline}>Match chuẩn, leo rank nhẹ</Text>
              <LinearGradient
                colors={['#3E67FF', '#D237FF']}
                style={styles.taglineDash}
              />
            </View>
          </View>

          <View style={styles.heroFrame}>
            <ImageBackground
              imageStyle={styles.heroImage}
              resizeMode="cover"
              source={heroImage}
              style={styles.hero}
            >
              <LinearGradient
                colors={[
                  'rgba(2,6,17,0)',
                  'rgba(2,6,17,0.08)',
                  'rgba(2,6,17,0.46)',
                ]}
                locations={[0, 0.66, 1]}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              />
            </ImageBackground>
          </View>

          <View style={styles.trustStrip}>
            {trustItems.map((item, index) => (
              <View key={item.title} style={styles.trustItem}>
                {index > 0 ? <View style={styles.trustDivider} /> : null}
                <TrustIcon type={item.icon} />
                <Text numberOfLines={1} style={styles.trustTitle}>
                  {item.title}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.authCard}>
            <View style={styles.socialButtonStack}>
              <SocialAuthButton
                disabled={authDisabled}
                loading={loadingProvider === 'google'}
                onPress={handleGoogleLogin}
                primary
                provider="google"
              />
              <SocialAuthButton
                disabled={authDisabled}
                loading={loadingProvider === 'facebook'}
                onPress={handleFacebookLogin}
                provider="facebook"
              />
              <SocialAuthButton
                disabled={authDisabled}
                loading={loadingProvider === 'tiktok'}
                onPress={handleTikTokLogin}
                provider="tiktok"
              />
            </View>

            <Text style={styles.consentText}>
              Bằng việc tiếp tục, bạn đồng ý với{' '}
              <Text
                accessibilityRole="link"
                onPress={() => openLegalLink(legalLinks.terms)}
                style={styles.consentLink}
              >
                Điều khoản sử dụng
              </Text>{' '}
              và{' '}
              <Text
                accessibilityRole="link"
                onPress={() => openLegalLink(legalLinks.privacy)}
                style={styles.consentLink}
              >
                Chính sách quyền riêng tư
              </Text>
              .
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

async function connectOAuthProvider(provider: AuthProvider) {
  const unavailable = new Error(`${provider}:oauth-not-configured`);
  unavailable.name = 'OAuthNotConfigured';
  throw unavailable;
}

function getAuthErrorTitle(provider: AuthProvider) {
  if (provider === 'google') return 'Không thể đăng nhập bằng Google';
  if (provider === 'facebook') return 'Không thể đăng nhập bằng Facebook';
  return 'Không thể đăng nhập bằng TikTok';
}

function getFriendlyAuthError(provider: AuthProvider, error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('cancel')) {
    return 'Đăng nhập đã bị hủy. Bạn có thể thử lại bất cứ lúc nào.';
  }

  if (message.includes('network')) {
    return 'Kết nối mạng không ổn định. Vui lòng kiểm tra và thử lại.';
  }

  if (provider === 'google') {
    return 'Google hiện chưa khả dụng. Bạn có thể thử lại sau hoặc tiếp tục với Facebook/TikTok.';
  }

  if (provider === 'facebook') {
    return 'Facebook hiện chưa khả dụng. Bạn có thể thử lại sau hoặc tiếp tục với Google/TikTok.';
  }

  return 'TikTok hiện chưa khả dụng. Bạn có thể thử lại sau hoặc tiếp tục với Google/Facebook.';
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#020611',
    flex: 1,
    overflow: 'hidden',
  },
  safe: {
    flex: 1,
  },
  content: {
    alignItems: 'stretch',
    flexGrow: 1,
  },
  glow: {
    borderRadius: 180,
    height: 360,
    opacity: 0.1,
    position: 'absolute',
    transform: [{ scaleY: 0.38 }, { rotate: '-18deg' }],
    width: 360,
  },
  glowLeft: {
    backgroundColor: '#762CFF',
    bottom: 95,
    left: -270,
  },
  glowRight: {
    backgroundColor: '#2258FF',
    bottom: 260,
    right: -285,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 10,
  },
  brandBlockCompact: {
    marginBottom: 9,
    marginTop: 2,
  },
  brandHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  headerSide: {
    width: 44,
  },
  settingsButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,23,43,0.76)',
    borderColor: 'rgba(162,176,230,0.14)',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  settingsGlyph: {
    color: '#D9DDEB',
    fontSize: 19,
    lineHeight: 22,
  },
  logoRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  logoLiqi: {
    color: '#A23CFF',
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(132,68,255,0.75)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 14,
    transform: [{ skewX: '-7deg' }],
  },
  logoMatch: {
    color: '#F8F8FC',
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(255,255,255,0.18)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 7,
    transform: [{ skewX: '-7deg' }],
  },
  taglineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 3,
  },
  tagline: {
    color: '#D6D7E2',
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginHorizontal: 11,
  },
  taglineDash: {
    borderRadius: 2,
    height: 2,
    width: 13,
  },
  heroFrame: {
    backgroundColor: '#080C1C',
    borderColor: 'rgba(135,143,210,0.14)',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  hero: {
    aspectRatio: 1.62,
    justifyContent: 'flex-end',
    width: '100%',
  },
  heroImage: {
    borderRadius: 18,
  },
  trustStrip: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    marginTop: 16,
    paddingHorizontal: 2,
  },
  trustItem: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minWidth: 0,
    position: 'relative',
  },
  trustDivider: {
    backgroundColor: 'rgba(151,162,195,0.22)',
    bottom: 3,
    left: 0,
    position: 'absolute',
    top: 3,
    width: StyleSheet.hairlineWidth,
  },
  trustIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(128,72,255,0.14)',
    borderRadius: 11,
    height: 24,
    justifyContent: 'center',
    marginRight: 6,
    width: 24,
  },
  shield: {
    alignItems: 'center',
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    borderColor: '#8E66FF',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderWidth: 1.4,
    height: 17,
    justifyContent: 'center',
    width: 15,
  },
  checkLong: {
    backgroundColor: '#B6A8FF',
    borderRadius: 1,
    height: 1.7,
    position: 'absolute',
    transform: [{ rotate: '-45deg' }, { translateX: 2 }],
    width: 8,
  },
  checkShort: {
    backgroundColor: '#B6A8FF',
    borderRadius: 1,
    height: 1.7,
    position: 'absolute',
    transform: [{ rotate: '45deg' }, { translateX: -3 }, { translateY: 2 }],
    width: 5,
  },
  micHead: {
    borderColor: '#A066FF',
    borderRadius: 5,
    borderWidth: 1.5,
    height: 13,
    width: 8,
  },
  micStem: {
    backgroundColor: '#A066FF',
    height: 5,
    width: 1.5,
  },
  micBase: {
    backgroundColor: '#A066FF',
    borderRadius: 1,
    height: 1.5,
    width: 10,
  },
  targetOuter: {
    alignItems: 'center',
    borderColor: '#6477FF',
    borderRadius: 9,
    borderWidth: 1.4,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  targetInner: {
    alignItems: 'center',
    borderColor: '#9A55FF',
    borderRadius: 5,
    borderWidth: 1.3,
    height: 10,
    justifyContent: 'center',
    width: 10,
  },
  targetDot: {
    backgroundColor: '#B174FF',
    borderRadius: 1.5,
    height: 3,
    width: 3,
  },
  trustTitle: {
    color: '#DCE1F0',
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '800',
  },
  authCard: {
    backgroundColor: 'rgba(13,20,38,0.62)',
    borderColor: 'rgba(162,176,230,0.15)',
    borderRadius: 24,
    borderWidth: 1,
    paddingBottom: 17,
    paddingHorizontal: 16,
    paddingTop: 18,
    shadowColor: '#6840FF',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  socialButton: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    width: '100%',
  },
  googleButton: {
    backgroundColor: '#F7F8FA',
    borderColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    height: 52,
  },
  secondarySocialButton: {
    backgroundColor: 'rgba(18,27,48,0.92)',
    borderColor: 'rgba(126,148,255,0.22)',
    borderWidth: 1,
    height: 52,
  },
  socialButtonIcon: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    marginRight: 12,
    width: 24,
  },
  socialButtonText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
  googleButtonText: {
    color: '#1D2430',
    fontWeight: '700',
  },
  secondarySocialText: {
    color: '#EEF2FF',
  },
  socialArrow: {
    color: '#2B3240',
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 10,
  },
  secondarySocialArrow: {
    color: '#B8C4FF',
  },
  socialButtonStack: {
    rowGap: 11,
  },
  googleIcon: {
    alignItems: 'center',
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  googleGlyph: {
    color: '#4285F4',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  facebookIcon: {
    alignItems: 'center',
    backgroundColor: '#1877F2',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  facebookGlyph: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 3,
  },
  tiktokIcon: {
    height: 24,
    position: 'relative',
    width: 24,
  },
  tiktokGlyph: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    left: 2,
    lineHeight: 24,
    position: 'absolute',
    top: 0,
  },
  tiktokCyan: {
    color: '#25F4EE',
    left: 0,
    top: 1,
  },
  tiktokPink: {
    color: '#FE2C55',
    left: 4,
    top: -1,
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.992 }],
  },
  buttonDisabled: {
    opacity: 0.48,
  },
  consentText: {
    color: '#A8B0C4',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 19,
    marginTop: 15,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  consentLink: {
    color: '#B885FF',
    fontWeight: '800',
    lineHeight: 22,
  },
});
