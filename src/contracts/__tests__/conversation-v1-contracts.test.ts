import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import type { ZodType } from 'zod';

import {
  AdvanceReadCommandV1Schema,
  ConversationBootstrapRequestedEventV1Schema,
  ConversationCreatedEventV1Schema,
  ConversationSnapshotV1Schema,
  MessageSentEventV1Schema,
  MessageV1Schema,
  NotificationRequestedEventV1Schema,
  ReadStateV1Schema,
  SendMessageCommandV1Schema,
} from '../../../contracts/core-v1';

type FixtureEnvelope = {
  cases: { data: unknown; schema: string }[];
  expectation: Record<string, unknown>;
  fixtureVersion: 1;
};

const root = path.join(
  process.cwd(),
  'contracts/core-v1/conversation/fixtures',
);
const fixtureSchemas: Readonly<Record<string, ZodType>> = {
  AdvanceReadCommandV1: AdvanceReadCommandV1Schema,
  ConversationCreatedEventV1: ConversationCreatedEventV1Schema,
  ConversationSnapshotV1: ConversationSnapshotV1Schema,
  MessageSentEventV1: MessageSentEventV1Schema,
  MessageV1: MessageV1Schema,
  SendMessageCommandV1: SendMessageCommandV1Schema,
  'core:ConversationBootstrapRequestedEventV1':
    ConversationBootstrapRequestedEventV1Schema,
  'core:NotificationRequestedEventV1': NotificationRequestedEventV1Schema,
  ReadStateV1: ReadStateV1Schema,
};

function read(group: 'consumer' | 'provider', name: string) {
  return JSON.parse(
    fs.readFileSync(path.join(root, group, name), 'utf8'),
  ) as FixtureEnvelope;
}

function validateFixture(group: 'consumer' | 'provider', name: string) {
  const fixture = read(group, name);
  expect(fixture.fixtureVersion).toBe(1);
  for (const testCase of fixture.cases) {
    const schema = fixtureSchemas[testCase.schema];
    expect(schema).toBeDefined();
    schema?.parse(testCase.data);
  }
  return fixture;
}

describe('Conversation v1 executable provider contracts', () => {
  it.each([
    'concurrent-send.json',
    'conversation-created.json',
    'duplicate-client-message-id.json',
    'image-message.json',
    'out-of-order-realtime.json',
    'reconnect-gap.json',
    'repeated-mark-read.json',
    'text-message.json',
  ])('validates provider compatibility vector %s', (name) => {
    expect(validateFixture('provider', name)).toBeTruthy();
  });

  it.each([
    'bootstrap-conflict.json',
    'bootstrap-first.json',
    'bootstrap-retry.json',
    'message-notification-requested.json',
    'participant-deleted.json',
    'participant-suspended.json',
  ])('validates consumer compatibility vector %s', (name) => {
    expect(validateFixture('consumer', name)).toBeTruthy();
  });

  it('defines bootstrap replay by authoritative MatchId and participant set', () => {
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

  it('defines same-match participant conflict as a rejected bootstrap', () => {
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

  it('keeps notification unread authority in Conversation', () => {
    const event = NotificationRequestedEventV1Schema.parse(
      read('consumer', 'message-notification-requested.json').cases[0]?.data,
    );

    expect(event.data.reasonCode).toBe('message_received');
    expect(event.data.target.kind).toBe('conversation');
    if (event.data.target.kind !== 'conversation') return;
    expect(event.data.target.authoritativeUnreadCount).toBe(1);
    expect(event.data.target.foregroundPolicy).toBe('suppress_push');
  });

  it('requires retries to reuse the same clientMessageId and payload', () => {
    const fixture = validateFixture(
      'provider',
      'duplicate-client-message-id.json',
    );
    const first = SendMessageCommandV1Schema.parse(fixture.cases[0]?.data);
    const retry = SendMessageCommandV1Schema.parse(fixture.cases[1]?.data);

    expect(retry).toEqual(first);
    expect(fixture.expectation).toMatchObject({
      messageCreateCount: 1,
      returnsSameMessage: true,
    });
  });

  it('publishes out-of-order and reconnect-gap vectors with canonical sequences', () => {
    expect(
      read('provider', 'out-of-order-realtime.json').expectation,
    ).toMatchObject({ canonicalTimelineSequences: [8, 9], duplicateCount: 0 });
    expect(read('provider', 'reconnect-gap.json').expectation).toMatchObject({
      gapQueryAfterSequence: 7,
      mergedSequences: [8, 9],
    });
  });
});
