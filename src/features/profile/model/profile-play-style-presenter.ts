import type { ImageSourcePropType } from 'react-native';

import {
  COMMUNICATION_PREFERENCE_CATALOG,
  DECISION_STYLE_CATALOG,
  SERIOUSNESS_CATALOG,
  STRATEGY_STYLE_CATALOG,
  TEAM_GOAL_CATALOG,
  type CommunicationPreferenceId,
  type DecisionStyleId,
  type HabitAnswersDraft,
  type HabitId,
  type SeriousnessId,
  type StrategyStyleId,
  type TeamGoalId,
} from '@/entities/player-profile';

import { profileScreenAssets } from '../screens/profile-screen-assets';

export type ProfilePlayStyleSlot = 'coordination' | 'goal' | 'tactics';
export type ProfilePlayStyleMode = 'auto' | 'empty';

export type ProfilePlayStyleArchetypeId =
  | 'coordination.analytical'
  | 'coordination.autonomous'
  | 'coordination.shot-caller'
  | 'coordination.voice-needed'
  | 'goal.casual'
  | 'goal.duo'
  | 'goal.practice'
  | 'goal.rank-climb'
  | 'tactics.adaptive'
  | 'tactics.objective-control'
  | 'tactics.playmaker'
  | 'tactics.protector'
  | 'tactics.scaling';

export type ProfilePlayStyleTile = Readonly<{
  archetypeId: ProfilePlayStyleArchetypeId | null;
  description: string;
  image: ImageSourcePropType;
  label: string;
  mode: ProfilePlayStyleMode;
  slot: ProfilePlayStyleSlot;
  sourceHabitIds: readonly HabitId[];
  sourceLabels: readonly string[];
  title: string;
}>;

type ArchetypePresentation = Readonly<{
  description: string;
  image: ImageSourcePropType;
  title: string;
}>;

const slotLabels: Readonly<Record<ProfilePlayStyleSlot, string>> = {
  coordination: 'PHỐI HỢP',
  goal: 'MỤC TIÊU',
  tactics: 'CHIẾN THUẬT',
};

const goalByTeamGoal: Readonly<
  Partial<Record<TeamGoalId, ProfilePlayStyleArchetypeId>>
> = {
  'goal.casual': 'goal.casual',
  'goal.long-term-duo': 'goal.duo',
  'goal.practice': 'goal.practice',
  'goal.rank-climb': 'goal.rank-climb',
  'goal.stable-teamwork': 'goal.duo',
  'goal.strategy': 'goal.practice',
};

const goalBySeriousness: Readonly<
  Partial<Record<SeriousnessId, ProfilePlayStyleArchetypeId>>
> = {
  'seriousness.casual': 'goal.casual',
  'seriousness.competitive': 'goal.rank-climb',
};

const coordinationByDecision: Readonly<
  Record<DecisionStyleId, ProfilePlayStyleArchetypeId>
> = {
  'decision.autonomous': 'coordination.autonomous',
  'decision.discuss': 'coordination.analytical',
  'decision.follow-call': 'coordination.voice-needed',
  'decision.shot-call': 'coordination.shot-caller',
};

const coordinationByCommunication: Readonly<
  Record<CommunicationPreferenceId, ProfilePlayStyleArchetypeId>
> = {
  'communication.listen-only': 'coordination.voice-needed',
  'communication.minimal': 'coordination.autonomous',
  'communication.text-ping': 'coordination.voice-needed',
  'communication.voice-as-needed': 'coordination.voice-needed',
  'communication.voice-proactive': 'coordination.shot-caller',
};

const tacticsByStrategy: Readonly<
  Record<StrategyStyleId, ProfilePlayStyleArchetypeId>
> = {
  'strategy.adaptive': 'tactics.adaptive',
  'strategy.cover': 'tactics.protector',
  'strategy.early-fights': 'tactics.playmaker',
  'strategy.low-risk': 'tactics.scaling',
  'strategy.macro': 'tactics.objective-control',
  'strategy.objectives': 'tactics.objective-control',
  'strategy.patient': 'tactics.scaling',
  'strategy.plan': 'tactics.objective-control',
  'strategy.playmaking': 'tactics.playmaker',
  'strategy.press-advantage': 'tactics.playmaker',
  'strategy.protect': 'tactics.protector',
  'strategy.scale': 'tactics.scaling',
  'strategy.skirmish': 'tactics.playmaker',
};

const goalPriority = [
  'goal.rank-climb',
  'goal.practice',
  'goal.duo',
  'goal.casual',
] as const satisfies readonly ProfilePlayStyleArchetypeId[];

const communicationPriority = [
  'coordination.shot-caller',
  'coordination.voice-needed',
  'coordination.autonomous',
  'coordination.analytical',
] as const satisfies readonly ProfilePlayStyleArchetypeId[];

const tacticsPriority = [
  'tactics.playmaker',
  'tactics.objective-control',
  'tactics.scaling',
  'tactics.protector',
  'tactics.adaptive',
] as const satisfies readonly ProfilePlayStyleArchetypeId[];

const archetypePresentation: Readonly<
  Record<ProfilePlayStyleArchetypeId, ArchetypePresentation>
> = {
  'coordination.analytical': {
    description: 'Trao đổi trước khi thống nhất quyết định.',
    image: profileScreenAssets.playStyleCoordinationAnalytical,
    title: 'Cùng phân tích',
  },
  'coordination.autonomous': {
    description: 'Tự chủ trong vai trò, giữ giao tiếp vừa đủ.',
    image: profileScreenAssets.playStyleCoordinationAutonomous,
    title: 'Tự chủ, tập trung',
  },
  'coordination.shot-caller': {
    description: 'Chủ động định hướng ở thời điểm quan trọng.',
    image: profileScreenAssets.playStyleCoordinationShotCaller,
    title: 'Chủ động gọi nhịp',
  },
  'coordination.voice-needed': {
    description: 'Trao đổi ngắn gọn, đúng lúc trong trận.',
    image: profileScreenAssets.playStyleCoordinationVoiceNeeded,
    title: 'Giao tiếp đúng lúc',
  },
  'goal.casual': {
    description: 'Giữ nhịp thoải mái và tận hưởng trận đấu.',
    image: profileScreenAssets.playStyleGoalCasual,
    title: 'Chơi vui, thư giãn',
  },
  'goal.duo': {
    description: 'Tìm người phối hợp ổn định, lâu dài.',
    image: profileScreenAssets.playStyleGoalDuo,
    title: 'Đồng đội lâu dài',
  },
  'goal.practice': {
    description: 'Rèn kỹ năng và khám phá cách vận hành mới.',
    image: profileScreenAssets.playStyleGoalPractice,
    title: 'Luyện & khám phá',
  },
  'goal.rank-climb': {
    description: 'Ưu tiên tiến bộ và những trận cạnh tranh.',
    image: profileScreenAssets.playStyleGoalRankClimb,
    title: 'Leo rank nghiêm túc',
  },
  'tactics.adaptive': {
    description: 'Điều chỉnh theo nhịp và diễn biến trận đấu.',
    image: profileScreenAssets.playStyleTacticsNeutral,
    title: 'Linh hoạt ứng biến',
  },
  'tactics.objective-control': {
    description: 'Ưu tiên mục tiêu, macro và di chuyển.',
    image: profileScreenAssets.playStyleTacticsObjectiveControl,
    title: 'Kiểm soát bản đồ',
  },
  'tactics.playmaker': {
    description: 'Chủ động tạo nhịp và cơ hội đột biến.',
    image: profileScreenAssets.playStyleTacticsPlaymaker,
    title: 'Tạo đột biến',
  },
  'tactics.protector': {
    description: 'Cover và giữ đồng đội trong nhịp chơi.',
    image: profileScreenAssets.playStyleTacticsProtector,
    title: 'Bảo kê đồng đội',
  },
  'tactics.scaling': {
    description: 'Đánh chắc, tích lũy và chờ thời điểm.',
    image: profileScreenAssets.playStyleTacticsScaling,
    title: 'Kiên nhẫn tăng tiến',
  },
};

const emptyPresentation: Readonly<
  Record<ProfilePlayStyleSlot, ArchetypePresentation>
> = {
  coordination: {
    description: 'Cập nhật để đồng đội biết cách chơi cùng bạn.',
    image: profileScreenAssets.playStyleCoordinationNeutral,
    title: 'Chưa chọn phối hợp',
  },
  goal: {
    description: 'Cập nhật điều bạn đang tìm kiếm trong game.',
    image: profileScreenAssets.playStyleGoalNeutral,
    title: 'Chưa chọn mục tiêu',
  },
  tactics: {
    description: 'Cập nhật cách bạn tạo giá trị trong trận.',
    image: profileScreenAssets.playStyleTacticsNeutral,
    title: 'Chưa chọn chiến thuật',
  },
};

const habitLabelById = new Map<string, string>(
  [
    ...TEAM_GOAL_CATALOG,
    ...SERIOUSNESS_CATALOG,
    ...DECISION_STYLE_CATALOG,
    ...COMMUNICATION_PREFERENCE_CATALOG,
    ...STRATEGY_STYLE_CATALOG,
  ].map((option) => [option.id, option.label]),
);

export function presentProfilePlayStyleHabits(
  habits?: HabitAnswersDraft,
): readonly ProfilePlayStyleTile[] {
  const goal =
    mostSupported(habits?.teamGoalIds, goalByTeamGoal, goalPriority) ??
    mappedValue(habits?.seriousnessId, goalBySeriousness);
  const coordination =
    mappedValue(habits?.decisionStyleId, coordinationByDecision) ??
    mostSupported(
      habits?.communicationPreferenceIds,
      coordinationByCommunication,
      communicationPriority,
    );
  const tactics = mostSupported(
    habits?.strategyStyleIds,
    tacticsByStrategy,
    tacticsPriority,
  );

  return [
    buildTile('goal', goal, goalSourceIds(habits, goal)),
    buildTile(
      'coordination',
      coordination,
      coordinationSourceIds(habits, coordination),
    ),
    buildTile('tactics', tactics, tacticsSourceIds(habits, tactics)),
  ];
}

function buildTile(
  slot: ProfilePlayStyleSlot,
  archetypeId: ProfilePlayStyleArchetypeId | undefined,
  sourceHabitIds: readonly HabitId[],
): ProfilePlayStyleTile {
  const presentation = archetypeId
    ? archetypePresentation[archetypeId]
    : emptyPresentation[slot];

  return {
    archetypeId: archetypeId ?? null,
    ...presentation,
    label: slotLabels[slot],
    mode: archetypeId ? 'auto' : 'empty',
    slot,
    sourceHabitIds,
    sourceLabels: sourceHabitIds.map(
      (id) => habitLabelById.get(id) ?? String(id),
    ),
  };
}

function goalSourceIds(
  habits: HabitAnswersDraft | undefined,
  archetypeId: ProfilePlayStyleArchetypeId | undefined,
): readonly HabitId[] {
  if (!habits || !archetypeId) return [];
  return [
    ...matchingCatalogIds(
      TEAM_GOAL_CATALOG,
      habits.teamGoalIds,
      goalByTeamGoal,
      archetypeId,
    ),
    ...(habits.seriousnessId &&
    goalBySeriousness[habits.seriousnessId] === archetypeId
      ? [habits.seriousnessId]
      : []),
  ];
}

function coordinationSourceIds(
  habits: HabitAnswersDraft | undefined,
  archetypeId: ProfilePlayStyleArchetypeId | undefined,
): readonly HabitId[] {
  if (!habits || !archetypeId) return [];
  return [
    ...(habits.decisionStyleId &&
    coordinationByDecision[habits.decisionStyleId] === archetypeId
      ? [habits.decisionStyleId]
      : []),
    ...matchingCatalogIds(
      COMMUNICATION_PREFERENCE_CATALOG,
      habits.communicationPreferenceIds,
      coordinationByCommunication,
      archetypeId,
    ),
  ];
}

function tacticsSourceIds(
  habits: HabitAnswersDraft | undefined,
  archetypeId: ProfilePlayStyleArchetypeId | undefined,
): readonly HabitId[] {
  if (!habits || !archetypeId) return [];
  return matchingCatalogIds(
    STRATEGY_STYLE_CATALOG,
    habits.strategyStyleIds,
    tacticsByStrategy,
    archetypeId,
  );
}

function matchingCatalogIds<Id extends HabitId>(
  catalog: readonly Readonly<{ id: Id }>[],
  selectedIds: readonly Id[],
  mapping: Readonly<Partial<Record<Id, ProfilePlayStyleArchetypeId>>>,
  archetypeId: ProfilePlayStyleArchetypeId,
): Id[] {
  const selected = new Set(selectedIds);
  return catalog
    .map((option) => option.id)
    .filter((id) => selected.has(id) && mapping[id] === archetypeId);
}

function mostSupported<Id extends string, Value extends string>(
  ids: readonly Id[] | undefined,
  mapping: Readonly<Partial<Record<Id, Value>>>,
  priority: readonly Value[],
): Value | undefined {
  const counts = new Map<Value, number>();
  for (const id of new Set(ids ?? [])) {
    const value = mapping[id];
    if (value === undefined) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let best: Value | undefined;
  let bestCount = 0;
  for (const value of priority) {
    const count = counts.get(value) ?? 0;
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function mappedValue<Id extends string, Value>(
  id: Id | null | undefined,
  mapping: Readonly<Partial<Record<Id, Value>>>,
) {
  return id ? mapping[id] : undefined;
}
