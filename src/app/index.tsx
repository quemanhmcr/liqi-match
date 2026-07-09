import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OAuthProvider } from '@/shared/auth/auth-service';
import { useAuth } from '@/shared/auth/auth-context';
import {
  ONBOARDING_STATUS_UNAVAILABLE_MESSAGE,
  resolvePostLoginRoute,
} from '@/features/onboarding/onboarding-routing';
import {
  LiquidEdgeGlow,
  type EdgeGlowSegment,
} from '@/shared/components/liquid';

type LoginProvider = OAuthProvider | 'tiktok';

const loginHero = require('../../assets/anh_mau_4/hero.png') as number;
const loginLogo = require('../../assets/anh_mau_4/logo.png') as number;

const heroAspectRatio = 1659 / 948;

const legalLinks = {
  privacy: 'https://liqimatch.app/privacy',
  terms: 'https://liqimatch.app/terms',
};

const providerGlowSegments: Record<LoginProvider, readonly EdgeGlowSegment[]> =
  {
    google: [
      {
        bloomOpacity: 0.11,
        bloomWidth: 3.5,
        blur: 9,
        color: 'rgba(187,150,255,0.54)',
        end: 0.18,
        id: 'google-purple-top',
        lineOpacity: 0.27,
        lineWidth: 0.58,
        start: 0.04,
      },
      {
        bloomOpacity: 0.1,
        bloomWidth: 3.4,
        blur: 10,
        color: 'rgba(83,214,255,0.52)',
        end: 0.76,
        id: 'google-cyan-bottom',
        lineOpacity: 0.25,
        lineWidth: 0.56,
        start: 0.64,
      },
    ],
    facebook: [
      {
        bloomOpacity: 0.12,
        bloomWidth: 3.6,
        blur: 9,
        color: 'rgba(89,166,255,0.58)',
        end: 0.87,
        id: 'facebook-blue-bottom',
        lineOpacity: 0.3,
        lineWidth: 0.6,
        start: 0.66,
      },
      {
        bloomOpacity: 0.08,
        bloomWidth: 3.1,
        blur: 10,
        color: 'rgba(170,211,255,0.42)',
        end: 0.21,
        id: 'facebook-ice-top',
        lineOpacity: 0.2,
        lineWidth: 0.5,
        start: 0.08,
      },
    ],
    tiktok: [
      {
        bloomOpacity: 0.12,
        bloomWidth: 3.6,
        blur: 9,
        color: 'rgba(255,96,178,0.56)',
        end: 0.94,
        id: 'tiktok-pink-corner',
        lineOpacity: 0.29,
        lineWidth: 0.58,
        start: 0.8,
      },
      {
        bloomOpacity: 0.11,
        bloomWidth: 3.4,
        blur: 10,
        color: 'rgba(58,230,255,0.56)',
        end: 0.72,
        id: 'tiktok-cyan-bottom',
        lineOpacity: 0.28,
        lineWidth: 0.56,
        start: 0.58,
      },
    ],
  };

export default function LoginScreen() {
  const { loading, session, signIn } = useAuth();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider | null>(
    null,
  );
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const compact = screenHeight < 780;
  const tight = screenHeight < 720;
  const heroImageWidth = screenWidth * (compact ? 1.43 : 1.37);
  const heroImageHeight = heroImageWidth / heroAspectRatio;
  const heroImageLeft = -(heroImageWidth - screenWidth) / 2;
  const heroStageHeight = Math.min(
    Math.max(screenHeight * (compact ? 0.276 : 0.294), tight ? 202 : 218),
    compact ? 242 : 262,
  );
  const longBlendTop = Math.max(heroImageHeight * 0.34, 118);
  const logoWidth = compact ? 97 : 106;
  const logoHeight = compact ? 72 : 80;
  const titleFontSize = compact ? 25.2 : 27.6;
  const titleLineHeight = compact ? 30.5 : 33.5;
  const bodyFontSize = compact ? 12.4 : 13.1;
  const bodyLineHeight = compact ? 17.3 : 18.6;
  const buttonHeight = compact ? 44 : 47;
  const buttonRadius = buttonHeight / 2;

  useEffect(() => {
    let active = true;

    async function routeExistingSession() {
      if (loading || !session) return;
      try {
        const route = await resolvePostLoginRoute(session);
        if (!active) return;
        router.replace(route);
      } catch {
        if (!active) return;
        setAuthMessage(ONBOARDING_STATUS_UNAVAILABLE_MESSAGE);
      }
    }

    routeExistingSession();
    return () => {
      active = false;
    };
  }, [loading, session]);

  const startOAuth = async (provider: LoginProvider) => {
    if (provider === 'tiktok') {
      setAuthMessage(
        'TikTok OAuth sẽ được kết nối sau. Hiện hãy dùng Google hoặc Facebook.',
      );
      return;
    }

    if (loadingProvider) return;
    setAuthMessage(null);
    setLoadingProvider(provider);

    try {
      const nextSession = await signIn(provider);
      try {
        const route = await resolvePostLoginRoute(nextSession);
        router.replace(route);
      } catch {
        setAuthMessage(ONBOARDING_STATUS_UNAVAILABLE_MESSAGE);
      }
    } catch (error) {
      setAuthMessage(getFriendlyAuthError(provider, error));
    } finally {
      setLoadingProvider(null);
    }
  };

  const openLegalLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setAuthMessage('Không thể mở liên kết lúc này. Vui lòng thử lại.');
    }
  };

  const previewWithoutLogin = () => {
    setAuthMessage(null);
    router.push('/home');
  };

  const authDisabled = loading || Boolean(loadingProvider);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#030716', '#02050E', '#01030A']}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={loginHero}
        style={[
          styles.heroBackdrop,
          {
            height: heroImageHeight,
            left: heroImageLeft,
            width: heroImageWidth,
          },
        ]}
      />
      <LinearGradient
        colors={['rgba(2,5,14,0.5)', 'rgba(2,5,14,0.18)', 'rgba(2,5,14,0.02)']}
        locations={[0, 0.46, 1]}
        pointerEvents="none"
        style={styles.topScrim}
      />
      <LinearGradient
        colors={['rgba(2,5,14,0.82)', 'rgba(2,5,14,0.22)', 'rgba(2,5,14,0.8)']}
        end={{ x: 1, y: 0.5 }}
        pointerEvents="none"
        start={{ x: 0, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[
          'rgba(2,5,14,0.08)',
          'rgba(2,5,14,0.68)',
          'rgba(2,5,14,0.94)',
          '#02050E',
        ]}
        locations={[0, 0.24, 0.64, 1]}
        pointerEvents="none"
        style={[styles.longBottomBlend, { top: longBlendTop }]}
      />
      <View pointerEvents="none" style={styles.deepAtmosphere} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <ScrollView
          bounces={false}
          contentContainerStyle={[
            styles.content,
            {
              minHeight: screenHeight,
              paddingBottom: 22,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.heroStage, { height: heroStageHeight }]}>
            <View
              pointerEvents="none"
              style={[styles.logoWrap, { paddingTop: compact ? 8 : 13 }]}
            >
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={loginLogo}
                style={{ height: logoHeight, width: logoWidth }}
              />
            </View>
          </View>

          <View
            style={[styles.bottomStack, { marginTop: compact ? -14 : -19 }]}
          >
            <View style={styles.copyBlock}>
              <Text
                accessibilityRole="header"
                style={[
                  styles.heroTitle,
                  {
                    fontSize: titleFontSize,
                    lineHeight: titleLineHeight,
                  },
                ]}
              >
                Đăng nhập để{`\n`}vào set đúng vibe
              </Text>
              <Text
                style={[
                  styles.heroSubtitle,
                  {
                    fontSize: bodyFontSize,
                    lineHeight: bodyLineHeight,
                  },
                ]}
              >
                Kết nối với cộng đồng Liqi, khám phá box chat, set đang gọi
                người và những người chơi hợp gu với bạn.
              </Text>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Hoặc tiếp tục với</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.authStack}>
              <SocialAuthButton
                buttonHeight={buttonHeight}
                buttonRadius={buttonRadius}
                compact={compact}
                disabled={authDisabled}
                loading={loadingProvider === 'google'}
                onPress={() => startOAuth('google')}
                provider="google"
                title="Tiếp tục với Google"
              />
              <SocialAuthButton
                buttonHeight={buttonHeight}
                buttonRadius={buttonRadius}
                compact={compact}
                disabled={authDisabled}
                loading={loadingProvider === 'facebook'}
                onPress={() => startOAuth('facebook')}
                provider="facebook"
                title="Tiếp tục với Facebook"
              />
              <SocialAuthButton
                buttonHeight={buttonHeight}
                buttonRadius={buttonRadius}
                compact={compact}
                disabled={authDisabled}
                loading={loadingProvider === 'tiktok'}
                onPress={() => startOAuth('tiktok')}
                provider="tiktok"
                title="Tiếp tục với TikTok"
              />
            </View>

            <Text style={styles.consentText}>
              Bằng việc tiếp tục, bạn đồng ý với{`\n`}
              <Text
                onPress={() => openLegalLink(legalLinks.terms)}
                style={styles.consentLink}
              >
                Điều khoản
              </Text>{' '}
              và{' '}
              <Text
                onPress={() => openLegalLink(legalLinks.privacy)}
                style={styles.consentLink}
              >
                Quyền riêng tư
              </Text>
              .
            </Text>

            {authMessage ? (
              <View accessibilityLiveRegion="polite" style={styles.authMessage}>
                <Text style={styles.authMessageText}>{authMessage}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityLabel="Xem thử không cần đăng nhập"
              accessibilityRole="button"
              onPress={previewWithoutLogin}
              style={({ pressed }) => [
                styles.previewLink,
                pressed && styles.previewLinkPressed,
              ]}
            >
              <Text style={styles.previewLinkText}>
                Xem thử không cần đăng nhập
              </Text>
              <Text style={styles.previewArrow}>›</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SocialAuthButton({
  buttonHeight,
  buttonRadius,
  compact,
  disabled,
  loading,
  onPress,
  provider,
  title,
}: {
  buttonHeight: number;
  buttonRadius: number;
  compact: boolean;
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
  provider: LoginProvider;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      android_ripple={null}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.socialButtonHost,
        { borderRadius: buttonRadius, minHeight: buttonHeight },
        pressed && !disabled && styles.pressed,
        disabled && !loading && styles.disabled,
      ]}
    >
      <LiquidEdgeGlow
        baseStrokeColor="rgba(232,238,255,0.46)"
        baseStrokeOpacity={0.048}
        baseStrokeWidth={0.36}
        pad={7}
        radius={buttonRadius}
        segments={providerGlowSegments[provider]}
      />
      <BlurView
        intensity={12}
        style={[
          styles.socialButtonBlur,
          { borderRadius: buttonRadius, minHeight: buttonHeight },
        ]}
        tint="dark"
      >
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.038)',
            'rgba(15,23,47,0.19)',
            'rgba(5,10,24,0.28)',
          ]}
          end={{ x: 1, y: 1 }}
          locations={[0, 0.54, 1]}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.18)',
            'rgba(255,255,255,0.028)',
            'rgba(255,255,255,0)',
          ]}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={styles.buttonSheen}
        />
        <View style={[styles.buttonRow, { minHeight: buttonHeight }]}>
          <View style={styles.sideSlot}>
            {loading ? <ActivityIndicator color="#F5F8FF" /> : null}
            {!loading ? <ProviderGlyph provider={provider} /> : null}
          </View>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.86}
            numberOfLines={1}
            style={[
              styles.socialButtonText,
              compact && styles.socialButtonTextCompact,
            ]}
          >
            {title}
          </Text>
          <View style={styles.sideSlot} />
        </View>
      </BlurView>
    </Pressable>
  );
}

function ProviderGlyph({ provider }: { provider: LoginProvider }) {
  if (provider === 'facebook') {
    return (
      <View style={[styles.providerIcon, styles.facebookIcon]}>
        <Text style={styles.facebookGlyph}>f</Text>
      </View>
    );
  }

  if (provider === 'tiktok') {
    return (
      <View style={[styles.providerIcon, styles.tiktokIcon]}>
        <Text style={[styles.tiktokGlyph, styles.tiktokCyan]}>♪</Text>
        <Text style={[styles.tiktokGlyph, styles.tiktokPink]}>♪</Text>
        <Text style={styles.tiktokGlyph}>♪</Text>
      </View>
    );
  }

  return (
    <View style={[styles.providerIcon, styles.googleIcon]}>
      <Text style={styles.googleGlyph}>G</Text>
      <View
        pointerEvents="none"
        style={[styles.googleAccent, styles.googleRed]}
      />
      <View
        pointerEvents="none"
        style={[styles.googleAccent, styles.googleYellow]}
      />
      <View
        pointerEvents="none"
        style={[styles.googleAccent, styles.googleGreen]}
      />
    </View>
  );
}

function getFriendlyAuthError(provider: OAuthProvider, error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('cancel'))
    return 'Đăng nhập đã bị hủy. Bạn có thể thử lại bất cứ lúc nào.';
  if (message.includes('network'))
    return 'Kết nối mạng không ổn định. Vui lòng kiểm tra và thử lại.';
  if (provider === 'facebook')
    return 'Không thể đăng nhập bằng Facebook. Vui lòng thử lại.';
  return 'Không thể đăng nhập bằng Google. Vui lòng thử lại.';
}

const styles = StyleSheet.create({
  authMessage: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,111,159,0.12)',
    borderColor: 'rgba(255,160,194,0.18)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 11,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  authMessageText: {
    color: '#FFD7E4',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    textAlign: 'center',
  },
  authStack: { gap: 7, marginTop: 12 },
  bottomStack: {
    alignSelf: 'center',
    maxWidth: 348,
    paddingHorizontal: 31,
    width: '100%',
    zIndex: 2,
  },
  buttonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    width: '100%',
    zIndex: 2,
  },
  buttonSheen: {
    bottom: 0,
    left: -16,
    opacity: 0.075,
    position: 'absolute',
    right: -16,
    top: -16,
  },
  consentLink: {
    color: '#9F66EA',
    fontWeight: '800',
    textShadowColor: 'rgba(181,104,255,0.1)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 2,
  },
  consentText: {
    color: 'rgba(220,226,248,0.53)',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17.5,
    marginTop: 12,
    textAlign: 'center',
  },
  content: {
    flexGrow: 1,
    paddingTop: 0,
  },
  copyBlock: {
    alignItems: 'center',
  },
  deepAtmosphere: {
    backgroundColor: 'rgba(118,72,255,0.016)',
    borderRadius: 320,
    height: 520,
    left: -230,
    position: 'absolute',
    top: -150,
    width: 520,
  },
  disabled: { opacity: 0.58 },
  dividerLine: {
    backgroundColor: 'rgba(175,117,255,0.17)',
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 13,
  },
  dividerText: {
    color: 'rgba(222,227,248,0.49)',
    fontSize: 12.5,
    fontWeight: '600',
  },
  facebookGlyph: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 23,
    marginTop: -1,
  },
  facebookIcon: {
    backgroundColor: '#2078F4',
  },
  googleAccent: {
    borderRadius: 999,
    height: 3,
    position: 'absolute',
    width: 8.5,
  },
  googleGlyph: {
    color: '#4285F4',
    fontSize: 19.5,
    fontWeight: '900',
    lineHeight: 23,
    textShadowColor: 'rgba(255,255,255,0.28)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 3,
    zIndex: 2,
  },
  googleGreen: {
    backgroundColor: '#34A853',
    bottom: 7,
    left: 10,
    transform: [{ rotate: '-26deg' }],
  },
  googleIcon: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  googleRed: {
    backgroundColor: '#EA4335',
    right: 7,
    top: 8,
    transform: [{ rotate: '24deg' }],
  },
  googleYellow: {
    backgroundColor: '#FBBC04',
    bottom: 8,
    right: 7,
    transform: [{ rotate: '24deg' }],
  },
  heroBackdrop: {
    opacity: 0.78,
    position: 'absolute',
    top: 0,
  },
  heroStage: {
    position: 'relative',
    width: '100%',
  },
  heroSubtitle: {
    color: 'rgba(218,224,246,0.5)',
    fontWeight: '500',
    marginTop: 7,
    maxWidth: 276,
    textAlign: 'center',
  },
  heroTitle: {
    alignSelf: 'center',
    color: 'rgba(241,244,255,0.9)',
    fontWeight: '800',
    letterSpacing: -0.34,
    maxWidth: 304,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 5,
  },
  logoWrap: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 3,
  },
  longBottomBlend: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  previewArrow: {
    color: '#9F66EA',
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 26,
    marginLeft: 7,
  },
  previewLink: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 9,
    minHeight: 32,
    paddingHorizontal: 8,
  },
  previewLinkPressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  previewLinkText: {
    color: '#9F66EA',
    fontSize: 13.8,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  providerIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 29,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 29,
  },
  root: { backgroundColor: '#02050E', flex: 1 },
  safe: { flex: 1 },
  sideSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
  },
  socialButtonBlur: {
    backgroundColor: 'rgba(8,14,32,0.18)',
    borderColor: 'rgba(255,255,255,0.058)',
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  socialButtonHost: {
    overflow: 'visible',
    position: 'relative',
  },
  socialButtonText: {
    color: 'rgba(249,251,255,0.88)',
    flex: 1,
    fontSize: 14.6,
    fontWeight: '700',
    letterSpacing: -0.16,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.26)',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 3,
  },
  socialButtonTextCompact: {
    fontSize: 15.1,
  },
  tiktokCyan: {
    color: '#38F5FF',
    left: 10,
    opacity: 0.9,
    position: 'absolute',
    top: 2,
  },
  tiktokGlyph: {
    color: '#FFFFFF',
    fontSize: 19.5,
    fontWeight: '900',
    lineHeight: 30,
  },
  tiktokIcon: {
    backgroundColor: '#06070B',
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tiktokPink: {
    color: '#FF2C78',
    left: 13,
    opacity: 0.9,
    position: 'absolute',
    top: 5,
  },
  topScrim: {
    height: 150,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
