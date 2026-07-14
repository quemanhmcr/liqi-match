import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  ActivityNotificationClickFactV2Schema,
  ActivityNotificationRequestV2Schema,
  CorrelationIdSchema,
  EventIdSchema,
} from '@/shared/contracts/core-v2';

import { ActivityNotificationProviderError } from '../activity-notification-provider-error';
import { InMemoryActivityNotificationProviderV2 } from '../in-memory-activity-notification-provider';

const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v2/fixtures/consumer',
);

function fixture(name: string) {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, name), 'utf8'),
  ) as unknown;
}

function createProvider(canQueuePush = true) {
  let id = 900;
  return new InMemoryActivityNotificationProviderV2(
    { canQueuePush: () => canQueuePush },
    () => uuid(id++),
    () => new Date('2026-07-14T12:30:00.000Z'),
  );
}

describe('Core V2 activity notification consumer contract', () => {
  it('preserves feedback session target and correlation through delivery and click facts', async () => {
    const provider = createProvider();
    const request = ActivityNotificationRequestV2Schema.parse(
      fixture('activity-feedback-notification-request.json'),
    );

    const receipt = await provider.request(request);
    expect(receipt).toMatchObject({
      correlationId: request.correlationId,
      inboxStatus: 'queued',
      pushStatus: 'queued',
      recipientPlayerId: request.activityItem.playerId,
      sourceEventId: request.sourceEventId,
      target: {
        target: 'session_feedback',
        sessionId: '45000000-0000-4000-8000-000000000001',
      },
    });
    expect(provider.events()[0]).toMatchObject({
      causationId: request.sourceEventId,
      correlationId: request.correlationId,
      eventType: 'notification.requested.v2',
      payload: { receipt },
    });

    const click = ActivityNotificationClickFactV2Schema.parse({
      activityItemId: request.activityItem.activityItemId,
      clickedAt: '2026-07-14T12:31:00.000Z',
      correlationId: receipt.correlationId,
      notificationRequestId: receipt.notificationRequestId,
      recipientPlayerId: receipt.recipientPlayerId,
      sourceEventId: receipt.sourceEventId,
      target: receipt.target,
    });
    await provider.recordClick(click);
    await provider.recordClick(click);
    expect(provider.clicks()).toEqual([click]);
  });

  it('does not recalculate Senior 4 frequency eligibility', async () => {
    const provider = createProvider();
    const request = ActivityNotificationRequestV2Schema.parse(
      fixture('activity-frequency-capped-request.json'),
    );

    const receipt = await provider.request(request);
    expect(request.deliveryDecision).toMatchObject({
      reason: 'frequency_capped',
      reactivationNotificationsUsed: 2,
      maxReactivationNotificationsPerDay: 2,
    });
    expect(receipt).toMatchObject({
      inboxStatus: 'queued',
      pushStatus: 'suppressed_by_supplier',
    });
  });

  it('applies runtime push suppression without changing supplier eligibility facts', async () => {
    const provider = createProvider(false);
    const request = ActivityNotificationRequestV2Schema.parse(
      fixture('activity-feedback-notification-request.json'),
    );

    const receipt = await provider.request(request);
    expect(request.deliveryDecision).toMatchObject({
      reason: 'eligible',
      pushAllowed: true,
    });
    expect(receipt).toMatchObject({
      inboxStatus: 'queued',
      pushStatus: 'suppressed_by_delivery_runtime',
    });
  });

  it('deduplicates by recipient and Senior 4 deduplication key across event retries', async () => {
    const provider = createProvider();
    const first = ActivityNotificationRequestV2Schema.parse(
      fixture('activity-feedback-notification-request.json'),
    );
    const firstReceipt = await provider.request(first);
    const replayReceipt = await provider.request({
      ...first,
      sourceEventId: EventIdSchema.parse(uuid(950)),
    });

    expect(replayReceipt).toMatchObject({
      notificationRequestId: firstReceipt.notificationRequestId,
      repeated: true,
    });
    expect(provider.events()).toHaveLength(1);
  });

  it('rejects a source event replayed with different delivery facts', async () => {
    const provider = createProvider();
    const request = ActivityNotificationRequestV2Schema.parse(
      fixture('activity-feedback-notification-request.json'),
    );
    await provider.request(request);

    await expect(
      provider.request({
        ...request,
        correlationId: CorrelationIdSchema.parse(uuid(951)),
      }),
    ).rejects.toMatchObject({
      code: 'activity_notification_event_replay_conflict',
    } satisfies Partial<ActivityNotificationProviderError>);
  });

  it('rejects a click identity rebound to different correlation context', async () => {
    const provider = createProvider();
    const request = ActivityNotificationRequestV2Schema.parse(
      fixture('activity-feedback-notification-request.json'),
    );
    const receipt = await provider.request(request);
    const click = ActivityNotificationClickFactV2Schema.parse({
      activityItemId: request.activityItem.activityItemId,
      clickedAt: '2026-07-14T12:31:00.000Z',
      correlationId: receipt.correlationId,
      notificationRequestId: receipt.notificationRequestId,
      recipientPlayerId: receipt.recipientPlayerId,
      sourceEventId: receipt.sourceEventId,
      target: receipt.target,
    });
    await provider.recordClick(click);

    await expect(
      provider.recordClick({
        ...click,
        correlationId: CorrelationIdSchema.parse(uuid(952)),
      }),
    ).rejects.toMatchObject({
      code: 'activity_notification_click_conflict',
    } satisfies Partial<ActivityNotificationProviderError>);
  });
});

function uuid(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}
