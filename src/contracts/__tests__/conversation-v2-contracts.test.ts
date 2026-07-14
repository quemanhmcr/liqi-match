import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  ConversationAccessRevokedEventV2Schema,
  ConversationCommandReceiptV2Schema,
  ConversationEventV2Schema,
  ConversationSourceV2Schema,
  ConversationSystemActivityInputV2Schema,
  CoreV2EventEnvelopeSchema,
  ProvisionSessionConversationCommandV2Schema,
  ReconcileConversationMembershipCommandV2Schema,
  RelationshipConversationAccessEventV2Schema,
  RelationshipConversationProjectionInputV2Schema,
} from '../../../contracts/core-v2';

const uuid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

const metadata = {
  idempotencyKey: `conversation-v2:${uuid(1)}`,
  correlationId: uuid(2),
  causationId: null,
  expectedAggregateVersion: 0,
  audit: {
    requestId: 'request-contract-1',
    clientCreatedAt: '2026-07-14T12:00:00.000Z',
    clientPlatform: 'simulation',
  },
};

describe('Core V2 conversation contracts', () => {
  it('uses a strict shared versioned event envelope', () => {
    expect(
      CoreV2EventEnvelopeSchema.parse({
        eventId: uuid(3),
        eventType: 'conversation.provisioned.v2',
        eventVersion: 2,
        aggregateType: 'conversation',
        aggregateId: uuid(4),
        aggregateVersion: 1,
        actorPlayerId: uuid(5),
        correlationId: uuid(2),
        causationId: null,
        occurredAt: '2026-07-14T12:00:00.000Z',
        payload: {},
      }).eventVersion,
    ).toBe(2);
  });

  it('keeps source semantics explicit and versioned', () => {
    const source = ConversationSourceV2Schema.parse({
      sourceType: 'play_session',
      sourceId: uuid(6),
      sourceAggregateVersion: 3,
    });
    expect(source.sourceType).toBe('play_session');
    expect(source.sourceAggregateVersion).toBe(3);
  });

  it('requires create commands to expect aggregate version zero', () => {
    expect(() =>
      ProvisionSessionConversationCommandV2Schema.parse({
        source: {
          sourceType: 'play_session',
          sourceId: uuid(6),
          sourceAggregateVersion: 1,
        },
        title: 'Session group',
        membership: {
          sessionId: uuid(6),
          membershipVersion: 1,
          members: [
            { playerId: uuid(7), role: 'owner' },
            { playerId: uuid(8), role: 'member' },
          ],
        },
        metadata: { ...metadata, expectedAggregateVersion: 1 },
      }),
    ).toThrow();
  });

  it('separates session aggregate and membership versions', () => {
    const command = ReconcileConversationMembershipCommandV2Schema.parse({
      conversationId: uuid(4),
      source: {
        sourceType: 'play_session',
        sourceId: uuid(6),
        sourceAggregateVersion: 5,
      },
      membership: {
        sessionId: uuid(6),
        membershipVersion: 3,
        members: [
          { playerId: uuid(7), role: 'owner' },
          { playerId: uuid(8), role: 'member' },
        ],
      },
      revocationReason: 'source_membership_revoked',
      metadata: { ...metadata, expectedAggregateVersion: 1 },
    });
    expect(command.source.sourceAggregateVersion).toBe(5);
    expect(command.membership.membershipVersion).toBe(3);
  });

  it('rejects unsupported event versions at the typed consumer boundary', () => {
    expect(() =>
      ConversationEventV2Schema.parse({
        eventId: uuid(3),
        eventType: 'conversation.provisioned.v2',
        eventVersion: 3,
        aggregateType: 'conversation',
        aggregateId: uuid(4),
        aggregateVersion: 1,
        actorPlayerId: uuid(5),
        correlationId: uuid(2),
        causationId: null,
        occurredAt: '2026-07-14T12:00:00.000Z',
        payload: {
          conversation: {
            conversationId: uuid(4),
            kind: 'group',
            source: {
              sourceType: 'play_session',
              sourceId: uuid(6),
              sourceAggregateVersion: 1,
            },
            state: 'open',
            title: 'Session group',
            version: 1,
            lastSequence: 0,
            createdAt: '2026-07-14T12:00:00.000Z',
            updatedAt: '2026-07-14T12:00:00.000Z',
            tombstonedAt: null,
          },
        },
      }),
    ).toThrow();
  });
  it('publishes machine-readable provider and consumer fixtures', () => {
    const root = path.join(process.cwd(), 'contracts/core-v2/fixtures');
    const read = (group: string, name: string) =>
      JSON.parse(
        fs.readFileSync(path.join(root, group, name), 'utf8'),
      ) as unknown;

    const provisioned = ConversationCommandReceiptV2Schema.parse(
      read('provider', 'session-conversation-provisioned.json'),
    );
    expect(provisioned).toMatchObject({
      commandName: 'provision_session_conversation_v2',
      acceptedSourceAggregateVersion: 1,
      acceptedMembership: { membershipVersion: 1 },
    });
    expect(
      ConversationAccessRevokedEventV2Schema.parse(
        read('provider', 'conversation-access-revoked.json'),
      ).payload.reason,
    ).toBe('source_membership_revoked');
    expect(
      RelationshipConversationProjectionInputV2Schema.parse(
        read('consumer', 'relationship-block-revoke.json'),
      ).relationship.capabilities.blocked,
    ).toBe(true);
    expect(
      RelationshipConversationAccessEventV2Schema.parse(
        read('provider', 'player-blocked-event.json'),
      ).eventType,
    ).toBe('player.blocked.v2');
    expect(
      ReconcileConversationMembershipCommandV2Schema.parse(
        read('consumer', 'session-membership-reconcile.json'),
      ).membership.membershipVersion,
    ).toBe(2);
    expect(
      ConversationSystemActivityInputV2Schema.parse(
        read('consumer', 'session-ready-system-activity.json'),
      ).sourceEventType,
    ).toBe('session.ready_check_opened.v2');
  });
});
