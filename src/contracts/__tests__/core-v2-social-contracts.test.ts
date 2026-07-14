import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  FriendshipRequestedEventV2Schema,
  PlayerBlockedEventV2Schema,
  PlayerPrivacyCommandReceiptV2Schema,
  PrivacyUpdatedEventV2Schema,
  ReportReceiptV2Schema,
  ReportSubmittedEventV2Schema,
  SocialRelationshipSnapshotV2Schema,
  TrustVisibilityDecisionV2Schema,
} from '../../../contracts/core-v2';

const root = path.join(process.cwd(), 'contracts/core-v2/fixtures');
const read = (group: 'provider' | 'consumer', name: string) =>
  JSON.parse(fs.readFileSync(path.join(root, group, name), 'utf8')) as unknown;

describe('Core V2 social relationship provider contracts', () => {
  it('publishes friendship without inferring it from match or conversation', () => {
    const relationship = SocialRelationshipSnapshotV2Schema.parse(
      read('provider', 'relationship-friend.json'),
    );

    expect(relationship.friendship.state).toBe('accepted');
    expect(relationship.capabilities.friendshipLabel).toBe('friend');
  });

  it('makes block override every interaction capability', () => {
    const relationship = SocialRelationshipSnapshotV2Schema.parse(
      read('provider', 'relationship-blocked.json'),
    );

    expect(relationship.capabilities).toMatchObject({
      blocked: true,
      canDiscover: false,
      canInviteToSession: false,
      canMessage: false,
      canViewConversation: false,
      canViewPresence: false,
      canViewProfile: false,
    });
  });

  it('rejects client-elevated capability while block override is active', () => {
    const fixture = read('provider', 'relationship-blocked.json') as Record<
      string,
      unknown
    >;
    const capabilities = fixture.capabilities as Record<string, unknown>;

    expect(() =>
      SocialRelationshipSnapshotV2Schema.parse({
        ...fixture,
        capabilities: { ...capabilities, canMessage: true },
      }),
    ).toThrow();
  });

  it('publishes the versioned friendship request event envelope', () => {
    const event = FriendshipRequestedEventV2Schema.parse(
      read('provider', 'friendship-requested-event.json'),
    );

    expect(event.eventVersion).toBe(2);
    expect(event.aggregateVersion).toBe(1);
    expect(event.payload.requestState).toBe('pending');
  });

  it('publishes an explicit trust visibility decision for trust consumers', () => {
    const friend = TrustVisibilityDecisionV2Schema.parse(
      read('provider', 'trust-visibility-friend.json'),
    );
    const blocked = TrustVisibilityDecisionV2Schema.parse(
      read('provider', 'trust-visibility-blocked.json'),
    );

    expect(friend.canViewTrust).toBe(true);
    expect(blocked).toMatchObject({ blocked: true, canViewTrust: false });
  });

  it('rejects trust visibility elevation while block override is active', () => {
    const fixture = read('provider', 'trust-visibility-blocked.json') as object;
    expect(() =>
      TrustVisibilityDecisionV2Schema.parse({
        ...fixture,
        canViewTrust: true,
      }),
    ).toThrow();
  });

  it('publishes versioned privacy receipt and event with trust visibility', () => {
    const receipt = PlayerPrivacyCommandReceiptV2Schema.parse(
      read('provider', 'privacy-update-receipt.json'),
    );
    const event = PrivacyUpdatedEventV2Schema.parse(
      read('provider', 'privacy-updated-event.json'),
    );

    expect(receipt.privacy).toMatchObject({
      trustVisibility: 'private',
      version: 2,
    });
    expect(event.payload).toEqual(receipt.privacy);
  });

  it('publishes report receipt and event without public reputation semantics', () => {
    const receipt = ReportReceiptV2Schema.parse(
      read('provider', 'report-submission-receipt.json'),
    );
    const event = ReportSubmittedEventV2Schema.parse(
      read('provider', 'report-submitted-event.json'),
    );

    expect(event.aggregateId).toBe(receipt.reportId);
    expect(event.payload).not.toHaveProperty('reputationDelta');
    expect(event.payload).not.toHaveProperty('messageContent');
  });

  it('publishes a private block event without reputation semantics', () => {
    const event = PlayerBlockedEventV2Schema.parse(
      read('provider', 'player-blocked-event.json'),
    );

    expect(event.payload.reasonCode).toBe('user_safety');
    expect(event.payload).not.toHaveProperty('reputationDelta');
  });
});

describe('Core V2 social relationship consumer fixtures', () => {
  it.each(['relationship-blocked.json', 'relationship-friend.json'])(
    'keeps consumer fixture %s on the exact provider schema',
    (name) => {
      expect(
        SocialRelationshipSnapshotV2Schema.parse(read('consumer', name)),
      ).toBeTruthy();
    },
  );

  it('fails closed for an unknown contract version', () => {
    const fixture = read('consumer', 'relationship-friend.json') as object;
    expect(() =>
      SocialRelationshipSnapshotV2Schema.parse({
        ...fixture,
        contractVersion: 3,
      }),
    ).toThrow();
  });
});
