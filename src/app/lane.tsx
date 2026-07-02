import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MAX_SELECTIONS = 2;

type LaneId = 'slayer' | 'jungle' | 'mid' | 'dragon' | 'support';
type LaneIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type Lane = {
  id: LaneId;
  name: string;
  subtitle: string;
  icon: LaneIcon;
  accent: [string, string];
};

const lanes: Lane[] = [
  {
    id: 'slayer',
    name: 'Đường Tà Thần',
    subtitle: 'Đấu sĩ · chống chịu',
    icon: 'sword-cross',
    accent: ['#B980FF', '#6D4AFF'],
  },
  {
    id: 'jungle',
    name: 'Đi Rừng',
    subtitle: 'Kiểm soát · tạo đột biến',
    icon: 'pine-tree',
    accent: ['#45E6C5', '#158E8D'],
  },
  {
    id: 'mid',
    name: 'Đường Giữa',
    subtitle: 'Pháp sư · đảo đường',
    icon: 'creation',
    accent: ['#75B8FF', '#5364FF'],
  },
  {
    id: 'dragon',
    name: 'Đường Rồng',
    subtitle: 'Xạ thủ · sát thương chủ lực',
    icon: 'target',
    accent: ['#FF7FC6', '#D94B8E'],
  },
  {
    id: 'support',
    name: 'Trợ Thủ',
    subtitle: 'Bảo kê · mở giao tranh',
    icon: 'shield-star',
    accent: ['#FFC970', '#D98A36'],
  },
];

function LaneCard({
  item,
  onPress,
  primary,
  selected,
}: {
  item: Lane;
  onPress: () => void;
  primary: boolean;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${item.name}, ${item.subtitle}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={
          selected
            ? ['rgba(105,57,223,0.42)', 'rgba(19,26,52,0.98)']
            : ['rgba(18,24,45,0.94)', 'rgba(8,13,28,0.98)']
        }
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.card, selected && styles.cardSelected]}
      >
        <View style={[styles.iconWrap, selected && { borderColor: item.accent[0] }]}>
          <LinearGradient colors={item.accent} style={styles.iconGradient}>
            <MaterialCommunityIcons color="#FFFFFF" name={item.icon} size={31} />
          </LinearGradient>
        </View>

        <View style={styles.cardCopy}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.cardTitle}>
              {item.name}
            </Text>
            {primary ? (
              <View style={styles.primaryPill}>
                <Text style={styles.primaryText}>Ưu tiên</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={styles.cardSubtitle}>
            {item.subtitle}
          </Text>
        </View>

        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected ? <MaterialCommunityIcons color="#FFFFFF" name="check" size={18} /> : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export default function LaneSelectionScreen() {
  const { height, width } = useWindowDimensions();
  const [selected, setSelected] = useState<LaneId[]>(['jungle']);
  const [canSelect, setCanSelect] = useState(false);

  const pageWidth = Math.min(width, 430);
  const pagePadding = width < 370 ? 15 : 19;
  const compact = height < 760;

  const selectedNames = useMemo(
    () => selected.map((id) => lanes.find((lane) => lane.id === id)?.name).filter(Boolean),
    [selected],
  );

  useEffect(() => {
    const timer = setTimeout(() => setCanSelect(true), 700);
    return () => clearTimeout(timer);
  }, []);

  const toggleLane = (id: LaneId) => {
    if (!canSelect) return;

    setSelected((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((item) => item !== id);
      }

      if (current.length >= MAX_SELECTIONS) {
        return [current[0]!, id];
      }

      return [...current, id];
    });
  };

  const submit = () => {
    Alert.alert('Đã lưu vị trí', selectedNames.join(' · '));
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#090B1A', '#040817', '#01040C']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glow, styles.glowLeft]} />
      <View style={[styles.glow, styles.glowRight]} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <View style={[styles.content, { paddingHorizontal: pagePadding, width: pageWidth }]}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityLabel="Quay lại"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons color="#DCE0EE" name="chevron-left" size={31} />
            </Pressable>

            <View pointerEvents="none" style={styles.brand}>
              <Text style={styles.brandLiqi}>Liqi</Text>
              <Text style={styles.brandMatch}> Match</Text>
            </View>

            <View style={styles.progressPill}>
              <Text style={styles.progressText}>2/3</Text>
              <View style={styles.progressTrack}>
                <LinearGradient colors={['#B63DFF', '#546BFF']} style={styles.progressFill} />
              </View>
            </View>
          </View>

          <View style={[styles.heading, compact && styles.headingCompact]}>
            <Text style={styles.eyebrow}>VỊ TRÍ SỞ TRƯỜNG</Text>
            <Text style={styles.title}>
              Bạn thường chơi ở <Text style={styles.titleAccent}>lane nào?</Text>
            </Text>
            <Text style={styles.subtitle}>
              Chọn tối đa 2 vị trí. Vị trí đầu tiên sẽ được ưu tiên khi hệ thống ghép đội.
            </Text>
          </View>

          <View style={styles.tipCard}>
            <View style={styles.tipIcon}>
              <MaterialCommunityIcons color="#D9B4FF" name="auto-fix" size={19} />
            </View>
            <Text style={styles.tipText}>
              Ghép đúng vai trò giúp đội hình cân bằng và giảm tranh lane.
            </Text>
          </View>

          <View style={styles.listPanel}>
            <ScrollView
              bounces={false}
              contentContainerStyle={[styles.listContent, compact && styles.listContentCompact]}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {lanes.map((lane) => (
                <LaneCard
                  item={lane}
                  key={lane.id}
                  onPress={() => toggleLane(lane.id)}
                  primary={selected[0] === lane.id}
                  selected={selected.includes(lane.id)}
                />
              ))}
            </ScrollView>
          </View>

          <View style={styles.selectionSummary}>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryLabel}>Đã chọn</Text>
              <Text numberOfLines={1} style={styles.summaryValue}>
                {selectedNames.join(' · ')}
              </Text>
            </View>
            <Text style={styles.count}>
              {selected.length}/{MAX_SELECTIONS}
            </Text>
          </View>

          <Pressable
            accessibilityLabel="Tiếp tục"
            accessibilityRole="button"
            onPress={submit}
            style={({ pressed }) => [styles.ctaShell, pressed && styles.ctaPressed]}
          >
            <LinearGradient
              colors={['#B632EC', '#6742FF', '#236EFF']}
              end={{ x: 1, y: 0.5 }}
              start={{ x: 0, y: 0.5 }}
              style={styles.cta}
            >
              <Text style={styles.spark}>✦</Text>
              <View style={styles.ctaCenter}>
                <Text style={styles.ctaText}>Tiếp tục</Text>
                <View style={styles.arrowBubble}>
                  <MaterialCommunityIcons color="#5060E9" name="arrow-right" size={21} />
                </View>
              </View>
              <Text style={styles.spark}>✦</Text>
            </LinearGradient>
          </Pressable>

          <Text style={styles.footnote}>Bạn có thể thay đổi lại trong Cài đặt sau.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: '#02050E',
    flex: 1,
  },
  safe: {
    alignItems: 'center',
    flex: 1,
    width: '100%',
  },
  content: {
    alignSelf: 'center',
    flex: 1,
    paddingBottom: 10,
  },
  glow: {
    borderRadius: 999,
    height: 360,
    opacity: 0.17,
    position: 'absolute',
    width: 360,
  },
  glowLeft: {
    backgroundColor: '#7822FF',
    bottom: 65,
    left: -270,
    transform: [{ scaleY: 1.7 }],
  },
  glowRight: {
    backgroundColor: '#176BFF',
    bottom: -50,
    right: -280,
    transform: [{ scaleY: 1.55 }],
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 58,
    justifyContent: 'space-between',
  },
  circleButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,23,43,0.84)',
    borderColor: 'rgba(150,160,195,0.10)',
    borderRadius: 23,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    left: 62,
    position: 'absolute',
    right: 72,
  },
  brandLiqi: {
    color: '#9A4FFF',
    fontSize: 25,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -1,
    textShadowColor: 'rgba(151,74,255,0.55)',
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 9,
  },
  brandMatch: {
    color: '#F6F7FB',
    fontSize: 25,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -1,
  },
  progressPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(17,23,43,0.84)',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 66,
  },
  progressText: {
    color: '#C99AFF',
    fontSize: 16,
    fontWeight: '800',
  },
  progressTrack: {
    backgroundColor: '#282E48',
    borderRadius: 2,
    height: 3,
    marginTop: 6,
    overflow: 'hidden',
    width: 38,
  },
  progressFill: {
    borderRadius: 2,
    height: '100%',
    width: 25,
  },
  heading: {
    marginBottom: 18,
    marginTop: 28,
  },
  headingCompact: {
    marginBottom: 12,
    marginTop: 16,
  },
  eyebrow: {
    color: '#8F70D8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.1,
    marginBottom: 10,
  },
  title: {
    color: '#F7F8FD',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.7,
    lineHeight: 38,
  },
  titleAccent: {
    color: '#9C61FF',
    fontStyle: 'italic',
  },
  subtitle: {
    color: '#9299AD',
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 11,
    maxWidth: 350,
  },
  tipCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(79,43,145,0.13)',
    borderColor: 'rgba(157,91,255,0.20)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    minHeight: 54,
    paddingHorizontal: 13,
  },
  tipIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(148,72,255,0.16)',
    borderRadius: 12,
    height: 32,
    justifyContent: 'center',
    marginRight: 10,
    width: 32,
  },
  tipText: {
    color: '#B9BFD0',
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  listPanel: {
    flex: 1,
    minHeight: 284,
    overflow: 'hidden',
  },
  listContent: {
    paddingBottom: 2,
    rowGap: 11,
  },
  listContentCompact: {
    rowGap: 8,
  },
  cardPressable: {
    borderRadius: 22,
    width: '100%',
  },
  card: {
    alignItems: 'center',
    borderColor: 'rgba(134,148,190,0.14)',
    borderRadius: 22,
    borderWidth: 1,
    elevation: 5,
    flexDirection: 'row',
    minHeight: 92,
    paddingHorizontal: 15,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
  cardSelected: {
    borderColor: '#8C58FF',
    elevation: 9,
    shadowColor: '#7739FF',
    shadowOpacity: 0.48,
    shadowRadius: 18,
  },
  iconWrap: {
    backgroundColor: '#0D1328',
    borderColor: 'rgba(150,160,196,0.14)',
    borderRadius: 19,
    borderWidth: 1,
    height: 60,
    padding: 1,
    width: 60,
  },
  iconGradient: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
  },
  cardCopy: {
    flex: 1,
    marginLeft: 14,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  cardTitle: {
    color: '#F6F7FD',
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  cardSubtitle: {
    color: '#8D96AE',
    fontSize: 12.5,
    marginTop: 6,
  },
  primaryPill: {
    backgroundColor: 'rgba(161,73,255,0.18)',
    borderColor: 'rgba(185,105,255,0.35)',
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  primaryText: {
    color: '#D5A7FF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  checkbox: {
    alignItems: 'center',
    borderColor: 'rgba(160,170,204,0.32)',
    borderRadius: 13.5,
    borderWidth: 1,
    height: 27,
    justifyContent: 'center',
    marginLeft: 10,
    width: 27,
  },
  checkboxSelected: {
    backgroundColor: '#7F46F5',
    borderColor: '#B985FF',
  },
  selectionSummary: {
    alignItems: 'center',
    backgroundColor: 'rgba(12,18,35,0.90)',
    borderColor: 'rgba(131,144,180,0.13)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryLabel: {
    color: '#777F96',
    fontSize: 11.5,
  },
  summaryValue: {
    color: '#E8EAF3',
    fontSize: 13.5,
    fontWeight: '700',
    marginTop: 4,
  },
  count: {
    color: '#B287FF',
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 12,
  },
  ctaShell: {
    borderRadius: 25,
    elevation: 10,
    shadowColor: '#743BFF',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
  },
  ctaPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  cta: {
    alignItems: 'center',
    borderColor: 'rgba(207,184,255,0.43)',
    borderRadius: 25,
    borderWidth: 1,
    flexDirection: 'row',
    height: 58,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  ctaCenter: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
  },
  arrowBubble: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,248,255,0.88)',
    borderRadius: 15.5,
    height: 31,
    justifyContent: 'center',
    marginLeft: 12,
    width: 31,
  },
  spark: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
  },
  footnote: {
    color: '#626A80',
    fontSize: 11.5,
    marginTop: 10,
    textAlign: 'center',
  },
});
