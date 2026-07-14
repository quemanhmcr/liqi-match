import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  ActivityItemV2Schema,
  CoreV2EventSchema,
  PlayerEndorsementV2Schema,
  PlayerTrustProjectionV2Schema,
  SessionCompletedEventV2Schema,
  ParticipationCommandReceiptV2Schema,
  SubmitPlayerEndorsementReceiptV2Schema,
} from '@/shared/contracts/core-v2';

const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v2/fixtures/provider',
);
const read = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8')) as unknown;

describe('Core V2 trust outcome provider contracts', () => {
  it('consumes a completed-session event with canonical players and timestamps', () => {
    const event = SessionCompletedEventV2Schema.parse(
      read('session-completed-event.json'),
    );

    expect(event.aggregateId).toBe(event.payload.sessionId);
    expect(event.aggregateVersion).toBe(event.payload.sessionVersion);
    expect(event.payload.memberPlayerIds).toHaveLength(2);
  });

  it('publishes an authoritative participation receipt', () => {
    const receipt = ParticipationCommandReceiptV2Schema.parse(
      read('participation-confirmation-receipt.json'),
    );

    expect(receipt.confirmation.playerId).toBe(
      receipt.outcome.memberPlayerIds[0],
    );
    expect(receipt.outcome.version).toBe(2);
  });

  it('publishes a non-anonymous positive endorsement receipt', () => {
    const receipt = SubmitPlayerEndorsementReceiptV2Schema.parse(
      read('player-endorsement-receipt.json'),
    );

    expect(receipt.endorsement.actorPlayerId).not.toBe(
      receipt.endorsement.targetPlayerId,
    );
    expect(receipt.endorsement.kinds).toContain('would_play_again');
  });

  it('rejects self endorsement and duplicate endorsement kinds', () => {
    const receipt = SubmitPlayerEndorsementReceiptV2Schema.parse(
      read('player-endorsement-receipt.json'),
    );

    expect(() =>
      PlayerEndorsementV2Schema.parse({
        ...receipt.endorsement,
        targetPlayerId: receipt.endorsement.actorPlayerId,
      }),
    ).toThrow();
    expect(() =>
      PlayerEndorsementV2Schema.parse({
        ...receipt.endorsement,
        kinds: ['cooperative', 'cooperative'],
      }),
    ).toThrow();
  });

  it('keeps the trust projection explainable rather than exposing one score', () => {
    const projection = PlayerTrustProjectionV2Schema.parse(
      read('player-trust-projection.json'),
    );

    expect(projection.completedSessions).toBe(1);
    expect(projection.positiveEndorsements).toBe(2);
    expect(projection).not.toHaveProperty('rating');
    expect(projection).not.toHaveProperty('reputationScore');
  });

  it('publishes a deduplicated activity item', () => {
    const item = ActivityItemV2Schema.parse(read('activity-item.json'));

    expect(item.kind).toBe('repeat_play_recommendation');
    expect(item.deduplicationKey).toContain('repeat:');
  });

  it('fails closed for unknown event versions and event types', () => {
    const event = read('session-completed-event.json') as Record<
      string,
      unknown
    >;

    expect(() =>
      CoreV2EventSchema.parse({ ...event, eventVersion: 3 }),
    ).toThrow();
    expect(() =>
      CoreV2EventSchema.parse({
        ...event,
        eventType: 'session.completed.v3',
      }),
    ).toThrow();
  });
});
