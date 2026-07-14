import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

function semanticUuid<Name extends string>(name: Name) {
  return z
    .string()
    .uuid()
    .transform((value) => value as Brand<string, Name>);
}

function semanticString<Name extends string>(
  name: Name,
  options: Readonly<{ max: number; min: number; pattern?: RegExp }>,
) {
  let schema = z.string().min(options.min).max(options.max);
  if (options.pattern) schema = schema.regex(options.pattern);
  return schema.transform((value) => value as Brand<string, Name>);
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
export type SessionId = Brand<string, 'SessionId'>;
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;
export type RequestId = Brand<string, 'RequestId'>;
export type NotificationId = Brand<string, 'NotificationId'>;

export const AccountIdSchema = semanticUuid('AccountId');
export const PlayerIdSchema = semanticUuid('PlayerId');
export const ProfileIdSchema = semanticUuid('ProfileId');
export const MatchIntentIdSchema = semanticUuid('MatchIntentId');
export const MatchIdSchema = semanticUuid('MatchId');
export const ConversationIdSchema = semanticUuid('ConversationId');
export const CorrelationIdSchema = semanticUuid('CorrelationId');
export const EventIdSchema = semanticUuid('EventId');
export const SetIdSchema = semanticUuid('SetId');
export const SessionIdSchema = semanticUuid('SessionId');
export const IdempotencyKeySchema = semanticString('IdempotencyKey', {
  max: 128,
  min: 16,
  pattern: /^[A-Za-z0-9._:-]+$/,
});
export const NotificationIdSchema = semanticUuid('NotificationId');
export const RequestIdSchema = semanticString('RequestId', {
  max: 160,
  min: 8,
});

export const MatchSetIdSchema = z.string().uuid().brand<'MatchSetId'>();
export type MatchSetId = z.infer<typeof MatchSetIdSchema>;

export const SetInviteIdSchema = z.string().uuid().brand<'SetInviteId'>();
export type SetInviteId = z.infer<typeof SetInviteIdSchema>;

export const SetJoinRequestIdSchema = z
  .string()
  .uuid()
  .brand<'SetJoinRequestId'>();
export type SetJoinRequestId = z.infer<typeof SetJoinRequestIdSchema>;
