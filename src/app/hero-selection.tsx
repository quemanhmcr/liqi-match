import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  HEROES,
  HERO_ROLES,
  type Hero,
  type HeroRole,
} from '@/features/onboarding/hero-selection-data';
import { updateOnboardingSnapshot } from '@/features/onboarding/onboarding-store';

const MAX_SELECTED = 3;

const ROLE_LABELS = [
  'All',
  'Fighter',
  'Tank',
  'Mage',
  'Assassin',
  'Support',
  'Marksman',
] as const;

function roleLabel(role: HeroRole) {
  const index = HERO_ROLES.indexOf(role);
  return ROLE_LABELS[index] ?? role;
}

export default function HeroSelectionScreen() {
  const [selected, setSelected] = useState<string[]>([
    'edras',
    'goverra',
    'heino',
  ]);
  const [query, setQuery] = useState('');
  const [activeRole, setActiveRole] = useState<HeroRole>(HERO_ROLES[0]!);

  const filteredHeroes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return HEROES.filter((hero) => {
      const matchesRole =
        activeRole === HERO_ROLES[0] || hero.role === activeRole;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        hero.name.toLowerCase().includes(normalizedQuery) ||
        hero.id.toLowerCase().includes(normalizedQuery) ||
        hero.variant?.toLowerCase().includes(normalizedQuery);

      return matchesRole && matchesQuery;
    });
  }, [activeRole, query]);

  const toggleHero = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_SELECTED) return [...current.slice(1), id];
      return [...current, id];
    });
  };

  const submit = () => {
    if (selected.length !== MAX_SELECTED) return;
    updateOnboardingSnapshot({ heroIds: selected });
    router.push('/habits');
  };

  const renderHero = ({ item }: { item: Hero }) => {
    const isSelected = selected.includes(item.id);
    const selectedIndex = selected.indexOf(item.id) + 1;

    return (
      <Pressable
        onPress={() => toggleHero(item.id)}
        style={[styles.heroCard, isSelected && styles.heroCardActive]}
      >
        <Image
          resizeMode="cover"
          source={item.image}
          style={styles.heroImage}
        />
        <LinearGradient
          colors={['transparent', 'rgba(5,7,19,0.9)']}
          style={[StyleSheet.absoluteFill, styles.heroFade]}
        />
        {isSelected ? (
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeText}>{selectedIndex}</Text>
          </View>
        ) : null}
        <View style={styles.heroMeta}>
          <Text numberOfLines={1} style={styles.heroName}>
            {item.name}
          </Text>
          <Text numberOfLines={1} style={styles.heroRole}>
            {item.variant ?? item.role}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#090B1A', '#050713', '#050713']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <Text style={styles.step}>Step 3/5</Text>
        <Text style={styles.title}>Choose 3 favorite heroes</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.subtitle}>
            Selected {selected.length}/{MAX_SELECTED}
          </Text>
          <Text style={styles.heroCount}>
            {filteredHeroes.length}/{HEROES.length} heroes
          </Text>
        </View>

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search hero"
          placeholderTextColor="#697089"
          style={styles.search}
          value={query}
        />

        <ScrollView
          contentContainerStyle={styles.roleList}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.roleScroller}
        >
          {HERO_ROLES.map((role) => {
            const isActive = role === activeRole;

            return (
              <Pressable
                key={role}
                onPress={() => setActiveRole(role)}
                style={[styles.roleChip, isActive && styles.roleChipActive]}
              >
                <Text
                  style={[styles.roleText, isActive && styles.roleTextActive]}
                >
                  {roleLabel(role)}
                </Text>
              </Pressable>
            );
          })}
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

        <Pressable
          disabled={selected.length !== MAX_SELECTED}
          onPress={submit}
          style={[
            styles.cta,
            selected.length !== MAX_SELECTED && styles.ctaDisabled,
          ]}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#050713', flex: 1 },
  safe: {
    flex: 1,
    paddingBottom: 10,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  step: {
    color: '#A8AFC6',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  title: {
    color: '#F7F8FF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 30,
    marginTop: 10,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  subtitle: { color: '#A8AFC6', fontSize: 14, fontWeight: '700' },
  heroCount: { color: '#697089', fontSize: 12.5, fontWeight: '800' },
  search: {
    backgroundColor: 'rgba(16,23,45,0.92)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    borderWidth: 1,
    color: '#F7F8FF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  roleScroller: {
    flexGrow: 0,
    height: 56,
    marginTop: 12,
  },
  roleList: {
    alignItems: 'center',
    gap: 8,
    paddingBottom: 4,
    paddingTop: 0,
  },
  roleChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,23,45,0.92)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
    height: 40,
    justifyContent: 'center',
    minWidth: 78,
    paddingHorizontal: 14,
  },
  roleChipActive: {
    backgroundColor: 'rgba(138,77,255,0.22)',
    borderColor: '#B44CFF',
  },
  roleText: {
    color: '#A8AFC6',
    fontSize: 13.5,
    fontWeight: '900',
    lineHeight: 18,
    textAlign: 'center',
  },
  roleTextActive: { color: '#F7F8FF' },
  heroList: {
    flex: 1,
    marginBottom: 16,
    marginTop: 10,
  },
  heroGrid: { paddingBottom: 10 },
  heroRow: { gap: 10, marginBottom: 14 },
  heroCard: {
    aspectRatio: 1,
    backgroundColor: 'rgba(16,23,45,0.92)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    maxWidth: '31.8%',
    overflow: 'hidden',
  },
  heroCardActive: { borderColor: '#B44CFF', borderWidth: 2 },
  heroImage: { height: '100%', width: '100%' },
  heroFade: { top: '50%' },
  selectedBadge: {
    alignItems: 'center',
    backgroundColor: '#8A4DFF',
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 26,
  },
  selectedBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  heroMeta: { bottom: 10, left: 9, position: 'absolute', right: 9 },
  heroName: {
    color: '#F7F8FF',
    fontSize: 12.5,
    fontWeight: '900',
    lineHeight: 16,
  },
  heroRole: {
    color: '#A8AFC6',
    fontSize: 10.5,
    fontWeight: '800',
    lineHeight: 14,
    marginTop: 2,
  },
  cta: {
    alignItems: 'center',
    backgroundColor: '#8A4DFF',
    borderRadius: 22,
    marginTop: 0,
    padding: 14,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
