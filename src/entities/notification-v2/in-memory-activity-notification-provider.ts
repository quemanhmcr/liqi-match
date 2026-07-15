import {
  ActivityNotificationClickFactV2Schema,
  ActivityNotificationReceiptV2Schema,
  ActivityNotificationRequestV2Schema,
  ActivityNotificationRequestedEventV2Schema,
  EventIdSchema,
  type ActivityNotificationClickFactV2,
  type ActivityNotificationReceiptV2,
  type ActivityNotificationRequestV2,
  type ActivityNotificationRequestedEventV2,
} from '@/shared/contracts/core-v2';

import type {
  ActivityNotificationDeliveryRuntimeV2,
  ActivityNotificationProviderV2,
} from './activity-notification-provider';
import { ActivityNotificationProviderError } from './activity-notification-provider-error';

export class InMemoryActivityNotificationProviderV2 implements ActivityNotificationProviderV2 {
  private readonly requestReceipts = new Map<
    string,
    { fingerprint: string; receipt: ActivityNotificationReceiptV2 }
  >();
  private readonly deduplicatedReceipts = new Map<
    string,
    ActivityNotificationReceiptV2
  >();
  private readonly clickFactsByRequest = new Map<
    string,
    ActivityNotificationClickFactV2
  >();
  private readonly eventLog: ActivityNotificationRequestedEventV2[] = [];

  constructor(
    private readonly runtime: ActivityNotificationDeliveryRuntimeV2 = {
      canQueuePush: () => true,
    },
    private readonly createUuid: () => string = createNativeUuid,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  events() {
    return [...this.eventLog];
  }

  clicks() {
    return [...this.clickFactsByRequest.values()];
  }

  async request(input: ActivityNotificationRequestV2) {
    const request = ActivityNotificationRequestV2Schema.parse(input);
    const fingerprint = stableJson(request);
    const eventReplay = this.requestReceipts.get(request.sourceEventId);
    if (eventReplay) {
      if (eventReplay.fingerprint !== fingerprint) {
        throw new ActivityNotificationProviderError(
          'activity_notification_event_replay_conflict',
        );
      }
      return { ...eventReplay.receipt, repeated: true };
    }

    const deduplicationIdentity = `${request.activityItem.playerId}:${request.activityItem.deduplicationKey}`;
    const semanticReplay = this.deduplicatedReceipts.get(deduplicationIdentity);
    if (semanticReplay) {
      const receipt = { ...semanticReplay, repeated: true };
      this.requestReceipts.set(request.sourceEventId, { fingerprint, receipt });
      return receipt;
    }

    const supplierInboxAllowed = request.deliveryDecision.inboxAllowed;
    const supplierPushAllowed = request.deliveryDecision.pushAllowed;
    const runtimePushAllowed =
      supplierPushAllowed && this.runtime.canQueuePush(request);
    const notificationRequestId = this.createUuid();
    const receipt = ActivityNotificationReceiptV2Schema.parse({
      activityItemId: request.activityItem.activityItemId,
      correlationId: request.correlationId,
      deduplicationKey: request.activityItem.deduplicationKey,
      inboxStatus: supplierInboxAllowed ? 'queued' : 'suppressed_by_supplier',
      notificationRequestId,
      pushStatus: supplierPushAllowed
        ? runtimePushAllowed
          ? 'queued'
          : 'suppressed_by_delivery_runtime'
        : 'suppressed_by_supplier',
      recipientPlayerId: request.activityItem.playerId,
      repeated: false,
      sourceEventId: request.sourceEventId,
      target: request.target,
    });
    this.requestReceipts.set(request.sourceEventId, { fingerprint, receipt });
    this.deduplicatedReceipts.set(deduplicationIdentity, receipt);

    const eventId = EventIdSchema.parse(this.createUuid());
    this.eventLog.push(
      ActivityNotificationRequestedEventV2Schema.parse({
        actorPlayerId: null,
        aggregateId: notificationRequestId,
        aggregateType: 'notification_request',
        aggregateVersion: 1,
        causationId: request.sourceEventId,
        correlationId: request.correlationId,
        eventId,
        eventType: 'notification.requested.v2',
        eventVersion: 2,
        occurredAt: this.clock().toISOString(),
        payload: { receipt },
      }),
    );
    return receipt;
  }

  async recordClick(input: ActivityNotificationClickFactV2) {
    const click = ActivityNotificationClickFactV2Schema.parse(input);
    const existing = this.clickFactsByRequest.get(click.notificationRequestId);
    if (existing && stableJson(existing) !== stableJson(click)) {
      throw new ActivityNotificationProviderError(
        'activity_notification_click_conflict',
      );
    }
    this.clickFactsByRequest.set(click.notificationRequestId, click);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function createNativeUuid() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('expo-crypto') as typeof import('expo-crypto');
  return crypto.randomUUID();
}
