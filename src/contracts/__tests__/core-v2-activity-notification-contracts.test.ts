import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  ActivityNotificationRequestV2Schema,
  ActivityNotificationTargetV2Schema,
} from '@/shared/contracts/core-v2';

const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v2/fixtures/consumer',
);
const read = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8')) as unknown;

describe('Core V2 activity notification contracts', () => {
  it('requires feedback prompts to carry a canonical session feedback target', () => {
    const request = ActivityNotificationRequestV2Schema.parse(
      read('activity-feedback-notification-request.json'),
    );
    expect(request.target).toMatchObject({
      target: 'session_feedback',
      sessionId: '45000000-0000-4000-8000-000000000001',
    });
  });

  it('requires activity kind and target semantics to agree', () => {
    const request = ActivityNotificationRequestV2Schema.parse(
      read('activity-feedback-notification-request.json'),
    );
    expect(() =>
      ActivityNotificationRequestV2Schema.parse({
        ...request,
        target: {
          target: 'reputation',
          playerId: request.activityItem.playerId,
        },
      }),
    ).toThrow();
  });

  it('rejects push without an inbox-visible authoritative activity item', () => {
    const request = ActivityNotificationRequestV2Schema.parse(
      read('activity-feedback-notification-request.json'),
    );
    expect(() =>
      ActivityNotificationRequestV2Schema.parse({
        ...request,
        deliveryDecision: {
          ...request.deliveryDecision,
          inboxAllowed: false,
        },
      }),
    ).toThrow();
  });

  it('rejects duplicate teammates in repeat-play targets', () => {
    expect(() =>
      ActivityNotificationTargetV2Schema.parse({
        sourceSessionId: null,
        target: 'repeat_play',
        teammatePlayerIds: [
          '20000000-0000-4000-8000-000000000002',
          '20000000-0000-4000-8000-000000000002',
        ],
      }),
    ).toThrow();
  });
});
