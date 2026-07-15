import type {
  RepeatPlayRequestedEventV2,
  RequestRepeatSessionCommandV2,
  RequestRepeatSessionReceiptV2,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';
import type { RepeatPlayRecommendationProvider } from '@/entities/trust-outcomes';

import { PlaySessionDomainError } from './play-session-error';
import type { RepeatPlaySessionEventConsumer } from './play-session-repository';

export type RepeatPlayRequestedEventLog = Readonly<{
  listEvents(
    eventType?: RepeatPlayRequestedEventV2['eventType'],
  ): readonly RepeatPlayRequestedEventV2[];
}>;

export function createRepeatAwareRecommendationProvider(input: {
  consumer: RepeatPlaySessionEventConsumer;
  delegate: RepeatPlayRecommendationProvider;
  eventLog: RepeatPlayRequestedEventLog;
}): RepeatPlayRecommendationProvider {
  return {
    listRecommendations: (session) =>
      input.delegate.listRecommendations(session),
    async requestRepeatSession(
      session: AuthSession,
      command: RequestRepeatSessionCommandV2,
    ) {
      const receipt = (await input.delegate.requestRepeatSession(
        session,
        command,
      )) as RequestRepeatSessionReceiptV2;
      const eventId = receipt.eventIds[0];
      const event = input.eventLog
        .listEvents('repeat_play.requested.v2')
        .find((candidate) => candidate.eventId === eventId);
      if (!event) {
        throw new PlaySessionDomainError(
          'service_unavailable',
          'Repeat-play command committed without its authoritative event.',
        );
      }
      await input.consumer.consumeRepeatPlayRequested(event);
      return receipt;
    },
  };
}
