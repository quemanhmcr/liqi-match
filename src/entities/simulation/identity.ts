import { z } from 'zod';

declare const simulationBrand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [simulationBrand]: Name;
};

export type ProfileId = Brand<string, 'ProfileId'>;
export type SetId = Brand<string, 'SetId'>;
export type MatchId = Brand<string, 'MatchId'>;
export type ConversationId = Brand<string, 'ConversationId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type NotificationId = Brand<string, 'NotificationId'>;
export type AssetKey = Brand<string, 'AssetKey'>;
export type ScenarioId = Brand<string, 'ScenarioId'>;
export type SimulationEventId = Brand<string, 'SimulationEventId'>;
export type SimulationFaultId = Brand<string, 'SimulationFaultId'>;

const idTailPattern = '[a-z0-9][a-z0-9._:-]*';

function brandedIdSchema<Name extends string>(prefix: string) {
  return z
    .string()
    .regex(
      new RegExp(`^${prefix}:${idTailPattern}$`),
      `Expected a canonical ${prefix}:... identifier.`,
    )
    .transform((value) => value as Brand<string, Name>);
}

export const ProfileIdSchema = brandedIdSchema<'ProfileId'>('profile');
export const SetIdSchema = brandedIdSchema<'SetId'>('set');
export const MatchIdSchema = brandedIdSchema<'MatchId'>('match');
export const ConversationIdSchema =
  brandedIdSchema<'ConversationId'>('conversation');
export const MessageIdSchema = brandedIdSchema<'MessageId'>('message');
export const NotificationIdSchema =
  brandedIdSchema<'NotificationId'>('notification');
export const AssetKeySchema = brandedIdSchema<'AssetKey'>('asset');
export const ScenarioIdSchema = brandedIdSchema<'ScenarioId'>('scenario');
export const SimulationEventIdSchema =
  brandedIdSchema<'SimulationEventId'>('event');
export const SimulationFaultIdSchema =
  brandedIdSchema<'SimulationFaultId'>('fault');

export const profileId = (value: string): ProfileId =>
  ProfileIdSchema.parse(value);
export const setId = (value: string): SetId => SetIdSchema.parse(value);
export const matchId = (value: string): MatchId => MatchIdSchema.parse(value);
export const conversationId = (value: string): ConversationId =>
  ConversationIdSchema.parse(value);
export const messageId = (value: string): MessageId =>
  MessageIdSchema.parse(value);
export const notificationId = (value: string): NotificationId =>
  NotificationIdSchema.parse(value);
export const assetKey = (value: string): AssetKey =>
  AssetKeySchema.parse(value);
export const scenarioId = (value: string): ScenarioId =>
  ScenarioIdSchema.parse(value);
export const simulationEventId = (value: string): SimulationEventId =>
  SimulationEventIdSchema.parse(value);
export const simulationFaultId = (value: string): SimulationFaultId =>
  SimulationFaultIdSchema.parse(value);
