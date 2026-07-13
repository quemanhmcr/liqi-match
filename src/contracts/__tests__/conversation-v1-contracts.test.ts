import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  ConversationBootstrapRequestedEventV1Schema,
  NotificationRequestedEventV1Schema,
} from '../../../contracts/core-v1';
import {
  ConversationCreatedV1Schema,
  MessageSentV1Schema,
  MessageV1Schema,
  ReadStateV1Schema,
} from '../../features/messages/contracts/generated';

type FixtureEnvelope = {
  cases: { data: unknown; schema: string }[];
  expectation: Record<string, unknown>;
  fixtureVersion: 1;
};

const root = path.join(
  process.cwd(),
  'contracts/core-v1/conversation/fixtures',
);

function read(group: 'consumer' | 'provider', name: string) {
  return JSON.parse(
    fs.readFileSync(path.join(root, group, name), 'utf8'),
  ) as FixtureEnvelope;
}

describe('Conversation v1 executable provider contracts', () => {
  it('consumes Senior 2 bootstrap authority and defines retry by MatchId', () => {
    const first = ConversationBootstrapRequestedEventV1Schema.parse(
      read('consumer', 'bootstrap-first.json').cases[0]?.data,
    );
    const retry = ConversationBootstrapRequestedEventV1Schema.parse(
      read('consumer', 'bootstrap-retry.json').cases[0]?.data,
    );

    expect(first.aggregateId).toBe(first.data.matchId);
    expect(retry.data.matchId).toBe(first.data.matchId);
    expect(retry.data.participantIds).toEqual(first.data.participantIds);
    expect(retry.eventId).not.toBe(first.eventId);
  });

  it('publishes a conflicting bootstrap fixture for same match and different participants', () => {
    const first = ConversationBootstrapRequestedEventV1Schema.parse(
      read('consumer', 'bootstrap-first.json').cases[0]?.data,
    );
    const conflict = ConversationBootstrapRequestedEventV1Schema.parse(
      read('consumer', 'bootstrap-conflict.json').cases[0]?.data,
    );

    expect(conflict.data.matchId).toBe(first.data.matchId);
    expect(conflict.data.participantIds).not.toEqual(first.data.participantIds);
    expect(
      read('consumer', 'bootstrap-conflict.json').expectation,
    ).toMatchObject({
      errorCode: 'conversation_bootstrap_conflict',
      result: 'rejected',
    });
  });

  it('extends notification.requested.v1 additively for message attention', () => {
    const event = NotificationRequestedEventV1Schema.parse(
      read('consumer', 'message-notification-requested.json').cases[0]?.data,
    );

    expect(event.data.reasonCode).toBe('message_received');
    expect(event.data.target.kind).toBe('conversation');
    if (event.data.target.kind !== 'conversation') return;
    expect(event.data.target.authoritativeUnreadCount).toBe(1);
    expect(event.data.target.foregroundPolicy).toBe('suppress_push');
  });

  it('validates canonical provider snapshots and events', () => {
    expect(
      MessageV1Schema.parse(
        read('provider', 'text-message.json').cases[0]?.data,
      ),
    ).toBeTruthy();
    expect(
      MessageV1Schema.parse(
        read('provider', 'image-message.json').cases[0]?.data,
      ),
    ).toBeTruthy();
    expect(
      ConversationCreatedV1Schema.parse(
        read('provider', 'conversation-created.json').cases[1]?.data,
      ),
    ).toBeTruthy();
    expect(
      ReadStateV1Schema.parse(
        read('provider', 'repeated-mark-read.json').cases.at(-1)?.data,
      ),
    ).toBeTruthy();
  });

  it('validates the message.sent provider event fixture', () => {
    const fixture = read('provider', 'text-message.json');
    expect(MessageSentV1Schema.parse(fixture.cases[1]?.data)).toBeTruthy();
  });
});
