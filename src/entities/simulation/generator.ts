import { offsetSimulationTimestamp } from '@/shared/simulation';

import { HERO_IDS } from '@/entities/hero';

import {
  LANE_CATALOG,
  RANK_CATALOG,
  type GenderId,
  type LaneSlug,
  type RankId,
} from '@/entities/player-profile';

import { createGoldenWorldSnapshot } from './golden-world';
import { profileId } from './identity';
import {
  SimulationWorldSnapshotSchema,
  type SimulatedDiscoverFacet,
  type SimulatedOnlineStatus,
  type SimulatedProfile,
  type SimulationWorldSnapshot,
} from './world-schema';
import { assertSimulationWorldIntegrity } from './validator';

const GENERATED_NAMES = [
  'Bảo',
  'Chi',
  'Duy',
  'Giang',
  'Hà',
  'Khánh',
  'Lan',
  'Long',
  'My',
  'Ngọc',
  'Sơn',
  'Thảo',
  'Tùng',
  'Yến',
] as const;

const GENERATED_TRAITS = [
  'đánh chắc',
  'giao tiếp ngắn',
  'học hỏi',
  'không toxic',
  'macro',
  'thích combat',
  'ưu tiên mục tiêu',
] as const;

export type GenerateSimulationWorldOptions = Readonly<{
  baseWorld?: SimulationWorldSnapshot;
  profileCount?: number;
  seed: number | string;
}>;

/**
 * Expands a valid golden world without replacing its intentional actors.
 * Generated profiles are relationship-free until a scenario explicitly links them.
 */
export function generateSimulationWorld({
  baseWorld = createGoldenWorldSnapshot(),
  profileCount = 50,
  seed,
}: GenerateSimulationWorldOptions): SimulationWorldSnapshot {
  const goldenCount = Object.keys(baseWorld.profiles).length;
  if (!Number.isInteger(profileCount) || profileCount < goldenCount) {
    throw new Error(
      `profileCount must be an integer at least as large as the golden world (${goldenCount}).`,
    );
  }
  if (profileCount > 500) {
    throw new Error('profileCount must not exceed 500 in simulation v1.');
  }

  const world = SimulationWorldSnapshotSchema.parse(baseWorld);
  const seedText = String(seed);
  const seedHash = hashSeed(seedText);
  const random = mulberry32(seedHash);
  const seedToken = seedHash.toString(16).padStart(8, '0');

  for (let index = goldenCount; index < profileCount; index += 1) {
    const generated = createGeneratedProfile({
      clock: world.generatedAt,
      index,
      random,
      seedText,
      seedToken,
    });
    world.profiles[generated.id] = generated;
  }

  return assertSimulationWorldIntegrity(
    SimulationWorldSnapshotSchema.parse(world),
  );
}

function createGeneratedProfile(input: {
  clock: string;
  index: number;
  random: () => number;
  seedText: string;
  seedToken: string;
}): SimulatedProfile {
  const id = profileId(
    `profile:generated:${input.seedToken}:${String(input.index + 1).padStart(2, '0')}`,
  );
  const displayName = `${pick(GENERATED_NAMES, input.random)} ${input.index + 1}`;
  const primaryLane = pick(
    LANE_CATALOG.map((option) => option.id),
    input.random,
  );
  const secondaryLane = pickDifferent(
    LANE_CATALOG.map((option) => option.id),
    primaryLane,
    input.random,
  );
  const heroIds = pickUnique(HERO_IDS, 3, input.random);
  const rankId = pick(
    RANK_CATALOG.map((option) => option.id),
    input.random,
  );
  const genderId = pick<readonly GenderId[]>(
    ['female', 'hidden', 'male'],
    input.random,
  );
  const presence = pick<readonly SimulatedOnlineStatus[]>(
    ['hidden', 'offline', 'online', 'recently_online'],
    input.random,
  );
  const ready = presence === 'online' && input.random() > 0.45;
  const createdMinutesAgo = 60 * 24 * (7 + Math.floor(input.random() * 180));
  const updatedMinutesAgo = 5 + Math.floor(input.random() * 60 * 24 * 3);
  const facets = facetsFor(primaryLane, ready, input.random);

  return {
    bio: `Profile sinh deterministically từ seed ${input.seedText}; dùng để mở rộng tải dữ liệu, không thay thế golden actor.`,
    canonicalProfile: {
      favoriteHeroes: heroIds.map((heroId, index) => ({
        heroId,
        priority: index + 1,
      })),
      habits: {
        comebackResponseId: 'comeback.team-decision',
        communicationPreferenceIds:
          input.random() > 0.5
            ? ['communication.voice-as-needed']
            : ['communication.text-ping'],
        decisionStyleId: 'decision.discuss',
        feedbackStyleId: 'feedback.brief',
        lossResponseId: 'loss.short-break',
        seriousnessId:
          rankWeight(rankId) >= rankWeight('master')
            ? 'seriousness.competitive'
            : 'seriousness.balanced',
        sessionLengthId: 'session.three-five',
        strategyStyleIds: [
          input.random() > 0.5 ? 'strategy.objectives' : 'strategy.adaptive',
        ],
        teamAtmosphereIds: ['atmosphere.friendly'],
        teamGoalIds: [input.random() > 0.5 ? 'goal.rank-climb' : 'goal.casual'],
        timePreferenceIds: [
          input.random() > 0.3 ? 'time.evening' : 'time.late-night',
        ],
      },
      laneSelection: { primary: primaryLane, secondary: secondaryLane },
      localeId: 'vi-VN',
      matchIntent: ready
        ? {
            activeFrom: timestampBefore(input.clock, updatedMinutesAgo),
            activeUntil: null,
            communicationPreferenceIds: [],
            heroIds: [],
            kind: input.random() > 0.5 ? 'rank-climb' : 'casual-play',
            laneSelection: {
              primary: primaryLane,
              secondary: secondaryLane,
            },
            note: '',
            teamGoalIds: [],
          }
        : null,
      mediaSelection: {
        avatarSelected: false,
        coverSelected: false,
        wallPositions: [],
      },
      profileBasics: {
        displayName,
        gameHandle: `Sim${input.seedToken.slice(0, 4)}${input.index + 1}`,
        genderId,
      },
      rankId,
      recurringAvailability: {
        slots: [
          { dayOfWeek: 2, endMinute: 23 * 60, startMinute: 19 * 60 },
          { dayOfWeek: 4, endMinute: 23 * 60, startMinute: 19 * 60 },
        ],
        timezone: 'Asia/Ho_Chi_Minh',
      },
      timezone: 'Asia/Ho_Chi_Minh',
    },
    createdAt: timestampBefore(input.clock, createdMinutesAgo),
    discoverable: true,
    facets,
    id,
    identityKey: `generated.actor.${input.seedToken}.${input.index + 1}`,
    media: {
      avatarAssetKey: null,
      coverAssetKey: null,
      pendingAssociations: [],
      wallAssetKeys: [],
    },
    presence: {
      changedAt: timestampBefore(input.clock, updatedMinutesAgo),
      state: presence,
    },
    readiness: {
      mode: ready ? (input.random() > 0.5 ? 'rank' : 'normal') : null,
      since: ready ? timestampBefore(input.clock, updatedMinutesAgo) : null,
      state: ready ? 'ready' : presence === 'offline' ? 'offline' : 'busy',
    },
    region: 'global',
    stats: {
      matches: Math.floor(input.random() * 400),
      rating: Number((3.8 + input.random() * 1.1).toFixed(1)),
      reputation: 75 + Math.floor(input.random() * 26),
      winRate: 45 + Math.floor(input.random() * 21),
    },
    traits: pickUnique(GENERATED_TRAITS, 3, input.random),
    updatedAt: timestampBefore(input.clock, updatedMinutesAgo),
    verified: false,
  };
}

function facetsFor(
  primaryLane: LaneSlug,
  ready: boolean,
  random: () => number,
): SimulatedDiscoverFacet[] {
  const facets: SimulatedDiscoverFacet[] = ['non-toxic'];
  if (ready || random() > 0.45) facets.push('rank');
  if (primaryLane === 'support' || random() > 0.72) facets.push('mic');
  if (random() > 0.8) facets.push('soulmate');
  return [...new Set(facets)];
}

function rankWeight(rankId: RankId) {
  return RANK_CATALOG.findIndex((rank) => rank.id === rankId);
}

function timestampBefore(clock: string, minutes: number) {
  return offsetSimulationTimestamp(clock, -minutes * 60_000);
}

function pick<const Values extends readonly unknown[]>(
  values: Values,
  random: () => number,
): Values[number] {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined)
    throw new Error('Cannot pick from an empty collection.');
  return value;
}

function pickDifferent<const Values extends readonly string[]>(
  values: Values,
  excluded: Values[number],
  random: () => number,
): Values[number] {
  return pick(
    values.filter((value) => value !== excluded) as unknown as Values,
    random,
  );
}

function pickUnique<const Values extends readonly string[]>(
  values: Values,
  count: number,
  random: () => number,
): Values[number][] {
  const pool = [...values];
  const selected: Values[number][] = [];
  while (selected.length < count && pool.length) {
    const index = Math.floor(random() * pool.length);
    const [value] = pool.splice(index, 1);
    if (value !== undefined) selected.push(value as Values[number]);
  }
  if (selected.length !== count) {
    throw new Error(`Cannot choose ${count} unique values.`);
  }
  return selected;
}

function hashSeed(value: string) {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return (() => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  })();
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
