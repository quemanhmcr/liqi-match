import { describe, expect, it } from '@jest/globals';

import { InMemoryConversationV2Authority } from '@/entities/conversation-v2';
import {
  PlaySessionIdSchema,
  PlaySessionMembershipProjectionV2Schema,
} from '@/shared/contracts/core-v2';
import { PlayerIdSchema } from '@/shared/contracts/core-v1';

import { createConversationV2SessionProvisioner } from '../conversation-v2-session-provisioner';

const SESSION_ID = PlaySessionIdSchema.parse(
  '98000000-0000-4000-8000-000000000001',
);
const PLAYER_A = PlayerIdSchema.parse('98000000-0000-4000-8000-000000000011');
const PLAYER_B = PlayerIdSchema.parse('98000000-0000-4000-8000-000000000012');
const PLAYER_C = PlayerIdSchema.parse('98000000-0000-4000-8000-000000000013');

function membership(version: number, includeC = false) {
  return PlaySessionMembershipProjectionV2Schema.parse({
    members: [
      { playerId: PLAYER_A, role: 'owner' },
      { playerId: PLAYER_B, role: 'member' },
      ...(includeC ? [{ playerId: PLAYER_C, role: 'member' as const }] : []),
    ],
    membershipVersion: version,
    sessionId: SESSION_ID,
  });
}

describe('Conversation V2 Session provisioner adapter', () => {
  it('provisions and reconciles exact Session membership facts', async () => {
    let sequence = 100;
    const authority = new InMemoryConversationV2Authority({
      clock: () => new Date('2026-07-14T12:00:00.000Z'),
      createUuid: () =>
        `98000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    });
    const provisioner = createConversationV2SessionProvisioner({
      authority,
      clock: () => new Date('2026-07-14T12:00:00.000Z'),
    });

    const provisioned = await provisioner.provision({
      correlationId: '98000000-0000-4000-8000-000000000021',
      membership: membership(1),
      sourceAggregateVersion: 2,
      title: 'Party chính',
    });
    expect(provisioned.membership).toEqual(membership(1));
    expect(provisioned.sourceAggregateVersion).toBe(2);

    const reconciled = await provisioner.reconcile({
      conversationId: provisioned.conversationId,
      correlationId: '98000000-0000-4000-8000-000000000022',
      membership: membership(2, true),
      sourceAggregateVersion: 3,
      title: 'Party chính',
    });
    expect(reconciled.membership).toEqual(membership(2, true));
    expect(reconciled.sourceAggregateVersion).toBe(3);

    const snapshot = await authority.getConversation(
      {
        accountId: '98000000-0000-4000-8000-000000000031' as never,
        lifecycleVersion: 1,
        messagingAllowed: true,
        playerId: PLAYER_C,
      },
      provisioned.conversationId,
    );
    expect(snapshot?.source).toEqual({
      sourceAggregateVersion: 3,
      sourceId: SESSION_ID,
      sourceType: 'play_session',
    });
  });

  it('replays provision with stable metadata and one conversation', async () => {
    let sequence = 200;
    const authority = new InMemoryConversationV2Authority({
      clock: () => new Date('2026-07-14T12:00:00.000Z'),
      createUuid: () =>
        `98000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    });
    const provisioner = createConversationV2SessionProvisioner({ authority });
    const input = {
      correlationId: '98000000-0000-4000-8000-000000000041',
      membership: membership(1),
      sourceAggregateVersion: 2,
      title: 'Replay party',
    };

    const first = await provisioner.provision(input);
    const replay = await provisioner.provision(input);
    expect(replay).toEqual(first);
    expect(
      authority
        .events()
        .filter((event) => event.eventType === 'conversation.provisioned.v2'),
    ).toHaveLength(1);
  });
});
