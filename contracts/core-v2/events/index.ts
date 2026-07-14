import { z } from 'zod';

import {
  SessionCancelledEventV2Schema,
  SessionCompletedEventV2Schema,
  SessionCompletionProposedEventV2Schema,
  SessionCreatedEventV2Schema,
  SessionDisputedEventV2Schema,
  SessionMemberJoinedEventV2Schema,
  SessionMemberLeftEventV2Schema,
  SessionMemberReadyEventV2Schema,
  SessionReadyCheckOpenedEventV2Schema,
  SessionReadyCheckPassedEventV2Schema,
  SessionRoleAssignedEventV2Schema,
  SessionScheduledEventV2Schema,
  SessionStartedEventV2Schema,
  SetClosedEventV2Schema,
  SetCreatedEventV2Schema,
  SetMemberJoinedEventV2Schema,
  SetMemberRemovedEventV2Schema,
} from './events';

export * from './events';

export const CoreV2EventSchema = z.discriminatedUnion('eventType', [
  SetCreatedEventV2Schema,
  SetMemberJoinedEventV2Schema,
  SetMemberRemovedEventV2Schema,
  SetClosedEventV2Schema,
  SessionCreatedEventV2Schema,
  SessionMemberJoinedEventV2Schema,
  SessionMemberLeftEventV2Schema,
  SessionRoleAssignedEventV2Schema,
  SessionReadyCheckOpenedEventV2Schema,
  SessionMemberReadyEventV2Schema,
  SessionReadyCheckPassedEventV2Schema,
  SessionScheduledEventV2Schema,
  SessionStartedEventV2Schema,
  SessionCompletionProposedEventV2Schema,
  SessionCompletedEventV2Schema,
  SessionCancelledEventV2Schema,
  SessionDisputedEventV2Schema,
]);

export type CoreV2Event = z.infer<typeof CoreV2EventSchema>;
