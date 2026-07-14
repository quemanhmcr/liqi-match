import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  FriendshipAcceptedEventV2Schema,
  PlayerBlockedEventV2Schema,
  SocialRelationshipSnapshotV2Schema,
  type CoreV2SocialEvent,
} from '../../../contracts/core-v2';

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      'contracts/core-v2/fixtures/consumer/relationship-block-revoke.json',
    ),
    'utf8',
  ),
) as {
  conversationId: string;
  members: readonly unknown[];
  revocationReason: 'blocked';
  source: {
    sourceId: string;
    sourceType: 'friendship';
    sourceVersion: number;
  };
};

const PLAYER_A = '20000000-0000-4000-8000-000000000001';
const PLAYER_B = '20000000-0000-4000-8000-000000000002';

class RelationshipConversationConsumerHarness {
  private readonly conversations = new Map<
    string,
    {
      conversationId: string;
      members: Set<string>;
      sourceVersion: number;
    }
  >();
  private readonly processedEvents = new Set<string>();
  readonly events: Array<{
    eventType: 'conversation.access_revoked.v2';
    payload: { conversationId: string; playerId: string; reason: 'blocked' };
  }> = [];

  consume(event: CoreV2SocialEvent) {
    if (this.processedEvents.has(event.eventId)) return;
    this.processedEvents.add(event.eventId);

    if (event.eventType === 'friendship.accepted.v2') {
      const accepted = FriendshipAcceptedEventV2Schema.parse(event);
      const existing = this.conversations.get(accepted.aggregateId);
      if (existing && accepted.aggregateVersion < existing.sourceVersion) {
        throw Object.assign(new Error('stale relationship event'), {
          code: 'relationship_version_conflict',
        });
      }
      if (existing) {
        existing.sourceVersion = accepted.aggregateVersion;
        return;
      }
      this.conversations.set(accepted.aggregateId, {
        conversationId: fixture.conversationId,
        members: new Set([
          accepted.payload.requesterPlayerId,
          accepted.payload.recipientPlayerId,
        ]),
        sourceVersion: accepted.aggregateVersion,
      });
      return;
    }

    if (event.eventType !== 'player.blocked.v2') return;
    const blocked = PlayerBlockedEventV2Schema.parse(event);
    const existing = this.conversations.get(blocked.aggregateId);
    if (!existing) return;
    if (blocked.aggregateVersion <= existing.sourceVersion) {
      throw Object.assign(new Error('stale relationship event'), {
        code: 'relationship_version_conflict',
      });
    }
    existing.sourceVersion = blocked.aggregateVersion;
    for (const playerId of existing.members) {
      this.events.push({
        eventType: 'conversation.access_revoked.v2',
        payload: {
          conversationId: existing.conversationId,
          playerId,
          reason: 'blocked',
        },
      });
    }
    existing.members.clear();
  }

  conversationCount() {
    return this.conversations.size;
  }

  snapshot(sourceId: string) {
    const stored = this.conversations.get(sourceId);
    return stored
      ? {
          conversationId: stored.conversationId,
          members: [...stored.members],
          sourceVersion: stored.sourceVersion,
        }
      : null;
  }
}

function acceptedEvent() {
  return FriendshipAcceptedEventV2Schema.parse({
    actorPlayerId: PLAYER_B,
    aggregateId: fixture.source.sourceId,
    aggregateType: 'social_relationship',
    aggregateVersion: fixture.source.sourceVersion - 1,
    causationId: null,
    correlationId: '30000000-0000-4000-8000-000000000022',
    eventId: '30000000-0000-4000-8000-000000000019',
    eventType: 'friendship.accepted.v2',
    eventVersion: 2,
    occurredAt: '2026-07-14T12:05:00.000Z',
    payload: {
      friendshipLabel: 'friend',
      friendshipRequestId: '42000000-0000-4000-8000-000000000001',
      recipientPlayerId: PLAYER_B,
      requesterPlayerId: PLAYER_A,
      requestState: 'accepted',
    },
  });
}

function blockedEvent() {
  return PlayerBlockedEventV2Schema.parse({
    actorPlayerId: PLAYER_A,
    aggregateId: fixture.source.sourceId,
    aggregateType: 'social_relationship',
    aggregateVersion: fixture.source.sourceVersion,
    causationId: '30000000-0000-4000-8000-000000000019',
    correlationId: '30000000-0000-4000-8000-000000000022',
    eventId: '30000000-0000-4000-8000-000000000023',
    eventType: 'player.blocked.v2',
    eventVersion: 2,
    occurredAt: '2026-07-14T12:06:00.000Z',
    payload: {
      blockedPlayerId: PLAYER_B,
      blockerPlayerId: PLAYER_A,
      reasonCode: 'user_safety',
    },
  });
}

describe('Senior 1 -> Senior 3 relationship conversation consumer contract', () => {
  it('provides a stable friendship source and does not duplicate direct conversation on replay', () => {
    const consumer = new RelationshipConversationConsumerHarness();
    const event = acceptedEvent();

    consumer.consume(event);
    consumer.consume(event);

    expect(consumer.conversationCount()).toBe(1);
    expect(consumer.snapshot(event.aggregateId)).toEqual({
      conversationId: fixture.conversationId,
      members: [PLAYER_A, PLAYER_B],
      sourceVersion: fixture.source.sourceVersion - 1,
    });
  });

  it('maps block authority to an empty active member set and access-revoked events', () => {
    const consumer = new RelationshipConversationConsumerHarness();
    const accepted = acceptedEvent();
    const blocked = blockedEvent();
    consumer.consume(accepted);
    consumer.consume(blocked);

    expect(fixture).toMatchObject({
      members: [],
      revocationReason: 'blocked',
      source: {
        sourceId: blocked.aggregateId,
        sourceType: 'friendship',
        sourceVersion: blocked.aggregateVersion,
      },
    });
    expect(consumer.snapshot(blocked.aggregateId)).toEqual({
      conversationId: fixture.conversationId,
      members: [],
      sourceVersion: blocked.aggregateVersion,
    });
    expect(consumer.events).toEqual([
      {
        eventType: 'conversation.access_revoked.v2',
        payload: {
          conversationId: fixture.conversationId,
          playerId: PLAYER_A,
          reason: 'blocked',
        },
      },
      {
        eventType: 'conversation.access_revoked.v2',
        payload: {
          conversationId: fixture.conversationId,
          playerId: PLAYER_B,
          reason: 'blocked',
        },
      },
    ]);
  });

  it('revokes public conversation access without removing report capability', () => {
    const blockedRelationship = SocialRelationshipSnapshotV2Schema.parse(
      JSON.parse(
        fs.readFileSync(
          path.join(
            process.cwd(),
            'contracts/core-v2/fixtures/provider/relationship-blocked.json',
          ),
          'utf8',
        ),
      ),
    );

    expect(blockedRelationship.capabilities).toMatchObject({
      blocked: true,
      canReport: true,
      canViewConversation: false,
    });
  });

  it('rejects out-of-order relationship source delivery', () => {
    const consumer = new RelationshipConversationConsumerHarness();
    consumer.consume(acceptedEvent());
    const stale = FriendshipAcceptedEventV2Schema.parse({
      ...acceptedEvent(),
      aggregateVersion: fixture.source.sourceVersion - 2,
      eventId: '30000000-0000-4000-8000-000000000018',
    });

    expect(() => consumer.consume(stale)).toThrow(
      expect.objectContaining({ code: 'relationship_version_conflict' }),
    );
  });
});
