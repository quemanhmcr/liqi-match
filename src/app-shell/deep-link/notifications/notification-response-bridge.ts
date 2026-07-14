import { PushNotificationNavigationDataV1Schema } from '@/shared/contracts/core-v1';

import type { PersistedDeepLinkIntentStore } from '../persisted-deep-link-intent-store';

export type NotificationResponseLike = Readonly<{
  notification: Readonly<{
    request: Readonly<{
      content: Readonly<{ data: unknown }>;
      identifier: string;
    }>;
  }>;
}>;

export type NotificationResponseSubscription = Readonly<{
  remove(): void;
}>;

export type NotificationResponseSource = Readonly<{
  addResponseListener(
    listener: (response: NotificationResponseLike) => void,
  ): NotificationResponseSubscription;
  clearLastResponse(): Promise<void>;
  getLastResponse(): Promise<NotificationResponseLike | null>;
}>;

export type NotificationResponseBridgeLogger = Readonly<{
  error(message: string, error: unknown): void;
}>;

export type NotificationResponseBridgeOptions = Readonly<{
  clock?: () => Date;
  intentTtlMs?: number;
  logger?: NotificationResponseBridgeLogger;
  onIntentEnqueued?: () => void;
  source: NotificationResponseSource;
  store: PersistedDeepLinkIntentStore;
}>;

const defaultIntentTtlMs = 7 * 24 * 60 * 60 * 1000;

export class NotificationResponseBridge {
  private subscription: NotificationResponseSubscription | null = null;
  private startPromise: Promise<void> | null = null;

  private readonly clock: () => Date;
  private readonly intentTtlMs: number;
  private readonly logger: NotificationResponseBridgeLogger;
  private readonly onIntentEnqueued: () => void;

  constructor(private readonly options: NotificationResponseBridgeOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.intentTtlMs = options.intentTtlMs ?? defaultIntentTtlMs;
    this.logger = options.logger ?? console;
    this.onIntentEnqueued = options.onIntentEnqueued ?? (() => undefined);
  }

  start(): Promise<void> {
    if (this.startPromise) return this.startPromise;

    this.subscription = this.options.source.addResponseListener((response) => {
      void this.enqueue(response).catch((error: unknown) => {
        this.logger.error('Failed to enqueue notification response.', error);
      });
    });
    this.startPromise = this.restoreColdStartResponse();
    return this.startPromise;
  }

  stop() {
    this.subscription?.remove();
    this.subscription = null;
    this.startPromise = null;
  }

  private async restoreColdStartResponse() {
    const response = await this.options.source.getLastResponse();
    if (!response) return;

    try {
      await this.enqueue(response);
    } catch (error) {
      this.logger.error(
        'Failed to restore cold-start notification response.',
        error,
      );
    } finally {
      await this.options.source.clearLastResponse();
    }
  }

  private async enqueue(response: NotificationResponseLike) {
    const payload = PushNotificationNavigationDataV1Schema.parse(
      response.notification.request.content.data,
    );
    const now = this.clock();
    await this.options.store.enqueue({
      accountId: null,
      deepLink: payload.deepLink,
      enqueuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.intentTtlMs).toISOString(),
      intentId: `notification:${payload.notificationId}`,
      notificationId: payload.notificationId,
      source: 'notification-response',
      sourceEventId: payload.sourceEventId,
    });
    this.onIntentEnqueued();
  }
}
