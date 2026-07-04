import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const heroImage = require('../../assets/anh_mau2/liqi-login-hero.png');
const BASE_WIDTH = 393;

type FeatureIconType = 'shield' | 'mic' | 'target';
type SocialType = 'chat' | 'apple' | 'phone';

const features: { icon: FeatureIconType; title: string; subtitle: string }[] = [
  { icon: 'shield', title: 'Thật', subtitle: 'Xác thực' },
  { icon: 'mic', title: 'Voice', subtitle: 'Chat nhanh' },
  { icon: 'target', title: 'Ghép', subtitle: 'Cân lực' },
];

const socials: { kind: SocialType; label: string }[] = [
  { kind: 'chat', label: 'WeChat' },
  { kind: 'apple', label: 'Apple' },
  { kind: 'phone', label: 'Số điện thoại' },
];

function FeatureIcon({ type }: { type: FeatureIconType }) {
  if (type === 'mic') {
    return (
      <View style={styles.featureIconShell}>
        <View style={styles.micHead} />
        <View style={styles.micStem} />
        <View style={styles.micBase} />
      </View>
    );
  }

  if (type === 'target') {
    return (
      <View style={styles.featureIconShell}>
        <View style={styles.targetOuter}>
          <View style={styles.targetInner}>
            <View style={styles.targetDot} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.featureIconShell}>
      <View style={styles.shield}>
        <View style={styles.checkLong} />
        <View style={styles.checkShort} />
      </View>
    </View>
  );
}

function SocialIcon({ kind }: { kind: SocialType }) {
  if (kind === 'chat') {
    return (
      <View style={[styles.socialCircle, styles.chatCircle]}>
        <View style={styles.chatBubbleBack} />
        <View style={styles.chatBubbleFront}>
          <View style={styles.chatDot} />
          <View style={styles.chatDot} />
        </View>
      </View>
    );
  }

  if (kind === 'phone') {
    return (
      <View style={[styles.socialCircle, styles.phoneCircle]}>
        <View style={styles.phoneGlyph}>
          <View style={styles.phoneHome} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.socialCircle, styles.appleCircle]}>
      <View style={styles.appleBody} />
      <View style={styles.appleBite} />
      <View style={styles.appleLeaf} />
    </View>
  );
}

export default function LoginScreen() {
  const { width, height } = useWindowDimensions();
  const [phone, setPhone] = useState('');
  const [accepted, setAccepted] = useState(false);

  const scale = useMemo(
    () => Math.max(0.9, Math.min(width / BASE_WIDTH, 1.08)),
    [width],
  );
  const compact = height < 790;
  const horizontal = 18 * scale;

  const handleLogin = () => {
    router.push('/rank');
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#050817', '#020611', '#01040B']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glow, styles.glowLeft]} />
      <View style={[styles.glow, styles.glowRight]} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={[
              styles.content,
              {
                paddingBottom: compact ? 6 : 8,
                paddingHorizontal: horizontal,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[styles.brandBlock, compact && styles.brandBlockCompact]}
            >
              <View accessibilityLabel="Liqi Match" style={styles.logoRow}>
                <Text style={[styles.logoLiqi, { fontSize: 39 * scale }]}>
                  Liqi
                </Text>
                <Text style={[styles.logoMatch, { fontSize: 39 * scale }]}>
                  {' '}
                  Match
                </Text>
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
                    'rgba(2,6,17,0.02)',
                    'rgba(2,6,17,0)',
                    'rgba(2,6,17,0.4)',
                  ]}
                  locations={[0, 0.66, 1]}
                  pointerEvents="none"
                  style={StyleSheet.absoluteFill}
                />
              </ImageBackground>
            </View>

            <View style={styles.featureCard}>
              {features.map((feature, index) => (
                <View key={feature.title} style={styles.featureItem}>
                  {index > 0 ? <View style={styles.featureDivider} /> : null}
                  <FeatureIcon type={feature.icon} />
                  <View style={styles.featureCopy}>
                    <Text numberOfLines={1} style={styles.featureTitle}>
                      {feature.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.featureSubtitle}>
                      {feature.subtitle}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.phoneField}>
              <Pressable accessibilityRole="button" style={styles.countryCode}>
                <Text style={styles.countryText}>+86</Text>
                <Text style={styles.chevron}>⌄</Text>
              </Pressable>
              <View style={styles.fieldDivider} />
              <TextInput
                accessibilityLabel="Nhập số điện thoại"
                keyboardType="phone-pad"
                maxLength={18}
                onChangeText={setPhone}
                placeholder="Nhập số điện thoại"
                placeholderTextColor="#6F778C"
                selectionColor="#9954FF"
                style={styles.input}
                value={phone}
              />
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={handleLogin}
              >
                <Text style={styles.codeText}>Lấy mã</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityLabel="Đăng nhập ngay"
              accessibilityRole="button"
              onPress={handleLogin}
              style={({ pressed }) => [
                styles.loginButtonWrap,
                pressed && styles.buttonPressed,
              ]}
            >
              <LinearGradient
                colors={['#B22EFF', '#6A43FF', '#1767FF']}
                end={{ x: 1, y: 0.6 }}
                start={{ x: 0, y: 0.4 }}
                style={styles.loginButton}
              >
                <Text style={styles.sparkle}>✦</Text>
                <View style={styles.loginCenter}>
                  <Text numberOfLines={1} style={styles.loginText}>
                    Đăng nhập
                  </Text>
                  <View style={styles.arrowBadge}>
                    <Text style={styles.arrow}>→</Text>
                  </View>
                </View>
                <Text style={styles.sparkle}>✦</Text>
              </LinearGradient>
            </Pressable>

            <View style={styles.separatorRow}>
              <View style={styles.separator} />
              <Text style={styles.separatorText}>Cách đăng nhập khác</Text>
              <View style={styles.separator} />
            </View>

            <View style={styles.socialRow}>
              {socials.map((social) => (
                <Pressable
                  accessibilityLabel={`Đăng nhập bằng ${social.label}`}
                  accessibilityRole="button"
                  key={social.label}
                  style={({ pressed }) => [
                    styles.socialOption,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <SocialIcon kind={social.kind} />
                  <Text numberOfLines={1} style={styles.socialLabel}>
                    {social.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              onPress={() => setAccepted((value) => !value)}
              style={styles.agreementRow}
            >
              <View
                style={[styles.checkbox, accepted && styles.checkboxChecked]}
              >
                {accepted ? <View style={styles.checkboxTick} /> : null}
              </View>
              <Text style={styles.agreementText}>Tôi đã đọc và đồng ý </Text>
              <Text style={styles.agreementLink}>Điều khoản</Text>
              <Text style={styles.agreementText}> và </Text>
              <Text style={styles.agreementLink}>Quyền riêng tư</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
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
  flex: {
    flex: 1,
  },
  content: {
    alignItems: 'stretch',
    flexGrow: 1,
  },
  glow: {
    borderRadius: 190,
    height: 380,
    opacity: 0.16,
    position: 'absolute',
    transform: [{ scaleY: 0.42 }, { rotate: '-18deg' }],
    width: 380,
  },
  glowLeft: {
    backgroundColor: '#762CFF',
    bottom: 90,
    left: -270,
  },
  glowRight: {
    backgroundColor: '#2258FF',
    bottom: 250,
    right: -290,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 10,
  },
  brandBlockCompact: {
    marginBottom: 6,
    marginTop: 2,
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
    textShadowColor: 'rgba(132,68,255,0.9)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 18,
    transform: [{ skewX: '-7deg' }],
  },
  logoMatch: {
    color: '#F8F8FC',
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(255,255,255,0.22)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 8,
    transform: [{ skewX: '-7deg' }],
  },
  taglineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 4,
  },
  tagline: {
    color: '#D6D7E2',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginHorizontal: 11,
    textShadowColor: 'rgba(160,126,255,0.3)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 6,
  },
  taglineDash: {
    borderRadius: 2,
    height: 2,
    width: 13,
  },
  heroFrame: {
    backgroundColor: '#080C1C',
    borderColor: 'rgba(135,143,210,0.16)',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#1F3CFF',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
  },
  hero: {
    aspectRatio: 548 / 410,
    justifyContent: 'flex-end',
    width: '100%',
  },
  heroImage: {
    borderRadius: 18,
  },
  featureCard: {
    backgroundColor: 'rgba(13,19,38,0.97)',
    borderColor: 'rgba(167,178,226,0.24)',
    borderRadius: 17,
    borderWidth: 1,
    elevation: 8,
    flexDirection: 'row',
    marginTop: 7,
    minHeight: 66,
    paddingHorizontal: 8,
    paddingVertical: 9,
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
  },
  featureItem: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
    paddingHorizontal: 8,
    position: 'relative',
  },
  featureDivider: {
    backgroundColor: 'rgba(151,162,195,0.18)',
    bottom: 8,
    left: 0,
    position: 'absolute',
    top: 8,
    width: StyleSheet.hairlineWidth,
  },
  featureIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(113,55,255,0.18)',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    marginRight: 7,
    shadowColor: '#A63CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    width: 32,
  },
  shield: {
    alignItems: 'center',
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    borderColor: '#7257FF',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderWidth: 1.7,
    height: 23,
    justifyContent: 'center',
    transform: [{ scaleX: 0.92 }],
    width: 20,
  },
  checkLong: {
    backgroundColor: '#A99BFF',
    borderRadius: 1,
    height: 2,
    position: 'absolute',
    transform: [{ rotate: '-45deg' }, { translateX: 2 }],
    width: 10,
  },
  checkShort: {
    backgroundColor: '#A99BFF',
    borderRadius: 1,
    height: 2,
    position: 'absolute',
    transform: [{ rotate: '45deg' }, { translateX: -4 }, { translateY: 2 }],
    width: 6,
  },
  micHead: {
    borderColor: '#9B56FF',
    borderRadius: 6,
    borderWidth: 1.7,
    height: 17,
    width: 9,
  },
  micStem: {
    backgroundColor: '#9B56FF',
    height: 6,
    width: 1.7,
  },
  micBase: {
    backgroundColor: '#9B56FF',
    borderRadius: 1,
    height: 1.7,
    width: 12,
  },
  targetOuter: {
    alignItems: 'center',
    borderColor: '#5C72FF',
    borderRadius: 12,
    borderWidth: 1.5,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  targetInner: {
    alignItems: 'center',
    borderColor: '#7E49FF',
    borderRadius: 7,
    borderWidth: 1.5,
    height: 13,
    justifyContent: 'center',
    width: 13,
  },
  targetDot: {
    backgroundColor: '#A966FF',
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  featureCopy: {
    flex: 1,
    minWidth: 0,
  },
  featureTitle: {
    color: '#F6F7FC',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  featureSubtitle: {
    color: '#9BA3B7',
    fontSize: 10.5,
    marginTop: 3,
  },
  phoneField: {
    alignItems: 'center',
    backgroundColor: 'rgba(9,14,27,0.92)',
    borderColor: 'rgba(178,188,232,0.38)',
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    height: 54,
    marginTop: 14,
    paddingHorizontal: 16,
  },
  countryCode: {
    alignItems: 'center',
    flexDirection: 'row',
    height: '100%',
  },
  countryText: {
    color: '#F0F2F8',
    fontSize: 15.5,
    fontWeight: '500',
  },
  chevron: {
    color: '#858DA1',
    fontSize: 16,
    marginLeft: 8,
    marginTop: -4,
  },
  fieldDivider: {
    backgroundColor: '#343B4D',
    height: 24,
    marginHorizontal: 13,
    width: StyleSheet.hairlineWidth,
  },
  input: {
    color: '#F6F7FC',
    flex: 1,
    fontSize: 15.5,
    height: '100%',
    minWidth: 0,
    paddingVertical: 0,
  },
  codeText: {
    color: '#8B68FF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  loginButtonWrap: {
    borderRadius: 30,
    elevation: 12,
    marginTop: 14,
    shadowColor: '#5E38FF',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.84,
    shadowRadius: 30,
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.992 }],
  },
  loginButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.34)',
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    height: 56,
    justifyContent: 'space-between',
    paddingHorizontal: 19,
  },
  loginCenter: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  loginText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(255,255,255,0.28)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 8,
  },
  arrowBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 14,
    height: 27,
    justifyContent: 'center',
    marginLeft: 11,
    width: 27,
  },
  arrow: {
    color: '#5A4DDA',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: -1,
  },
  sparkle: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 13,
  },
  separatorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
    marginTop: 16,
  },
  separator: {
    backgroundColor: 'rgba(116,124,147,0.2)',
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  separatorText: {
    color: '#858CA0',
    fontSize: 12.5,
    letterSpacing: 0.6,
    marginHorizontal: 16,
  },
  socialRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  socialOption: {
    alignItems: 'center',
    width: 92,
  },
  socialCircle: {
    alignItems: 'center',
    borderRadius: 27,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  chatCircle: {
    backgroundColor: 'rgba(36,139,83,0.13)',
    borderColor: 'rgba(75,207,127,0.22)',
  },
  appleCircle: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderColor: 'rgba(255,255,255,0.13)',
  },
  phoneCircle: {
    backgroundColor: 'rgba(113,55,255,0.12)',
    borderColor: 'rgba(147,87,255,0.22)',
  },
  chatBubbleBack: {
    backgroundColor: '#3CBF69',
    borderRadius: 8,
    bottom: 12,
    height: 14,
    position: 'absolute',
    right: 11,
    width: 18,
  },
  chatBubbleFront: {
    alignItems: 'center',
    backgroundColor: '#4BD87A',
    borderRadius: 10,
    flexDirection: 'row',
    height: 17,
    justifyContent: 'center',
    transform: [{ translateX: -3 }, { translateY: -2 }],
    width: 23,
  },
  chatDot: {
    backgroundColor: '#052E16',
    borderRadius: 1.5,
    height: 3,
    marginHorizontal: 1.5,
    width: 3,
  },
  appleBody: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    height: 25,
    transform: [{ scaleX: 0.86 }],
    width: 22,
  },
  appleBite: {
    backgroundColor: '#101522',
    borderRadius: 6,
    height: 11,
    position: 'absolute',
    right: 13,
    top: 21,
    width: 11,
  },
  appleLeaf: {
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
    height: 5,
    position: 'absolute',
    right: 20,
    top: 11,
    transform: [{ rotate: '-28deg' }],
    width: 9,
  },
  phoneGlyph: {
    alignItems: 'center',
    borderColor: '#9664FF',
    borderRadius: 3,
    borderWidth: 2,
    height: 27,
    justifyContent: 'flex-end',
    paddingBottom: 2,
    width: 17,
  },
  phoneHome: {
    backgroundColor: '#9664FF',
    borderRadius: 1,
    height: 2,
    width: 4,
  },
  socialLabel: {
    color: '#AEB4C4',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
  },
  agreementRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 25,
    paddingHorizontal: 5,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: '#5D6577',
    borderRadius: 8,
    borderWidth: 1,
    height: 16,
    justifyContent: 'center',
    marginRight: 6,
    width: 16,
  },
  checkboxChecked: {
    backgroundColor: '#7444FF',
    borderColor: '#9A75FF',
  },
  checkboxTick: {
    borderBottomColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderLeftColor: '#FFFFFF',
    borderLeftWidth: 2,
    height: 5,
    transform: [{ rotate: '-45deg' }, { translateY: -1 }],
    width: 9,
  },
  agreementText: {
    color: '#7B8395',
    fontSize: 11.2,
  },
  agreementLink: {
    color: '#8B55FF',
    fontSize: 11.2,
    fontWeight: '700',
  },
});
