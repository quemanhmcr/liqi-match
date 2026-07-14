import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  EngagementPreferencesUpdatedEventV2Schema,
  ActivityItemDismissedEventV2Schema,
  TrustActivityItemV2Schema,
  ConfirmSessionParticipationCommandV2Schema,
  RequestRepeatSessionCommandV2Schema,
  SubmitPlayerEndorsementCommandV2Schema,
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
const readConsumer = (name: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'contracts/core-v2/fixtures/consumer', name),
      'utf8',
    ),
  ) as unknown;

describe('Core V2 trust outcome provider contracts', () => {
  it('consumes a completed-session event with canonical players and timestamps', () => {
    const event = SessionCompletedEventV2Schema.parse(
      readConsumer('session-completed-for-outcome.json'),
    );

    expect(event.aggregateId).toBe(event.payload.sessionId);
    expect(event.payload.verification).toBe('participant_quorum');
    expect(event.payload.participantPlayerIds).toHaveLength(2);
  });

  it('publishes an authoritative participation receipt', () => {
    const receipt = ParticipationCommandReceiptV2Schema.parse(
      read('participation-confirmation-receipt.json'),
    );

    expect(receipt.confirmation.playerId).toBe(
      receipt.outcome.participantPlayerIds[0],
    );
    expect(receipt.outcome.version).toBe(2);
    expect(receipt).toMatchObject({
      aggregateId: receipt.outcome.outcomeId,
      aggregateType: 'session_outcome',
      aggregateVersion: receipt.outcome.version,
      resultCode: 'participation_confirmed',
    });
    expect(receipt.eventIds).toHaveLength(1);
  });

  it('publishes a non-anonymous positive endorsement receipt', () => {
    const receipt = SubmitPlayerEndorsementReceiptV2Schema.parse(
      read('player-endorsement-receipt.json'),
    );

    expect(receipt.endorsement.actorPlayerId).not.toBe(
      receipt.endorsement.targetPlayerId,
    );
    expect(receipt.endorsement.kinds).toContain('would_play_again');
    expect(receipt).toMatchObject({
      aggregateId: receipt.endorsement.endorsementId,
      aggregateType: 'player_endorsement',
      aggregateVersion: receipt.endorsement.version,
      resultCode: 'endorsement_submitted',
    });
    expect(receipt.eventIds).toHaveLength(2);
  });

  it('requires audit metadata and the shared expectedVersion field', () => {
    expect(() =>
      ConfirmSessionParticipationCommandV2Schema.parse({
        correlationId: '43000000-0000-4000-8000-000000000010',
        expectedVersion: 1,
        idempotencyKey: 'core-v2-command-0010',
        sessionId: '42000000-0000-4000-8000-000000000001',
      }),
    ).toThrow();

    expect(
      ConfirmSessionParticipationCommandV2Schema.parse({
        audit: {
          appVersion: '2.0.0',
          clientCreatedAt: '2026-07-14T12:00:00.000Z',
          clientRequestId: '49000000-0000-4000-8000-000000000010',
          platform: 'android',
        },
        correlationId: '43000000-0000-4000-8000-000000000010',
        expectedVersion: 1,
        idempotencyKey: 'core-v2-command-0010',
        sessionId: '42000000-0000-4000-8000-000000000001',
      }),
    ).toMatchObject({ expectedVersion: 1 });
  });

  it('uses create-version zero and explicit dependency versions for new aggregates', () => {
    const audit = {
      appVersion: '2.0.0',
      clientCreatedAt: '2026-07-14T12:00:00.000Z',
      clientRequestId: '49000000-0000-4000-8000-000000000011',
      platform: 'android' as const,
    };
    const base = {
      audit,
      correlationId: '43000000-0000-4000-8000-000000000011',
      expectedVersion: 0,
      idempotencyKey: 'core-v2-command-0011',
    };

    expect(
      SubmitPlayerEndorsementCommandV2Schema.parse({
        ...base,
        expectedOutcomeVersion: 3,
        kinds: ['cooperative'],
        sessionId: '42000000-0000-4000-8000-000000000001',
        targetPlayerId: '20000000-0000-4000-8000-000000000002',
      }),
    ).toMatchObject({ expectedVersion: 0, expectedOutcomeVersion: 3 });

    expect(
      RequestRepeatSessionCommandV2Schema.parse({
        ...base,
        relationshipVersions: [
          {
            teammatePlayerId: '20000000-0000-4000-8000-000000000002',
            version: 0,
          },
        ],
        teammatePlayerIds: ['20000000-0000-4000-8000-000000000002'],
      }),
    ).toMatchObject({
      expectedVersion: 0,
      relationshipVersions: [{ version: 0 }],
    });

    expect(() =>
      RequestRepeatSessionCommandV2Schema.parse({
        ...base,
        relationshipVersions: [],
        teammatePlayerIds: ['20000000-0000-4000-8000-000000000002'],
      }),
    ).toThrow();
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
    const item = TrustActivityItemV2Schema.parse(read('activity-item.json'));

    expect(item.kind).toBe('repeat_play_recommendation');
    expect(item.deduplicationKey).toContain('repeat:');
    expect(item.payload).toMatchObject({
      relationshipVersion: 1,
      teammatePlayerIds: ['20000000-0000-4000-8000-000000000002'],
    });
  });

  it('fails closed for unknown event versions and event types', () => {
    const event = readConsumer('session-completed-for-outcome.json') as Record<
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
  it('types activity dismissal and engagement preference update events', () => {
    const activityItem = {
      activityItemId: '47000000-0000-4000-8000-000000000099',
      createdAt: '2026-07-14T12:00:00.000Z',
      deduplicationKey: 'activity:event-contract:99',
      dismissedAt: '2026-07-14T12:10:00.000Z',
      kind: 'reputation_progress' as const,
      payload: { projectionVersion: 4 },
      playerId: '20000000-0000-4000-8000-000000000001',
      priority: 500,
      version: 2,
    };
    const preferences = {
      activityEnabled: true,
      feedbackPromptsEnabled: false,
      maxReactivationNotificationsPerDay: 1,
      playerId: '20000000-0000-4000-8000-000000000001',
      pushReactivationEnabled: false,
      repeatPlayPromptsEnabled: true,
      updatedAt: '2026-07-14T12:10:00.000Z',
      version: 2,
    };
    const envelope = {
      actorPlayerId: '20000000-0000-4000-8000-000000000001',
      aggregateVersion: 2,
      causationId: null,
      correlationId: '43000000-0000-4000-8000-000000000099',
      eventVersion: 2,
      occurredAt: '2026-07-14T12:10:00.000Z',
    };

    expect(
      ActivityItemDismissedEventV2Schema.parse({
        ...envelope,
        aggregateId: activityItem.activityItemId,
        aggregateType: 'activity_item',
        eventId: '48000000-0000-4000-8000-000000000098',
        eventType: 'activity.item_dismissed.v2',
        payload: { activityItem },
      }).payload.activityItem.dismissedAt,
    ).toBe(activityItem.dismissedAt);
    expect(
      EngagementPreferencesUpdatedEventV2Schema.parse({
        ...envelope,
        aggregateId: preferences.playerId,
        aggregateType: 'engagement_preferences',
        eventId: '48000000-0000-4000-8000-000000000099',
        eventType: 'engagement.preferences_updated.v2',
        payload: { preferences },
      }).payload.preferences.maxReactivationNotificationsPerDay,
    ).toBe(1);
  });
});
