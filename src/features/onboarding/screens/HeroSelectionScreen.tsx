import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  OnboardingChip,
  OnboardingCinematicShell,
  OnboardingPrimaryButton,
  OnboardingSecondaryAction,
  OnboardingSection,
} from '@/features/onboarding/components/OnboardingCinematic';
import { appRoutes } from '@/app-shell/navigation/routes';
import { HEROES, HERO_ROLES, type Hero, type HeroRole } from '@/entities/hero';
import { updateOnboardingSnapshot } from '../model/onboarding-draft-store';

const MAX_SELECTED = 3;
const FALLBACK_SLOT_WIDTH = 96;
const SELECTED_SLOT_GAP = 8;
const REMOVE_HOTSPOT_SIZE = 42;

const ROLE_LABELS = [
  'Tất cả',
  'Đấu sĩ',
  'Đỡ đòn',
  'Pháp sư',
  'Sát thủ',
  'Trợ thủ',
  'Xạ thủ',
] as const;

function roleLabel(role: HeroRole) {
  const index = HERO_ROLES.indexOf(role);
  return ROLE_LABELS[index] ?? role;
}

function clampSlot(index: number, selectedCount: number) {
  return Math.max(0, Math.min(index, Math.max(selectedCount - 1, 0)));
}

function isInsideRemoveHotspot(
  locationX: number,
  locationY: number,
  slotWidth: number,
) {
  return (
    locationX >= slotWidth - REMOVE_HOTSPOT_SIZE &&
    locationY <= REMOVE_HOTSPOT_SIZE
  );
}

type SelectedHeroSlotProps = {
  hero: Hero;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragEnd: () => void;
  onDragStart: (index: number) => void;
  onDragTargetChange: (index: number | null) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  selectedCount: number;
  slotWidth: number;
};

function SelectedHeroSlot({
  hero,
  index,
  isDragging,
  isDropTarget,
  onDragEnd,
  onDragStart,
  onDragTargetChange,
  onMove,
  onRemove,
  selectedCount,
  slotWidth,
}: SelectedHeroSlotProps) {
  const dragX = useMemo(() => new Animated.Value(0), []);
  const lift = useMemo(() => new Animated.Value(0), []);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) =>
          selectedCount > 1 &&
          !isInsideRemoveHotspot(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY,
            slotWidth,
          ),
        onMoveShouldSetPanResponder: (event, gestureState) =>
          selectedCount > 1 &&
          !isInsideRemoveHotspot(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY,
            slotWidth,
          ) &&
          Math.abs(gestureState.dx) > 4 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
          onDragStart(index);
          Animated.spring(lift, {
            friction: 8,
            tension: 120,
            toValue: 1,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderMove: (_, gestureState) => {
          const offset = Math.round(gestureState.dx / slotWidth);
          const nextIndex = clampSlot(index + offset, selectedCount);

          dragX.setValue(gestureState.dx);
          onDragTargetChange(nextIndex);
        },
        onPanResponderRelease: (_, gestureState) => {
          const offset = Math.round(gestureState.dx / slotWidth);
          const nextIndex = clampSlot(index + offset, selectedCount);

          onDragEnd();
          Animated.parallel([
            Animated.spring(dragX, {
              friction: 7,
              tension: 95,
              toValue: 0,
              useNativeDriver: true,
            }),
            Animated.spring(lift, {
              friction: 8,
              tension: 120,
              toValue: 0,
              useNativeDriver: true,
            }),
          ]).start();

          if (nextIndex !== index) onMove(index, nextIndex);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          onDragEnd();
          Animated.parallel([
            Animated.spring(dragX, {
              friction: 7,
              tension: 95,
              toValue: 0,
              useNativeDriver: true,
            }),
            Animated.spring(lift, {
              friction: 8,
              tension: 120,
              toValue: 0,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [
      dragX,
      index,
      lift,
      onDragEnd,
      onDragStart,
      onDragTargetChange,
      onMove,
      selectedCount,
      slotWidth,
    ],
  );

  const scale = lift.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.035],
  });

  return (
    <Animated.View
      {...panResponder.panHandlers}
      collapsable={false}
      style={[
        styles.selectedHero,
        isDropTarget && styles.selectedHeroDropTarget,
        isDragging && styles.selectedHeroDragging,
        { transform: [{ translateX: dragX }, { scale }] },
      ]}
    >
      <Image
        resizeMode="cover"
        source={hero.image}
        style={styles.selectedImage}
      />
      <LinearGradient
        colors={['rgba(2,5,14,0)', 'rgba(2,5,14,0.76)']}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <Pressable
        accessibilityLabel={`Xoá tướng ${hero.name}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => onRemove(hero.id)}
        style={({ pressed }) => [
          styles.selectedRemove,
          pressed && styles.selectedRemovePressed,
        ]}
      >
        <Text style={styles.selectedRemoveText}>×</Text>
      </Pressable>
      <Text numberOfLines={1} pointerEvents="none" style={styles.selectedName}>
        {hero.name}
      </Text>
    </Animated.View>
  );
}

export default function HeroSelectionScreen() {
  const [selected, setSelected] = useState<string[]>([
    'edras',
    'goverra',
    'heino',
  ]);
  const [activeRole, setActiveRole] = useState<HeroRole>(HERO_ROLES[0]!);
  const [selectedTrayWidth, setSelectedTrayWidth] = useState(0);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);

  const selectedHeroes = useMemo(
    () =>
      selected
        .map((id) => HEROES.find((hero) => hero.id === id))
        .filter((hero): hero is Hero => Boolean(hero)),
    [selected],
  );

  const filteredHeroes = useMemo(
    () =>
      HEROES.filter(
        (hero) => activeRole === HERO_ROLES[0] || hero.role === activeRole,
      ),
    [activeRole],
  );

  const selectedSlots = useMemo(
    () =>
      Array.from({ length: MAX_SELECTED }, (_, index) => selectedHeroes[index]),
    [selectedHeroes],
  );

  const selectedSlotWidth = useMemo(() => {
    if (selectedTrayWidth <= 0) return FALLBACK_SLOT_WIDTH;
    return (
      (selectedTrayWidth - SELECTED_SLOT_GAP * (MAX_SELECTED - 1)) /
      MAX_SELECTED
    );
  }, [selectedTrayWidth]);

  const toggleHero = useCallback((id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_SELECTED) return [...current.slice(1), id];
      return [...current, id];
    });
  }, []);

  const moveSelectedHero = useCallback((fromIndex: number, toIndex: number) => {
    setSelected((current) => {
      if (fromIndex === toIndex || !current[fromIndex]) return current;

      const next = [...current];
      const [movedHero] = next.splice(fromIndex, 1);
      if (!movedHero) return current;

      next.splice(toIndex, 0, movedHero);
      return next;
    });
  }, []);

  const startHeroDrag = useCallback((index: number) => {
    setDraggingIndex(index);
    setDragTargetIndex(index);
  }, []);

  const finishHeroDrag = useCallback(() => {
    setDraggingIndex(null);
    setDragTargetIndex(null);
  }, []);

  const goBack = () => {
    router.back();
  };

  const submit = () => {
    if (selected.length !== MAX_SELECTED) return;
    updateOnboardingSnapshot({ heroIds: selected });
    router.push(appRoutes.onboarding.habits);
  };

  const renderHero = ({ item }: { item: Hero }) => {
    const isSelected = selected.includes(item.id);

    return (
      <Pressable
        accessibilityLabel={`Chọn tướng ${item.name}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        onPress={() => toggleHero(item.id)}
        style={({ pressed }) => [
          styles.heroCard,
          isSelected && styles.heroCardActive,
          pressed && styles.pressed,
        ]}
      >
        <LinearGradient
          colors={
            isSelected
              ? ['rgba(142,77,225,0.075)', 'rgba(57,123,255,0.03)']
              : ['rgba(255,255,255,0.022)', 'rgba(255,255,255,0.008)']
          }
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.heroCardGradient}
        >
          <View style={styles.selectorRing}>
            {isSelected ? <Text style={styles.selectorCheck}>✓</Text> : null}
          </View>
          <View style={styles.heroAvatarFrame}>
            <Image
              resizeMode="cover"
              source={item.image}
              style={styles.heroAvatar}
            />
          </View>
          <Text numberOfLines={1} style={styles.heroName}>
            {item.name}
          </Text>
        </LinearGradient>
      </Pressable>
    );
  };

  return (
    <OnboardingCinematicShell
      contentContainerStyle={styles.shellContent}
      footer={
        <View>
          <OnboardingPrimaryButton
            disabled={selected.length !== MAX_SELECTED}
            onPress={submit}
            tone="purple"
          >
            Tiếp tục
          </OnboardingPrimaryButton>
          <OnboardingSecondaryAction onPress={goBack}>
            Quay lại
          </OnboardingSecondaryAction>
        </View>
      }
      headerDensity="compact"
      scroll={false}
      step={4}
      subtitle="Chọn những tướng bạn chơi tự tin nhất để mọi người dễ hiểu vibe của bạn hơn."
      title="Chọn 3 tướng tủ"
      tone="purple"
    >
      <OnboardingSection
        meta={`Đã chọn ${selected.length}/3 · kéo để sắp xếp`}
        title="Tướng đã chọn"
      >
        <View
          onLayout={(event) => {
            setSelectedTrayWidth(event.nativeEvent.layout.width);
          }}
          style={styles.selectedRow}
        >
          {selectedSlots.map((hero, index) =>
            hero ? (
              <SelectedHeroSlot
                hero={hero}
                index={index}
                isDragging={draggingIndex === index}
                isDropTarget={
                  dragTargetIndex === index && draggingIndex !== index
                }
                key={hero.id}
                onDragEnd={finishHeroDrag}
                onDragStart={startHeroDrag}
                onDragTargetChange={setDragTargetIndex}
                onMove={moveSelectedHero}
                onRemove={toggleHero}
                selectedCount={selected.length}
                slotWidth={selectedSlotWidth}
              />
            ) : (
              <View
                accessibilityLabel={`Ô tướng trống ${index + 1}`}
                accessible
                key={`empty-${index}`}
                style={[
                  styles.selectedHero,
                  styles.selectedHeroEmpty,
                  dragTargetIndex === index && styles.selectedHeroDropTarget,
                ]}
              >
                <Text style={styles.selectedSlotNumber}>{index + 1}</Text>
                <Text style={styles.selectedEmptyText}>Chọn</Text>
              </View>
            ),
          )}
        </View>
      </OnboardingSection>

      <View style={styles.pickerPanel}>
        <View style={styles.pickerHead}>
          <Text style={styles.pickerTitle}>Chọn thêm tướng</Text>
          <Text style={styles.filterIcon}>☷</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.roleList}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.roleScroller}
        >
          {HERO_ROLES.map((role) => (
            <OnboardingChip
              key={role}
              onPress={() => setActiveRole(role)}
              selected={role === activeRole}
              title={roleLabel(role)}
            />
          ))}
        </ScrollView>
        <FlatList
          columnWrapperStyle={styles.heroRow}
          contentContainerStyle={styles.heroGrid}
          data={filteredHeroes}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          numColumns={3}
          renderItem={renderHero}
          showsVerticalScrollIndicator={false}
          style={styles.heroList}
        />
      </View>
    </OnboardingCinematicShell>
  );
}

const styles = StyleSheet.create({
  filterIcon: {
    color: 'rgba(222,228,251,0.40)',
    fontSize: 18,
    fontWeight: '500',
  },
  heroAvatar: { height: '100%', width: '100%' },
  heroAvatarFrame: {
    borderColor: 'rgba(222,228,251,0.08)',
    borderRadius: 999,
    borderWidth: 1,
    height: 54,
    overflow: 'hidden',
    width: 54,
  },
  heroCard: {
    aspectRatio: 1.13,
    borderRadius: 16,
    flex: 1,
    maxWidth: '31.8%',
    overflow: 'hidden',
  },
  heroCardActive: {
    shadowColor: '#A65CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  heroCardGradient: {
    alignItems: 'center',
    borderColor: 'rgba(160,178,230,0.075)',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 7,
  },
  heroGrid: { paddingBottom: 10 },
  heroList: { flex: 1, marginTop: 10 },
  heroName: {
    color: 'rgba(248,250,255,0.78)',
    fontSize: 12.2,
    fontWeight: '500',
    marginTop: 5,
    textAlign: 'center',
  },
  heroRow: { gap: 8, marginBottom: 10 },
  pickerHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickerPanel: {
    backgroundColor: 'rgba(5,10,24,0.34)',
    borderColor: 'rgba(160,178,230,0.04)',
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    marginTop: 8,
    overflow: 'hidden',
    padding: 10,
  },
  pickerTitle: {
    color: 'rgba(248,250,255,0.86)',
    fontSize: 13.2,
    fontWeight: '500',
    letterSpacing: -0.04,
  },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  roleList: { gap: 8, paddingRight: 12 },
  roleScroller: { flexGrow: 0, marginTop: 10 },
  selectedRemove: {
    alignItems: 'center',
    backgroundColor: 'rgba(5,8,18,0.56)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 7,
    top: 7,
    width: 20,
  },
  selectedRemovePressed: { opacity: 0.78, transform: [{ scale: 0.94 }] },
  selectedRemoveText: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 17,
  },
  selectedHero: {
    aspectRatio: 1.05,
    borderColor: 'rgba(176,98,255,0.30)',
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    maxWidth: '31.9%',
    overflow: 'hidden',
    shadowColor: '#A65CFF',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  selectedHeroDragging: {
    elevation: 8,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    zIndex: 4,
  },
  selectedHeroDropTarget: {
    borderColor: 'rgba(196,144,255,0.54)',
    shadowColor: '#B25CFF',
    shadowOpacity: 0.13,
    shadowRadius: 10,
  },
  selectedHeroEmpty: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,13,30,0.30)',
    borderColor: 'rgba(176,190,242,0.085)',
    justifyContent: 'center',
    shadowOpacity: 0,
  },
  selectedEmptyText: {
    color: 'rgba(222,228,251,0.34)',
    fontSize: 10.2,
    fontWeight: '500',
    marginTop: 5,
  },
  selectedImage: { height: '100%', width: '100%' },
  selectedName: {
    bottom: 7,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12.2,
    fontWeight: '500',
    left: 8,
    position: 'absolute',
    right: 8,
    textAlign: 'center',
  },
  selectedRow: { flexDirection: 'row', gap: SELECTED_SLOT_GAP },
  selectedSlotNumber: {
    color: 'rgba(222,228,251,0.22)',
    fontSize: 18,
    fontWeight: '500',
  },
  selectorCheck: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  selectorRing: {
    alignItems: 'center',
    borderColor: 'rgba(174,191,255,0.28)',
    borderRadius: 999,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 7,
    top: 7,
    width: 22,
    zIndex: 2,
  },
  shellContent: { flex: 1, paddingBottom: 0 },
  skipText: {
    color: 'rgba(210,218,248,0.62)',
    fontSize: 13.1,
    fontWeight: '500',
    marginTop: 10,
    textAlign: 'center',
  },
});
