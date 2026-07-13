import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

function semanticUuid<Name extends string>(name: Name) {
  return z
    .string()
    .uuid()
    .transform((value) => value as Brand<string, Name>);
}

export type AccountId = Brand<string, 'AccountId'>;
export type PlayerId = Brand<string, 'PlayerId'>;
export type ProfileId = Brand<string, 'ProfileId'>;
export type MatchIntentId = Brand<string, 'MatchIntentId'>;
export type MatchId = Brand<string, 'MatchId'>;
export type ConversationId = Brand<string, 'ConversationId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;
export type EventId = Brand<string, 'EventId'>;
export type SetId = Brand<string, 'SetId'>;

export const AccountIdSchema = semanticUuid('AccountId');
export const PlayerIdSchema = semanticUuid('PlayerId');
export const ProfileIdSchema = semanticUuid('ProfileId');
export const MatchIntentIdSchema = semanticUuid('MatchIntentId');
export const MatchIdSchema = semanticUuid('MatchId');
export const ConversationIdSchema = semanticUuid('ConversationId');
export const CorrelationIdSchema = semanticUuid('CorrelationId');
export const EventIdSchema = semanticUuid('EventId');
export const SetIdSchema = semanticUuid('SetId');
