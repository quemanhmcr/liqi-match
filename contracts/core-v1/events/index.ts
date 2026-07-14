import { z } from 'zod';

import {
  ConversationBootstrappedEventV1Schema,
  ConversationBootstrapRequestedEventV1Schema,
  ConversationClosedEventV1Schema,
  ConversationCreatedEventV1Schema,
  ConversationReadAdvancedEventV1Schema,
  MatchCreatedEventV1Schema,
  MatchIntentActivatedEventV1Schema,
  MatchIntentChangedEventV1Schema,
  MessageSentEventV1Schema,
  NotificationRequestedEventV1Schema,
  PlayerActivatedEventV1Schema,
  PlayerDeletedEventV1Schema,
  PlayerDeletionRequestedEventV1Schema,
  PlayerLikedEventV1Schema,
  PlayerProfileUpdatedEventV1Schema,
  PlayerResumedEventV1Schema,
  PlayerSuspendedEventV1Schema,
  SetInviteCreatedEventV1Schema,
  SetJoinRequestedEventV1Schema,
} from './events';

export * from './events';

export const CoreEventV1Schema = z.union([
  PlayerActivatedEventV1Schema,
  PlayerProfileUpdatedEventV1Schema,
  PlayerSuspendedEventV1Schema,
  PlayerResumedEventV1Schema,
  PlayerDeletionRequestedEventV1Schema,
  PlayerDeletedEventV1Schema,
  MatchIntentActivatedEventV1Schema,
  MatchIntentChangedEventV1Schema,
  PlayerLikedEventV1Schema,
  MatchCreatedEventV1Schema,
  ConversationBootstrapRequestedEventV1Schema,
  ConversationBootstrappedEventV1Schema,
  ConversationCreatedEventV1Schema,
  ConversationClosedEventV1Schema,
  SetJoinRequestedEventV1Schema,
  SetInviteCreatedEventV1Schema,
  MessageSentEventV1Schema,
  ConversationReadAdvancedEventV1Schema,
  NotificationRequestedEventV1Schema,
]);

export const coreEventV1Schema = CoreEventV1Schema;
export type CoreEventV1 = z.infer<typeof CoreEventV1Schema>;
