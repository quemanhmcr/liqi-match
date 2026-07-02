import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DESIGN_WIDTH = 393;

type RankId =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'veteran'
  | 'master'
  | 'grandmaster-iv'
  | 'grandmaster-iii'
  | 'grandmaster-ii'
  | 'grandmaster-i'
  | 'conqueror'
  | 'legendary';

type RankItem = {
  id: RankId;
  name: string;
  detail?: string;
  icon: ImageSourcePropType;
};

const ranks: RankItem[] = [
  { id: 'bronze', name: 'Đồng', icon: require('../../assets/anh_mau2/ranks/bronze.png') },
  { id: 'silver', name: 'Bạc', icon: require('../../assets/anh_mau2/ranks/silver.png') },
  { id: 'gold', name: 'Vàng', icon: require('../../assets/anh_mau2/ranks/gold.png') },
  { id: 'platinum', name: 'Bạch Kim', icon: require('../../assets/anh_mau2/ranks/platinum.png') },
  {
    id: 'diamond',
    name: 'Kim Cương',
    icon: require('../../assets/anh_mau2/ranks/diamond.png'),
  },
  { id: 'veteran', name: 'Tinh Anh', icon: require('../../assets/anh_mau2/ranks/veteran.png') },
  { id: 'master', name: 'Cao Thủ', icon: require('../../assets/anh_mau2/ranks/master.png') },
  {
    id: 'grandmaster-iv',
    name: 'Đại Cao Thủ IV',
    detail: '10-19 sao',
    icon: require('../../assets/anh_mau2/ranks/grandmaster-iv.png'),
  },
  {
    id: 'grandmaster-iii',
    name: 'Đại Cao Thủ III',
    detail: '20-29 sao',
    icon: require('../../assets/anh_mau2/ranks/grandmaster-iii.png'),
  },
  {
    id: 'grandmaster-ii',
    name: 'Đại Cao Thủ II',
    detail: '30-39 sao',
    icon: require('../../assets/anh_mau2/ranks/grandmaster-ii.png'),
  },
  {
    id: 'grandmaster-i',
    name: 'Đại Cao Thủ I',
    detail: '40-49 sao',
    icon: require('../../assets/anh_mau2/ranks/grandmaster-i.png'),
  },
  {
    id: 'conqueror',
    name: 'Chiến Tướng',
    detail: '50-99 sao',
    icon: require('../../assets/anh_mau2/ranks/conqueror.png'),
  },
  {
    id: 'legendary',
    name: 'Chiến Thần',
    detail: '100+ sao',
    icon: require('../../assets/anh_mau2/ranks/legendary.png'),
  },
];

function CheckIcon() {
  return (
    <View style={styles.checkBubble}>
      <View style={styles.checkLong} />
      <View style={styles.checkShort} />
    </View>
  );
}

function RankRow({
  item,
  onPress,
  selected,
}: {
  item: RankItem;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${item.name}${item.detail ? `, ${item.detail}` : ''}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.rankRowPressable, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={selected ? ['#23104D', '#101833'] : ['#10172D', '#090F20']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.rankRow, selected && styles.rankRowSelected]}
      >
        <View style={styles.rankThumbShell}>
          <Image resizeMode="contain" source={item.icon} style={styles.rankThumb} />
        </View>
        <View style={styles.rankRowCopy}>
          <Text numberOfLines={1} style={styles.rankRowName}>
            {item.name}
          </Text>
          <Text numberOfLines={1} style={styles.rankRowDetail}>
            {item.detail ? `★ ${item.detail}` : 'Rank hiện tại'}
          </Text>
        </View>
        {selected ? <CheckIcon /> : <View style={styles.rowChevron} />}
      </LinearGradient>
    </Pressable>
  );
}

export default function RankSelectionScreen() {
  const { height, width } = useWindowDimensions();
  const [selectedId, setSelectedId] = useState<RankId>('master');
  const [canSelect, setCanSelect] = useState(false);

  const pagePadding = width < 370 ? 14 : 18;
  const contentMaxWidth = Math.min(width, 430);
  const uiScale = Math.max(0.9, Math.min(width / DESIGN_WIDTH, 1.08));
  const compact = height < 840;

  const selectedRank = useMemo(
    () => ranks.find((rank) => rank.id === selectedId) ?? ranks[6]!,
    [selectedId],
  );

  useEffect(() => {
    const timer = setTimeout(() => setCanSelect(true), 1100);
    return () => clearTimeout(timer);
  }, []);

  const submit = () => {
    router.push('/lane');
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#080B19', '#030714', '#01040C']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.ambientGlow, styles.glowPurple]} />
      <View style={[styles.ambientGlow, styles.glowBlue]} />
      <View style={styles.topVignette} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <View style={[styles.frame, { paddingHorizontal: pagePadding, width: contentMaxWidth }]}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityLabel="Quay lại"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, pressed && styles.controlPressed]}
            >
              <Text style={styles.backGlyph}>‹</Text>
            </Pressable>

            <View pointerEvents="none" style={styles.brandRow}>
              <Text style={[styles.brandLiqi, { fontSize: 25 * uiScale }]}>Liqi</Text>
              <Text style={[styles.brandMatch, { fontSize: 25 * uiScale }]}> Match</Text>
            </View>

            <View style={styles.progressPill}>
              <Text style={styles.progressText}>1/3</Text>
              <LinearGradient
                colors={['#AF3FFF', '#684BFF']}
                end={{ x: 1, y: 0 }}
                start={{ x: 0, y: 0 }}
                style={styles.progressLine}
              />
            </View>
          </View>

          <View style={[styles.heroCopy, compact && styles.heroCopyCompact]}>
            <Text style={[styles.title, { fontSize: (compact ? 24 : 27) * uiScale }]}>
              Chọn <Text style={styles.titleAccent}>mức rank</Text> hiện tại
            </Text>
            <Text style={styles.subtitle}>Rank càng chuẩn, đề xuất đồng đội càng khớp.</Text>
          </View>

          <LinearGradient
            colors={['rgba(42,20,91,0.98)', 'rgba(13,20,43,0.98)', 'rgba(8,13,28,0.98)']}
            locations={[0, 0.48, 1]}
            style={[styles.previewCard, compact && styles.previewCardCompact]}
          >
            <View style={styles.previewGlow} />
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>Đang chọn</Text>
            </View>
            <Image
              resizeMode="contain"
              source={selectedRank.icon}
              style={[styles.previewIcon, compact && styles.previewIconCompact]}
            />
            <Text numberOfLines={1} style={styles.previewName}>
              {selectedRank.name}
            </Text>
            <Text style={styles.previewDetail}>
              {selectedRank.detail ? `★ ${selectedRank.detail}` : 'Mức rank phù hợp để bắt đầu ghép đội'}
            </Text>
          </LinearGradient>

          <View style={styles.listPanel}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Danh sách rank</Text>
              <Text style={styles.listHint}>Vuốt để xem thêm</Text>
            </View>
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.rankListContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {ranks.map((rank) => (
                <RankRow
                  item={rank}
                  key={rank.id}
                  onPress={() => {
                    if (canSelect) {
                      setSelectedId(rank.id);
                    }
                  }}
                  selected={rank.id === selectedId}
                />
              ))}
            </ScrollView>
          </View>

          <Pressable
            accessibilityLabel="Tiếp tục"
            accessibilityRole="button"
            onPress={submit}
            style={({ pressed }) => [styles.ctaShell, pressed && styles.ctaPressed]}
          >
            <LinearGradient
              colors={['#B336EC', '#6A3CFF', '#246EFF']}
              end={{ x: 1, y: 0.5 }}
              locations={[0, 0.52, 1]}
              start={{ x: 0, y: 0.5 }}
              style={styles.cta}
            >
              <Text style={styles.ctaSpark}>✦</Text>
              <View style={styles.ctaCenter}>
                <Text style={styles.ctaText}>Tiếp tục</Text>
                <View style={styles.arrowBubble}>
                  <Text style={styles.arrow}>→</Text>
                </View>
              </View>
              <Text style={styles.ctaSpark}>✦</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: '#020611',
    flex: 1,
  },
  safe: {
    alignItems: 'center',
    flex: 1,
    width: '100%',
  },
  frame: {
    alignSelf: 'center',
    flex: 1,
  },
  ambientGlow: {
    borderRadius: 999,
    opacity: 0.18,
    position: 'absolute',
  },
  glowPurple: {
    backgroundColor: '#6B1FFF',
    bottom: 120,
    height: 360,
    left: -245,
    transform: [{ scaleY: 1.8 }, { rotate: '-10deg' }],
    width: 360,
  },
  glowBlue: {
    backgroundColor: '#135DFF',
    bottom: -25,
    height: 380,
    right: -275,
    transform: [{ scaleY: 1.7 }, { rotate: '14deg' }],
    width: 380,
  },
  topVignette: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    height: 200,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 54,
    justifyContent: 'space-between',
    marginTop: 2,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,23,43,0.82)',
    borderColor: 'rgba(145,154,192,0.12)',
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  controlPressed: {
    opacity: 0.68,
    transform: [{ scale: 0.96 }],
  },
  backGlyph: {
    color: '#D8DCE9',
    fontSize: 41,
    fontWeight: '200',
    lineHeight: 42,
    marginTop: -4,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    left: 52,
    position: 'absolute',
    right: 52,
  },
  brandLiqi: {
    color: '#9D4EFF',
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(142,66,255,0.65)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 10,
  },
  brandMatch: {
    color: '#F5F6FB',
    fontStyle: 'italic',
    fontWeight: '800',
    letterSpacing: 0,
  },
  progressPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,21,42,0.74)',
    borderColor: 'rgba(126,136,178,0.12)',
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
    height: 46,
    justifyContent: 'center',
    width: 52,
  },
  progressText: {
    color: '#C789FF',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  progressLine: {
    borderRadius: 2,
    height: 2.5,
    marginTop: 5,
    shadowColor: '#A73DFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    width: 22,
  },
  heroCopy: {
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 12,
  },
  heroCopyCompact: {
    marginBottom: 8,
    marginTop: 8,
  },
  title: {
    color: '#F8F9FF',
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
  },
  titleAccent: {
    color: '#A55AFF',
    fontStyle: 'italic',
  },
  subtitle: {
    color: '#A4A9B9',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    textAlign: 'center',
  },
  previewCard: {
    alignItems: 'center',
    borderColor: 'rgba(179,138,255,0.45)',
    borderRadius: 22,
    borderWidth: 1,
    height: 225,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#8D3CFF',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
  },
  previewCardCompact: {
    height: 196,
  },
  previewGlow: {
    backgroundColor: 'rgba(151,64,255,0.22)',
    borderRadius: 120,
    height: 190,
    position: 'absolute',
    top: 6,
    width: 240,
  },
  previewBadge: {
    backgroundColor: 'rgba(139,80,255,0.22)',
    borderColor: 'rgba(199,158,255,0.42)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    position: 'absolute',
    right: 16,
    top: 14,
  },
  previewBadgeText: {
    color: '#CBA8FF',
    fontSize: 11,
    fontWeight: '800',
  },
  previewIcon: {
    height: 125,
    width: 190,
  },
  previewIconCompact: {
    height: 108,
  },
  previewName: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 31,
    marginTop: -2,
    textShadowColor: 'rgba(202,126,255,0.55)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 10,
  },
  previewDetail: {
    color: '#BEC4D5',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  listPanel: {
    backgroundColor: 'rgba(8,13,28,0.72)',
    borderColor: 'rgba(116,129,184,0.18)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    marginTop: 10,
    minHeight: 190,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  listHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  listTitle: {
    color: '#F2F4FF',
    fontSize: 14,
    fontWeight: '900',
  },
  listHint: {
    color: '#7F869B',
    fontSize: 11,
    fontWeight: '600',
  },
  rankListContent: {
    paddingBottom: 10,
    rowGap: 8,
  },
  rankRowPressable: {
    borderRadius: 15,
  },
  rankRow: {
    alignItems: 'center',
    borderColor: 'rgba(121,133,177,0.2)',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    height: 64,
    paddingHorizontal: 10,
  },
  rankRowSelected: {
    borderColor: '#A84FFF',
    shadowColor: '#A84FFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.62,
    shadowRadius: 12,
  },
  rankThumbShell: {
    alignItems: 'center',
    height: 50,
    justifyContent: 'center',
    marginRight: 12,
    width: 54,
  },
  rankThumb: {
    height: 46,
    width: 54,
  },
  rankRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rankRowName: {
    color: '#F8F9FF',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  rankRowDetail: {
    color: '#9DA4B8',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 1,
  },
  checkBubble: {
    alignItems: 'center',
    backgroundColor: '#8750FF',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    shadowColor: '#B65CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 7,
    width: 24,
  },
  checkLong: {
    backgroundColor: '#16072E',
    borderRadius: 1.2,
    height: 2.4,
    position: 'absolute',
    transform: [{ rotate: '-45deg' }, { translateX: 2.5 }],
    width: 10,
  },
  checkShort: {
    backgroundColor: '#16072E',
    borderRadius: 1.2,
    height: 2.4,
    position: 'absolute',
    transform: [{ rotate: '45deg' }, { translateX: -4 }, { translateY: 2 }],
    width: 6,
  },
  rowChevron: {
    borderColor: 'rgba(157,167,204,0.44)',
    borderRadius: 9,
    borderWidth: 1,
    height: 18,
    width: 18,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }],
  },
  ctaShell: {
    borderRadius: 31,
    elevation: 10,
    height: 58,
    marginBottom: 4,
    marginTop: 10,
    shadowColor: '#654BFF',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.54,
    shadowRadius: 16,
  },
  ctaPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  cta: {
    alignItems: 'center',
    borderColor: 'rgba(195,185,255,0.66)',
    borderRadius: 31,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  ctaCenter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
  },
  arrowBubble: {
    alignItems: 'center',
    backgroundColor: 'rgba(230,234,255,0.86)',
    borderRadius: 14,
    height: 27,
    justifyContent: 'center',
    marginLeft: 10,
    width: 27,
  },
  arrow: {
    color: '#4B57D9',
    fontSize: 19,
    fontWeight: '500',
    lineHeight: 21,
    marginTop: -1,
  },
  ctaSpark: {
    color: 'rgba(220,215,255,0.84)',
    fontSize: 13,
  },
});
