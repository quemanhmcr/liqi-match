import { offsetSimulationTimestamp } from '@/shared/simulation';

import {
  assetKey,
  messageId,
  notificationId,
  scenarioId,
  simulationEventId,
  simulationFaultId,
  type ScenarioId,
} from './identity';
import {
  GOLDEN_CONVERSATION_IDS,
  GOLDEN_PROFILE_IDS,
  GOLDEN_SET_IDS,
  GOLDEN_WORLD_CLOCK,
  createGoldenWorldSnapshot,
} from './golden-world';
import {
  SIMULATION_SCENARIO_VERSION,
  SimulationScenarioDefinitionSchema,
  type SimulationMutationKind,
  type SimulationScenarioDefinition,
} from './scenario-schema';
import { assertSimulationScenario } from './scenario-validator';
import {
  SimulationWorldSnapshotSchema,
  type SimulationWorldSnapshot,
} from './world-schema';

const DEFAULT_CAPABILITIES = [
  'clock-control',
  'event-timeline',
  'fault-injection',
  'network-toggle',
  'reset',
] as const;

const DEFAULT_MUTATIONS: readonly SimulationMutationKind[] = [
  'advance-clock',
  'apply-scenario-event',
  'associate-media',
  'invite-player',
  'join-set',
  'leave-set',
  'mark-conversation-read',
  'mark-notification-read',
  'mark-notifications-seen',
  'receive-message',
  'receive-notification',
  'request-set-join',
  'retry-message',
  'send-message',
  'set-network-state',
  'transition-message-delivery',
  'update-profile',
];

export const VIEWER_READY_HAPPY_PATH_SCENARIO = defineScenario({
  description:
    'Viewer đã có hồ sơ hoàn chỉnh, match, set, hội thoại và notification liên kết xuyên feature.',
  id: scenarioId('scenario:viewer-ready-happy-path'),
  initialWorld: createGoldenWorldSnapshot(
    scenarioId('scenario:viewer-ready-happy-path'),
  ),
  requiredRelations: [
    {
      kind: 'match',
      profileIds: [GOLDEN_PROFILE_IDS.quanViewer, GOLDEN_PROFILE_IDS.minhAnh],
    },
    {
      kind: 'set-membership',
      profileId: GOLDEN_PROFILE_IDS.quanViewer,
      setId: GOLDEN_SET_IDS.demViolet,
    },
    {
      conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
      kind: 'conversation-membership',
      profileId: GOLDEN_PROFILE_IDS.quanViewer,
    },
  ],
  title: 'Viewer ready happy path',
});

export const NEWLY_ONBOARDED_PROFILE_PROPAGATION_SCENARIO = (() => {
  const id = scenarioId('scenario:newly-onboarded-profile-propagation');
  const world = createNewlyOnboardedWorld(id);
  const propagatedProfile = requiredEntity(
    SimulationWorldSnapshotSchema.parse(world).profiles[
      GOLDEN_PROFILE_IDS.quanViewer
    ],
    'newly onboarded viewer profile',
  );
  propagatedProfile.canonicalProfile.profileBasics.displayName = 'Quân Mới';
  propagatedProfile.bio =
    'Hồ sơ vừa cập nhật phải xuất hiện nhất quán ở mọi feature.';
  propagatedProfile.updatedAt = after(1);

  return defineScenario({
    description:
      'Viewer vừa hoàn thành onboarding; một profile update được phát qua timeline và phải đồng nhất ở Profile, Home và Discover.',
    id,
    initialWorld: world,
    requiredRelations: [],
    timeline: [
      {
        at: after(1),
        id: simulationEventId('event:new-profile-propagated'),
        kind: 'profile-propagated',
        profile: propagatedProfile,
      },
    ],
    title: 'Newly onboarded profile propagation',
  });
})();

export const SOCIAL_UNREAD_CROSS_LINK_SCENARIO = defineScenario({
  description:
    'Unread message và notification cùng trỏ tới một actor, conversation và message canonical.',
  id: scenarioId('scenario:social-unread-cross-link'),
  initialWorld: createGoldenWorldSnapshot(
    scenarioId('scenario:social-unread-cross-link'),
  ),
  requiredRelations: [
    {
      conversationId: GOLDEN_CONVERSATION_IDS.khoaJungle,
      kind: 'notification-conversation-link',
      messageId: messageId('message:khoa-jungle:5'),
      notificationId: notificationId('notification:khoa-message'),
    },
    {
      conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
      kind: 'notification-conversation-link',
      messageId: messageId('message:minh-anh:6'),
      notificationId: notificationId('notification:minh-anh-message'),
    },
  ],
  title: 'Social unread cross-link',
});

export const EMPTY_COLD_START_SCENARIO = defineScenario({
  description:
    'Viewer tồn tại nhưng không có match, set membership, conversation, message hoặc notification.',
  id: scenarioId('scenario:empty-cold-start'),
  initialWorld: createEmptyWorld(scenarioId('scenario:empty-cold-start')),
  requiredRelations: [],
  title: 'Empty cold start',
});

export const DEGRADED_OFFLINE_RECOVERY_SCENARIO = defineScenario({
  description:
    'Runtime bắt đầu offline, Discover có một lỗi retryable, sau đó network và fault được khôi phục theo clock.',
  faults: [
    {
      activatesAt: GOLDEN_WORLD_CLOCK,
      clearsAt: after(5),
      id: simulationFaultId('fault:offline-start'),
      kind: 'offline',
      target: 'all',
    },
    {
      activatesAt: after(5),
      clearsAt: after(6),
      code: 'network_error',
      failures: 1,
      id: simulationFaultId('fault:discover-first-retry'),
      kind: 'error',
      target: 'discover',
    },
  ],
  id: scenarioId('scenario:degraded-offline-recovery'),
  initialNetworkState: 'offline',
  initialWorld: createGoldenWorldSnapshot(
    scenarioId('scenario:degraded-offline-recovery'),
  ),
  requiredRelations: [
    {
      conversationId: GOLDEN_CONVERSATION_IDS.khoaJungle,
      kind: 'conversation-membership',
      profileId: GOLDEN_PROFILE_IDS.quanViewer,
    },
  ],
  timeline: [
    {
      at: after(5),
      id: simulationEventId('event:network-recovered'),
      kind: 'network-state-changed',
      state: 'online',
    },
    {
      at: after(5),
      faultId: simulationFaultId('fault:offline-start'),
      id: simulationEventId('event:offline-fault-cleared'),
      kind: 'fault-cleared',
    },
    {
      at: after(6),
      faultId: simulationFaultId('fault:discover-first-retry'),
      id: simulationEventId('event:discover-fault-cleared'),
      kind: 'fault-cleared',
    },
  ],
  title: 'Degraded offline recovery',
});

export const MEDIA_PARTIALLY_ASSOCIATED_SCENARIO = (() => {
  const id = scenarioId('scenario:media-partially-associated');
  const pendingCoverKey = assetKey('asset:profile:quan-viewer:cover-pending');
  const world = cloneWorld(createGoldenWorldSnapshot(id));
  const viewer = requiredEntity(
    world.profiles[GOLDEN_PROFILE_IDS.quanViewer],
    'media scenario viewer profile',
  );
  viewer.media.coverAssetKey = null;
  viewer.media.pendingAssociations = [
    { assetKey: pendingCoverKey, position: 0, slot: 'cover' },
  ];
  world.assets[pendingCoverKey] = {
    altText: 'Ảnh bìa đã upload nhưng chưa associate của Quân',
    height: 1024,
    key: pendingCoverKey,
    kind: 'cover',
    mimeType: 'image/webp',
    owner: { id: GOLDEN_PROFILE_IDS.quanViewer, kind: 'profile' },
    state: 'unassociated',
    width: 1024,
  };

  return defineScenario({
    description:
      'Cover đã upload và có trong manifest nhưng chưa associate với profile; runtime chỉ được chuyển association, không tạo asset mới.',
    id,
    initialWorld: world,
    requiredRelations: [
      {
        assetKey: pendingCoverKey,
        kind: 'asset-state',
        state: 'unassociated',
      },
    ],
    timeline: [
      {
        assetKey: pendingCoverKey,
        at: after(2),
        id: simulationEventId('event:pending-cover-associated'),
        kind: 'media-associated',
        position: 0,
        profileId: GOLDEN_PROFILE_IDS.quanViewer,
        slot: 'cover',
      },
    ],
    title: 'Media partially associated',
  });
})();

export const SIMULATION_SCENARIOS = {
  [DEGRADED_OFFLINE_RECOVERY_SCENARIO.id]: DEGRADED_OFFLINE_RECOVERY_SCENARIO,
  [EMPTY_COLD_START_SCENARIO.id]: EMPTY_COLD_START_SCENARIO,
  [MEDIA_PARTIALLY_ASSOCIATED_SCENARIO.id]: MEDIA_PARTIALLY_ASSOCIATED_SCENARIO,
  [NEWLY_ONBOARDED_PROFILE_PROPAGATION_SCENARIO.id]:
    NEWLY_ONBOARDED_PROFILE_PROPAGATION_SCENARIO,
  [SOCIAL_UNREAD_CROSS_LINK_SCENARIO.id]: SOCIAL_UNREAD_CROSS_LINK_SCENARIO,
  [VIEWER_READY_HAPPY_PATH_SCENARIO.id]: VIEWER_READY_HAPPY_PATH_SCENARIO,
} as const satisfies Record<ScenarioId, SimulationScenarioDefinition>;

export function simulationScenarioById(id: ScenarioId) {
  return SIMULATION_SCENARIOS[id];
}

type DefineScenarioInput = Readonly<{
  description: string;
  faults?: SimulationScenarioDefinition['runtime']['faults'];
  id: ScenarioId;
  initialNetworkState?: 'offline' | 'online';
  initialWorld: SimulationWorldSnapshot;
  requiredRelations: SimulationScenarioDefinition['requiredRelations'];
  timeline?: SimulationScenarioDefinition['timeline'];
  title: string;
}>;

function defineScenario(
  input: DefineScenarioInput,
): SimulationScenarioDefinition {
  return assertSimulationScenario(
    SimulationScenarioDefinitionSchema.parse({
      description: input.description,
      id: input.id,
      initialClock: GOLDEN_WORLD_CLOCK,
      initialWorld: input.initialWorld,
      requiredRelations: input.requiredRelations,
      runtime: {
        allowedMutations: [...DEFAULT_MUTATIONS],
        capabilities: [...DEFAULT_CAPABILITIES],
        faults: input.faults ?? [],
        initialNetworkState: input.initialNetworkState ?? 'online',
      },
      timeline: input.timeline ?? [],
      title: input.title,
      version: SIMULATION_SCENARIO_VERSION,
    }),
  );
}

function createNewlyOnboardedWorld(id: ScenarioId) {
  const world = cloneWorld(createGoldenWorldSnapshot(id));
  const viewer = requiredEntity(
    world.profiles[GOLDEN_PROFILE_IDS.quanViewer],
    'newly onboarded viewer profile',
  );
  viewer.createdAt = before(5);
  viewer.updatedAt = before(5);
  viewer.presence.changedAt = before(5);
  viewer.readiness = { mode: 'normal', since: before(2), state: 'ready' };
  viewer.stats = { matches: 0, rating: 0, reputation: 100, winRate: 0 };

  world.matches = {};
  world.conversations = {};
  world.messages = {};
  world.notifications = {};
  world.assets = Object.fromEntries(
    Object.entries(world.assets).filter(
      ([, asset]) => asset.owner.kind !== 'message',
    ),
  ) as SimulationWorldSnapshot['assets'];

  const demViolet = requiredEntity(
    world.sets[GOLDEN_SET_IDS.demViolet],
    'Đêm Violet set',
  );
  demViolet.ownerId = GOLDEN_PROFILE_IDS.minhAnh;
  demViolet.memberIds = [GOLDEN_PROFILE_IDS.minhAnh];
  demViolet.invites = {};
  demViolet.joinRequests = {};
  requiredEntity(world.sets[GOLDEN_SET_IDS.saoBang], 'Sao Băng set').invites =
    {};
  requiredEntity(
    world.sets[GOLDEN_SET_IDS.macroLab],
    'Macro Lab set',
  ).joinRequests = {};

  return SimulationWorldSnapshotSchema.parse(world);
}

function createEmptyWorld(id: ScenarioId) {
  const world = cloneWorld(createGoldenWorldSnapshot(id));
  const viewerId = GOLDEN_PROFILE_IDS.quanViewer;
  world.profiles = {
    [viewerId]: requiredEntity(world.profiles[viewerId], 'empty-world viewer'),
  } as SimulationWorldSnapshot['profiles'];
  world.sets = {};
  world.matches = {};
  world.conversations = {};
  world.messages = {};
  world.notifications = {};
  world.assets = Object.fromEntries(
    Object.entries(world.assets).filter(
      ([, asset]) =>
        asset.owner.kind === 'shared' ||
        (asset.owner.kind === 'profile' && asset.owner.id === viewerId),
    ),
  ) as SimulationWorldSnapshot['assets'];
  return SimulationWorldSnapshotSchema.parse(world);
}

function cloneWorld(world: SimulationWorldSnapshot) {
  return SimulationWorldSnapshotSchema.parse(world);
}

function before(minutes: number) {
  return offsetSimulationTimestamp(GOLDEN_WORLD_CLOCK, -minutes * 60_000);
}

function after(minutes: number) {
  return offsetSimulationTimestamp(GOLDEN_WORLD_CLOCK, minutes * 60_000);
}

function requiredEntity<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`Missing ${label}.`);
  return value;
}
