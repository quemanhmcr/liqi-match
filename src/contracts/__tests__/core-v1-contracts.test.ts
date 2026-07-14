import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  ConversationBootstrapRequestedEventV1Schema,
  DiscoveryCandidatePageV1Schema,
  DiscoveryCandidateV1Schema,
  HomeMatchFactsV1Schema,
  MatchCreatedEventV1Schema,
  MatchIntentLifecycleProjectionReceiptV1Schema,
  MatchIntentSnapshotV1Schema,
  NotificationRequestedEventV1Schema,
  PlayerDecisionReceiptV1Schema,
  SetDiscoveryPageV1Schema,
  SetInviteCreatedEventV1Schema,
  SetJoinRequestedEventV1Schema,
} from '../../../contracts/core-v1';

const root = path.join(process.cwd(), 'contracts/core-v1/fixtures');
const read = (group: 'provider' | 'consumer', name: string) =>
  JSON.parse(fs.readFileSync(path.join(root, group, name), 'utf8')) as unknown;

describe('core-v1 executable contracts', () => {
  it('validates the suspended Match Intent lifecycle projection receipt', () => {
    const receipt = MatchIntentLifecycleProjectionReceiptV1Schema.parse(
      read('provider', 'match-intent-lifecycle-suspended-projection.json'),
    );
    expect(receipt.resultCode).toBe('paused_by_suspension');
    expect(receipt.matchIntent?.state).toBe('paused');
  });

  it.each(['active-intent.json', 'paused-intent.json', 'expired-intent.json'])(
    'validates MatchIntent provider fixture %s',
    (name) => {
      expect(
        MatchIntentSnapshotV1Schema.parse(read('provider', name)),
      ).toBeTruthy();
    },
  );

  it.each(['candidate-eligible.json', 'candidate-already-liked.json'])(
    'validates DiscoveryCandidate provider fixture %s',
    (name) => {
      expect(
        DiscoveryCandidateV1Schema.parse(read('provider', name)),
      ).toBeTruthy();
    },
  );

  it('validates the immutable candidate page provider fixture', () => {
    const page = DiscoveryCandidatePageV1Schema.parse(
      read('provider', 'candidate-page-snapshot.json'),
    );
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
  });

  it.each([
    'mutual-like-receipt.json',
    'duplicate-like-retry-receipt.json',
    'match-already-exists-receipt.json',
  ])('validates decision receipt fixture %s', (name) => {
    expect(
      PlayerDecisionReceiptV1Schema.parse(read('provider', name)),
    ).toBeTruthy();
  });

  it('validates authoritative Home Match facts', () => {
    const facts = HomeMatchFactsV1Schema.parse(
      read('provider', 'home-match-facts.json'),
    );
    expect(facts.items[0]?.canMessage).toBe(true);
  });

  it('validates the immutable Match Set page provider fixture', () => {
    const page = SetDiscoveryPageV1Schema.parse(
      read('provider', 'set-discovery-page.json'),
    );
    expect(page.items).toHaveLength(1);
  });

  it('validates canonical Match Set event provider fixtures', () => {
    const invite = SetInviteCreatedEventV1Schema.parse(
      read('provider', 'set-invite-created-event.json'),
    );
    const join = SetJoinRequestedEventV1Schema.parse(
      read('provider', 'set-join-requested-event.json'),
    );
    expect(invite.data.inviteId).toBe(invite.aggregateId);
    expect(join.data.joinRequestId).toBe(join.aggregateId);
  });

  it('publishes the Mission 3 bootstrap consumer fixture', () => {
    const event = ConversationBootstrapRequestedEventV1Schema.parse(
      read('consumer', 'conversation-bootstrap-requested.json'),
    );
    expect(event.data.matchId).toBe(event.aggregateId);
  });

  it('publishes the Mission 4 match and notification consumer fixtures', () => {
    const match = MatchCreatedEventV1Schema.parse(
      read('consumer', 'match-created.json'),
    );
    const notification = NotificationRequestedEventV1Schema.parse(
      read('consumer', 'notification-requested.json'),
    );
    expect(notification.data.target.kind).toBe('match');
    if (notification.data.target.kind !== 'match') return;
    expect(match.data.matchId).toBe(notification.data.target.matchId);
  });
});
