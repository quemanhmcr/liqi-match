import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  CoreEventV1Schema,
  NotificationDeepLinkResolutionV1Schema,
  NotificationPresenceV1Schema,
  NotificationV1Schema,
  PushDeviceRegistrationV1Schema,
  PushNotificationNavigationDataV1Schema,
  ReturnLoopApiE2eRunV1Schema,
  ReturnLoopReleaseReadinessV1Schema,
} from '../../../contracts/core-v1';

const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v1/fixtures/provider',
);
const read = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8')) as unknown;

describe('Return Loop Core V1 contracts', () => {
  it.each([
    'notification-unseen.json',
    'notification-seen-unread.json',
    'notification-read.json',
  ])('validates persisted notification fixture %s', (name) => {
    expect(NotificationV1Schema.parse(read(name))).toBeTruthy();
  });

  it.each([
    'notification-deep-link-available.json',
    'notification-deep-link-expired.json',
  ])('validates deep-link resolution fixture %s', (name) => {
    expect(
      NotificationDeepLinkResolutionV1Schema.parse(read(name)),
    ).toBeTruthy();
  });

  it('validates push registration, foreground presence and navigation data', () => {
    expect(
      PushDeviceRegistrationV1Schema.parse(
        read('push-device-registration.json'),
      ),
    ).toBeTruthy();
    expect(
      NotificationPresenceV1Schema.parse(
        read('notification-presence-foreground.json'),
      ),
    ).toBeTruthy();
    expect(
      PushNotificationNavigationDataV1Schema.parse(
        read('push-navigation-data.json'),
      ),
    ).toBeTruthy();
  });

  it('validates machine-readable release evidence and readiness', () => {
    expect(
      ReturnLoopApiE2eRunV1Schema.parse(read('return-loop-api-e2e-passed.json'))
        .status,
    ).toBe('passed');
    expect(
      ReturnLoopReleaseReadinessV1Schema.parse(
        read('return-loop-release-ready.json'),
      ).ready,
    ).toBe(true);
  });

  it('adds Match Intent changes without dropping existing lifecycle events', () => {
    expect(
      CoreEventV1Schema.parse(read('match-intent-changed-event.json'))
        .eventType,
    ).toBe('match_intent.changed.v1');
    expect(
      CoreEventV1Schema.parse(read('player-resumed-event.json')).eventType,
    ).toBe('player.resumed.v1');
  });

  it('keeps provider schemas strict and lifecycle-compatible', () => {
    expect(() =>
      NotificationV1Schema.parse({
        ...(read('notification-unseen.json') as object),
        unknownField: true,
      }),
    ).toThrow();
    expect(() =>
      NotificationDeepLinkResolutionV1Schema.parse({
        ...(read('notification-deep-link-available.json') as object),
        deepLink: null,
      }),
    ).toThrow();
  });
});
