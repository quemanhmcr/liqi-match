import { describe, expect, it, jest } from '@jest/globals';

import {
  RepeatPlayRequestedEventV2Schema,
  RequestRepeatSessionReceiptV2Schema,
} from '@/shared/contracts/core-v2';
import {
  CorrelationIdSchema,
  EventIdSchema,
  PlayerIdSchema,
} from '@/shared/contracts/core-v1';

import { InMemoryRepeatPlaySessionService } from '../in-memory-repeat-play-session-service';
import { createRepeatAwareRecommendationProvider } from '../repeat-play-session-bridge';

const REQUESTER = PlayerIdSchema.parse('a5000000-0000-4000-8000-000000000001');
const TEAMMATE = PlayerIdSchema.parse('a5000000-0000-4000-8000-000000000002');
const EVENT_ID = EventIdSchema.parse('a5000000-0000-4000-8000-000000000010');
const CORRELATION_ID = CorrelationIdSchema.parse(
  'a5000000-0000-4000-8000-000000000011',
);

function event(overrides: Record<string, unknown> = {}) {
  return RepeatPlayRequestedEventV2Schema.parse({
    actorPlayerId: REQUESTER,
    aggregateId: 'a5000000-0000-4000-8000-000000000020',
    aggregateType: 'repeat_play_request',
    aggregateVersion: 1,
    causationId: null,
    correlationId: CORRELATION_ID,
    eventId: EVENT_ID,
    eventType: 'repeat_play.requested.v2',
    eventVersion: 2,
    occurredAt: '2026-07-14T12:00:00.000Z',
    payload: {
      requestId: 'a5000000-0000-4000-8000-000000000020',
      requesterPlayerId: REQUESTER,
      teammatePlayerIds: [TEAMMATE],
    },
    ...overrides,
  });
}

function service(blocked = false) {
  let sequence = 100;
  return new InMemoryRepeatPlaySessionService({
    createUuid: () =>
      `a5000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    lifecycleProvider: { assertActive: async () => undefined },
    relationshipProvider: {
      getInviteEligibility: async () => ({
        allowed: !blocked,
        blocked,
        reasonCodes: blocked ? ['blocked'] : [],
      }),
    },
    sourceProvider: {
      getMatchParticipantIds: async () => [],
      getSetSnapshot: async () => {
        throw new Error('unused');
      },
    },
  });
}

describe('Repeat Play → Session consumer', () => {
  it('creates one causally linked Session with pending teammate invite', async () => {
    const authority = service();
    const receipt = await authority.consumeRepeatPlayRequested(event());
    const session = receipt.session;

    expect(session.source).toEqual({
      kind: 'repeat_play',
      requestId: event().payload.requestId,
    });
    expect(session.ownerPlayerId).toBe(REQUESTER);
    expect(authority.listSessionInvites(session.sessionId)).toHaveLength(1);
    const emitted = authority.listEvents(session.sessionId);
    expect(emitted.map((item) => item.eventType)).toEqual([
      'session.created.v2',
      'session.invite_created.v2',
    ]);
    expect(emitted[0]?.causationId).toBe(EVENT_ID);
    expect(emitted[1]?.causationId).toBe(emitted[0]?.eventId);
  });

  it('replays the same event without a duplicate Session', async () => {
    const authority = service();
    const first = await authority.consumeRepeatPlayRequested(event());
    const replay = await authority.consumeRepeatPlayRequested(event());
    expect(replay.aggregateId).toBe(first.aggregateId);
    expect(replay.repeated).toBe(true);
    expect(authority.listEvents()).toHaveLength(2);
  });

  it('fails closed when current relationship authority blocks a teammate', async () => {
    const authority = service(true);
    await expect(
      authority.consumeRepeatPlayRequested(event()),
    ).rejects.toMatchObject({ code: 'relationship_blocked' });
    expect(authority.listEvents()).toHaveLength(0);
  });

  it('bridges only the exact event listed in the authoritative receipt', async () => {
    const repeatEvent = event();
    const receipt = RequestRepeatSessionReceiptV2Schema.parse({
      aggregateId: repeatEvent.aggregateId,
      aggregateType: 'repeat_play_request',
      aggregateVersion: 1,
      commandName: 'request_repeat_session_v2',
      correlationId: CORRELATION_ID,
      eventIds: [EVENT_ID],
      occurredAt: repeatEvent.occurredAt,
      repeated: false,
      requestId: repeatEvent.payload.requestId,
      resultCode: 'repeat_session_requested',
      teammatePlayerIds: [TEAMMATE],
    });
    const consume = jest.fn(async () => ({}) as never);
    const provider = createRepeatAwareRecommendationProvider({
      consumer: { consumeRepeatPlayRequested: consume },
      delegate: {
        listRecommendations: async () => [],
        requestRepeatSession: async () => receipt,
      },
      eventLog: { listEvents: () => [repeatEvent] },
    });

    await provider.requestRepeatSession({} as never, {} as never);
    expect(consume).toHaveBeenCalledWith(repeatEvent);
  });
});
