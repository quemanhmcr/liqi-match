import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OAuthProvider } from '@/shared/auth/auth-service';
import { useAuth } from '@/shared/auth/auth-context';
import { hasCompletedOnboarding } from '@/features/onboarding/profile-service';

type LoginProvider = OAuthProvider | 'tiktok';

const legalLinks = {
  privacy: 'https://liqimatch.app/privacy',
  terms: 'https://liqimatch.app/terms',
};

export default function LoginScreen() {
  const { loading, session, signIn } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function routeExistingSession() {
      if (loading || !session) return;
      const completed = await hasCompletedOnboarding(session).catch(() => false);
      if (!active) return;
      router.replace(completed ? '/home' : '/rank');
    }

    routeExistingSession();
    return () => {
      active = false;
    };
  }, [loading, session]);

  const startOAuth = async (provider: LoginProvider) => {
    if (provider === 'tiktok') {
      setAuthMessage('TikTok OAuth sẽ được kết nối sau. Hiện hãy dùng Google hoặc Facebook.');
      return;
    }

    if (loadingProvider) return;
    setAuthMessage(null);
    setLoadingProvider(provider);

    try {
      const nextSession = await signIn(provider);
      const completed = await hasCompletedOnboarding(nextSession).catch(() => false);
      router.replace(completed ? '/home' : '/rank');
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

  const authDisabled = loading || Boolean(loadingProvider);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#050817', '#020611', '#01040B']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glow, styles.glowLeft]} />
      <View style={[styles.glow, styles.glowRight]} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.brandBlock}>
            <Text accessibilityRole="header" style={styles.logo}>
              <Text style={styles.logoAccent}>Liqi</Text> Match
            </Text>
            <Text style={styles.tagline}>Match chuẩn, leo rank nhẹ</Text>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>TÌM ĐỒNG ĐỘI LIÊN QUÂN</Text>
            <Text style={styles.heroTitle}>Ghép đội theo rank, lane, tướng tủ và thói quen chơi.</Text>
            <View style={styles.trustRow}>
              <TrustPill label="Người thật" />
              <TrustPill label="Voice nhanh" />
              <TrustPill label="Ghép chuẩn" />
            </View>
          </View>

          <View style={styles.authCard}>
            <SocialAuthButton
              disabled={authDisabled}
              loading={loadingProvider === 'google'}
              onPress={() => startOAuth('google')}
              primary
              title="Tiếp tục với Google"
            />
            <View style={styles.secondaryRow}>
              <SocialAuthButton
                disabled={authDisabled}
                loading={loadingProvider === 'facebook'}
                onPress={() => startOAuth('facebook')}
                title="Facebook"
              />
              <SocialAuthButton
                disabled={authDisabled}
                loading={loadingProvider === 'tiktok'}
                onPress={() => startOAuth('tiktok')}
                title="TikTok"
              />
            </View>

            <Text style={styles.consentText}>
              Bằng việc tiếp tục, bạn đồng ý với{' '}
              <Text onPress={() => openLegalLink(legalLinks.terms)} style={styles.consentLink}>
                Điều khoản sử dụng
              </Text>{' '}
              và{' '}
              <Text onPress={() => openLegalLink(legalLinks.privacy)} style={styles.consentLink}>
                Chính sách quyền riêng tư
              </Text>
              .
            </Text>

            {authMessage ? (
              <View accessibilityLiveRegion="polite" style={styles.authMessage}>
                <Text style={styles.authMessageText}>{authMessage}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function SocialAuthButton({
  disabled,
  loading,
  onPress,
  primary = false,
  title,
}: {
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
  primary?: boolean;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.socialButton,
        primary ? styles.primaryButton : styles.secondaryButton,
        pressed && !disabled && styles.pressed,
        disabled && !loading && styles.disabled,
      ]}
    >
      {loading ? <ActivityIndicator color={primary ? '#10131F' : '#EAF0FF'} /> : null}
      {!loading ? <Text style={primary ? styles.primaryIcon : styles.secondaryIcon}>{title[0]}</Text> : null}
      <Text style={primary ? styles.primaryText : styles.secondaryText}>{title}</Text>
      {primary ? <Text style={styles.arrow}>→</Text> : null}
    </Pressable>
  );
}

function TrustPill({ label }: { label: string }) {
  return (
    <View style={styles.trustPill}>
      <Text style={styles.trustText}>{label}</Text>
    </View>
  );
}

function getFriendlyAuthError(provider: OAuthProvider, error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('cancel')) return 'Đăng nhập đã bị hủy. Bạn có thể thử lại bất cứ lúc nào.';
  if (message.includes('network')) return 'Kết nối mạng không ổn định. Vui lòng kiểm tra và thử lại.';
  if (provider === 'facebook') return 'Không thể đăng nhập bằng Facebook. Vui lòng thử lại.';
  return 'Không thể đăng nhập bằng Google. Vui lòng thử lại.';
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#020611', flex: 1 },
  safe: { flex: 1 },
  content: { flex: 1, justifyContent: 'space-between', padding: 20 },
  glow: { borderRadius: 999, opacity: 0.22, position: 'absolute' },
  glowLeft: { backgroundColor: '#7B2DFF', height: 320, left: -180, top: 120, width: 320 },
  glowRight: { backgroundColor: '#126CFF', bottom: 40, height: 280, right: -170, width: 280 },
  brandBlock: { alignItems: 'center', marginTop: 18 },
  logo: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  logoAccent: { color: '#D662FF' },
  tagline: { color: '#B8C0D8', fontSize: 15, marginTop: 8 },
  heroCard: {
    backgroundColor: 'rgba(16,22,43,0.78)',
    borderColor: 'rgba(181,195,255,0.14)',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
  },
  heroEyebrow: { color: '#A9B4D8', fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  heroTitle: { color: '#F6F8FF', fontSize: 26, fontWeight: '900', lineHeight: 34, marginTop: 14 },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  trustPill: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  trustText: { color: '#E7EBFF', fontSize: 12, fontWeight: '700' },
  authCard: { gap: 12 },
  socialButton: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', gap: 12, minHeight: 58, paddingHorizontal: 16 },
  primaryButton: { backgroundColor: '#FFFFFF' },
  secondaryButton: { backgroundColor: 'rgba(18,25,49,0.94)', flex: 1 },
  secondaryRow: { flexDirection: 'row', gap: 12 },
  primaryIcon: { color: '#20232B', fontSize: 18, fontWeight: '900' },
  secondaryIcon: { color: '#EAF0FF', fontSize: 18, fontWeight: '900' },
  primaryText: { color: '#151923', flex: 1, fontSize: 16, fontWeight: '900' },
  secondaryText: { color: '#EAF0FF', flex: 1, fontSize: 15, fontWeight: '800' },
  arrow: { color: '#151923', fontSize: 23, fontWeight: '900' },
  consentText: { color: '#8E96AE', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  consentLink: { color: '#D7A6FF', fontWeight: '800' },
  authMessage: { backgroundColor: 'rgba(255,111,159,0.14)', borderRadius: 14, padding: 12 },
  authMessageText: { color: '#FFD7E4', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.7 },
});
