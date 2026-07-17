import { SessionCompletedEventV2Schema } from '@/shared/contracts/core-v2';
import type {
  PlaySessionCommandService,
  PlaySessionEventLog,
} from '@/entities/play-session';

import type { SessionOutcomeRepository } from './trust-outcomes-repositories';

export function createTrustAwarePlaySessionCommandService(input: {
  delegate: PlaySessionCommandService;
  eventLog: PlaySessionEventLog;
  sessionOutcomeRepository: SessionOutcomeRepository;
}): PlaySessionCommandService {
  return {
    acceptInvite: (...args) => input.delegate.acceptInvite(...args),
    declineInvite: (...args) => input.delegate.declineInvite(...args),
    assignRole: (...args) => input.delegate.assignRole(...args),
    cancel: (...args) => input.delegate.cancel(...args),
    create: (...args) => input.delegate.create(...args),
    createFromMatch: (...args) => input.delegate.createFromMatch(...args),
    createFromSet: (...args) => input.delegate.createFromSet(...args),
    invite: (...args) => input.delegate.invite(...args),
    leave: (...args) => input.delegate.leave(...args),
    openReadyCheck: (...args) => input.delegate.openReadyCheck(...args),
    async proposeCompletion(...args) {
      const receipt = await input.delegate.proposeCompletion(...args);
      const emittedIds = new Set(receipt.eventIds);
      for (const event of input.eventLog.listEvents(
        receipt.session.sessionId,
      )) {
        if (!emittedIds.has(event.eventId)) continue;
        const completed = SessionCompletedEventV2Schema.safeParse(event);
        if (!completed.success) continue;
        await input.sessionOutcomeRepository.consumeCompletedSession(
          completed.data,
        );
      }
      return receipt;
    },
    removeMember: (...args) => input.delegate.removeMember(...args),
    respondReadyCheck: (...args) => input.delegate.respondReadyCheck(...args),
    schedule: (...args) => input.delegate.schedule(...args),
    start: (...args) => input.delegate.start(...args),
  };
}
