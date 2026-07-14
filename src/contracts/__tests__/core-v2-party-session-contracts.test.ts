import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  CancelSessionCommandV2Schema,
  CoreV2EventSchema,
  PlaySessionSnapshotV2Schema,
  SessionCompletedEventV2Schema,
  SessionCreatedEventV2Schema,
  SessionMemberJoinedEventV2Schema,
  SocialRelationshipSnapshotV2Schema,
} from '../../../contracts/core-v2';

const root = path.join(process.cwd(), 'contracts/core-v2/fixtures');
const read = (group: 'provider' | 'consumer', name: string) =>
  JSON.parse(fs.readFileSync(path.join(root, group, name), 'utf8')) as unknown;

describe('Core V2 party and play-session contracts', () => {
  it('publishes session.created.v2 as the conversation provisioning seam', () => {
    const event = SessionCreatedEventV2Schema.parse(
      read('consumer', 'session-created-for-conversation.json'),
    );

    expect(event.eventVersion).toBe(2);
    expect(event.payload.communicationProvisioningRequired).toBe(false);
    expect(event.payload.membership).toEqual({
      members: [
        {
          playerId: '82000000-0000-4000-8000-000000000001',
          role: 'owner',
        },
      ],
      membershipVersion: 1,
      sessionId: '82000000-0000-4000-8000-000000000101',
    });
    expect(event.payload.session.communication.status).toBe('pending');
  });

  it('fails session invitation eligibility closed when Senior 1 reports a block', () => {
    const relationship = SocialRelationshipSnapshotV2Schema.parse(
      read('consumer', 'relationship-blocked.json'),
    );

    expect(relationship.capabilities.blocked).toBe(true);
    expect(relationship.capabilities.canInviteToSession).toBe(false);
  });

  it('publishes full versioned membership for conversation reconciliation', () => {
    const event = SessionMemberJoinedEventV2Schema.parse(
      read('provider', 'session-member-joined.json'),
    );

    expect(event.aggregateVersion).toBe(2);
    expect(event.payload.membership.membershipVersion).toBe(2);
    expect(event.payload.membership.members).toEqual([
      {
        playerId: '82000000-0000-4000-8000-000000000001',
        role: 'owner',
      },
      {
        playerId: '82000000-0000-4000-8000-000000000002',
        role: 'member',
      },
    ]);
  });

  it('publishes only quorum-completed sessions to the outcome seam', () => {
    const event = SessionCompletedEventV2Schema.parse(
      read('consumer', 'session-completed-for-outcome.json'),
    );

    expect(event.payload.verification).toBe('participant_quorum');
    expect(event.payload.participantPlayerIds).toHaveLength(2);
  });

  it('rejects unsupported event versions instead of guessing semantics', () => {
    expect(() =>
      CoreV2EventSchema.parse({
        ...(read('provider', 'session-created.json') as object),
        eventVersion: 3,
      }),
    ).toThrow();
  });

  it('rejects impossible completed snapshots', () => {
    const created = SessionCreatedEventV2Schema.parse(
      read('provider', 'session-created.json'),
    );

    expect(() =>
      PlaySessionSnapshotV2Schema.parse({
        ...created.payload.session,
        completedAt: null,
        state: 'completed',
      }),
    ).toThrow();
  });

  it('requires a stable cancellation reason', () => {
    const audit = {
      appVersion: '2.0.0',
      clientCreatedAt: '2026-07-14T12:00:00.000Z',
      clientRequestId: '82000000-0000-4000-8000-000000000501',
      platform: 'android',
    };

    expect(() =>
      CancelSessionCommandV2Schema.parse({
        audit,
        correlationId: '82000000-0000-4000-8000-000000000502',
        expectedVersion: 2,
        idempotencyKey: 'session-cancel.82000000-0000-4000-8000-000000000503',
        reason: '',
        sessionId: '82000000-0000-4000-8000-000000000101',
      }),
    ).toThrow();
  });
});
