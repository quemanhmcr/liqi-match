import { z } from 'zod';

import {
  AssetKeySchema,
  ConversationIdSchema,
  MessageIdSchema,
  NotificationIdSchema,
  ProfileIdSchema,
  ScenarioIdSchema,
  SetIdSchema,
  SimulationEventIdSchema,
  SimulationFaultIdSchema,
} from './identity';
import {
  SimulatedAssetStateSchema,
  SimulatedMessageSchema,
  SimulatedNotificationSchema,
  SimulatedProfileSchema,
  SimulationWorldSnapshotSchema,
} from './world-schema';

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const unique = <T>(values: readonly T[]) =>
  new Set(values).size === values.length;

export const SIMULATION_SCENARIO_VERSION = 1 as const;

export const SIMULATION_SCENARIO_IDS = [
  'scenario:viewer-ready-happy-path',
  'scenario:newly-onboarded-profile-propagation',
  'scenario:social-unread-cross-link',
  'scenario:empty-cold-start',
  'scenario:degraded-offline-recovery',
  'scenario:media-partially-associated',
] as const;

export const SimulationRuntimeCapabilitySchema = z.enum([
  'clock-control',
  'event-timeline',
  'fault-injection',
  'network-toggle',
  'reset',
]);
export type SimulationRuntimeCapability = z.infer<
  typeof SimulationRuntimeCapabilitySchema
>;

export const SimulationMutationKindSchema = z.enum([
  'advance-clock',
  'associate-media',
  'invite-player',
  'mark-notification-read',
  'mark-notifications-seen',
  'receive-message',
  'request-set-join',
  'retry-message',
  'send-message',
  'set-network-state',
  'update-profile',
]);
export type SimulationMutationKind = z.infer<
  typeof SimulationMutationKindSchema
>;

export const SIMULATION_IMMUTABLE_FIELDS = [
  'world.version',
  'world.scenarioId',
  'entity.id',
  'profile.identityKey',
  'asset.key',
  'asset.kind',
  'entity.createdAt',
] as const;

export const SimulationFaultTargetSchema = z.enum([
  'all',
  'discover',
  'home',
  'media',
  'messages',
  'notifications',
  'profile',
]);
export type SimulationFaultTarget = z.infer<typeof SimulationFaultTargetSchema>;

const SimulationFaultBaseSchema = z.object({
  activatesAt: IsoDateTimeSchema,
  clearsAt: IsoDateTimeSchema.nullable(),
  id: SimulationFaultIdSchema,
  target: SimulationFaultTargetSchema,
});

export const SimulationFaultSchema = z.discriminatedUnion('kind', [
  SimulationFaultBaseSchema.extend({
    kind: z.literal('offline'),
  }),
  SimulationFaultBaseSchema.extend({
    kind: z.literal('latency'),
    latencyMs: z.number().int().min(0).max(60_000),
  }),
  SimulationFaultBaseSchema.extend({
    code: z.string().min(1),
    failures: z.number().int().positive(),
    kind: z.literal('error'),
  }),
  SimulationFaultBaseSchema.extend({
    assetKey: AssetKeySchema,
    kind: z.literal('media-unavailable'),
  }),
]);
export type SimulationFault = z.infer<typeof SimulationFaultSchema>;

const SimulationEventBaseSchema = z.object({
  at: IsoDateTimeSchema,
  id: SimulationEventIdSchema,
});

export const SimulationDomainEventSchema = z.discriminatedUnion('kind', [
  SimulationEventBaseSchema.extend({
    kind: z.literal('message-created'),
    message: SimulatedMessageSchema,
  }),
  SimulationEventBaseSchema.extend({
    kind: z.literal('notification-created'),
    notification: SimulatedNotificationSchema,
  }),
  SimulationEventBaseSchema.extend({
    kind: z.literal('profile-propagated'),
    profile: SimulatedProfileSchema,
  }),
  SimulationEventBaseSchema.extend({
    assetKey: AssetKeySchema,
    kind: z.literal('media-associated'),
    position: z.number().int().min(0).max(3),
    profileId: ProfileIdSchema,
    slot: z.enum(['avatar', 'cover', 'wall']),
  }),
  SimulationEventBaseSchema.extend({
    kind: z.literal('network-state-changed'),
    state: z.enum(['offline', 'online']),
  }),
  SimulationEventBaseSchema.extend({
    faultId: SimulationFaultIdSchema,
    kind: z.literal('fault-cleared'),
  }),
  SimulationEventBaseSchema.extend({
    kind: z.literal('set-membership-changed'),
    membership: z.enum(['joined', 'left']),
    profileId: ProfileIdSchema,
    setId: SetIdSchema,
  }),
]);
export type SimulationDomainEvent = z.infer<typeof SimulationDomainEventSchema>;

export const SimulationRequiredRelationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('match'),
    profileIds: z.tuple([ProfileIdSchema, ProfileIdSchema]),
  }),
  z.object({
    kind: z.literal('set-membership'),
    profileId: ProfileIdSchema,
    setId: SetIdSchema,
  }),
  z.object({
    conversationId: ConversationIdSchema,
    kind: z.literal('conversation-membership'),
    profileId: ProfileIdSchema,
  }),
  z.object({
    kind: z.literal('notification-conversation-link'),
    notificationId: NotificationIdSchema,
    conversationId: ConversationIdSchema,
    messageId: MessageIdSchema.optional(),
  }),
  z.object({
    assetKey: AssetKeySchema,
    kind: z.literal('asset-state'),
    state: SimulatedAssetStateSchema,
  }),
]);
export type SimulationRequiredRelation = z.infer<
  typeof SimulationRequiredRelationSchema
>;

export const SimulationScenarioDefinitionSchema = z
  .object({
    description: z.string().min(1),
    id: ScenarioIdSchema,
    initialClock: IsoDateTimeSchema,
    initialWorld: SimulationWorldSnapshotSchema,
    requiredRelations: z.array(SimulationRequiredRelationSchema),
    runtime: z.object({
      allowedMutations: z.array(SimulationMutationKindSchema).refine(unique, {
        message: 'Allowed mutations must be unique.',
      }),
      capabilities: z.array(SimulationRuntimeCapabilitySchema).refine(unique, {
        message: 'Runtime capabilities must be unique.',
      }),
      faults: z.array(SimulationFaultSchema),
      initialNetworkState: z.enum(['offline', 'online']),
    }),
    timeline: z.array(SimulationDomainEventSchema),
    title: z.string().min(1),
    version: z.literal(SIMULATION_SCENARIO_VERSION),
  })
  .superRefine((scenario, context) => {
    if (scenario.initialWorld.scenarioId !== scenario.id) {
      context.addIssue({
        code: 'custom',
        message: 'initialWorld.scenarioId must equal scenario id.',
        path: ['initialWorld', 'scenarioId'],
      });
    }
    if (scenario.initialWorld.generatedAt !== scenario.initialClock) {
      context.addIssue({
        code: 'custom',
        message: 'initialWorld.generatedAt must equal initialClock.',
        path: ['initialWorld', 'generatedAt'],
      });
    }
    let previousAt = Date.parse(scenario.initialClock);
    for (const [index, event] of scenario.timeline.entries()) {
      const eventAt = Date.parse(event.at);
      if (eventAt < Date.parse(scenario.initialClock)) {
        context.addIssue({
          code: 'custom',
          message: 'Timeline events cannot occur before initialClock.',
          path: ['timeline', index, 'at'],
        });
      }
      if (eventAt < previousAt) {
        context.addIssue({
          code: 'custom',
          message: 'Timeline events must be ordered by timestamp.',
          path: ['timeline', index, 'at'],
        });
      }
      previousAt = eventAt;
    }
    for (const [index, fault] of scenario.runtime.faults.entries()) {
      if (Date.parse(fault.activatesAt) < Date.parse(scenario.initialClock)) {
        context.addIssue({
          code: 'custom',
          message: 'Faults cannot activate before initialClock.',
          path: ['runtime', 'faults', index, 'activatesAt'],
        });
      }
      if (
        fault.clearsAt &&
        Date.parse(fault.clearsAt) < Date.parse(fault.activatesAt)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Fault clearsAt must not precede activatesAt.',
          path: ['runtime', 'faults', index, 'clearsAt'],
        });
      }
    }
  });

export type SimulationScenarioDefinition = z.infer<
  typeof SimulationScenarioDefinitionSchema
>;
