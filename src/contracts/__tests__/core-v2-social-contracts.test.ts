import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import {
  FriendshipRequestedEventV2Schema,
  PlayerBlockedEventV2Schema,
  PlayerPrivacyCommandReceiptV2Schema,
  PrivacyUpdatedEventV2Schema,
  ReportReceiptV2Schema,
  ReportSubmittedEventV2Schema,
  SocialRelationshipSnapshotV2Schema,
  BlockedPlayerListPageV2Schema,
  VisibleProfileIdentityV2Schema,
  TrustVisibilityDecisionV2Schema,
} from '../../../contracts/core-v2';

const root = path.join(process.cwd(), 'contracts/core-v2/fixtures');
const read = (group: 'provider' | 'consumer', name: string) =>
  JSON.parse(fs.readFileSync(path.join(root, group, name), 'utf8')) as unknown;

const SessionBlockConsumerPolicyV2Schema = z
  .object({
    event: PlayerBlockedEventV2Schema,
    relationship: SocialRelationshipSnapshotV2Schema,
    policy: z
      .object({
        preStart: z
          .object({
            cancelPendingInvites: z.literal(true),
            deny: z
              .array(
                z.enum([
                  'invite',
                  'join',
                  'ready_response',
                  'member_visibility',
                ]),
              )
              .length(4),
            revokeActiveMembership: z.literal(true),
          })
          .strict(),
        activePlay: z
          .object({
            preserveHistoricalMembership: z.literal(true),
            transition: z.literal('disputed'),
          })
          .strict(),
        replay: z.literal('idempotent'),
        unblock: z
          .object({
            restoreFriendship: z.literal(false),
            restoreReadiness: z.literal(false),
            restoreSessionMembership: z.literal(false),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((fixture, context) => {
    if (fixture.event.aggregateId !== fixture.relationship.relationshipId) {
      context.addIssue({
        code: 'custom',
        message:
          'Session block event must target the same Social relationship.',
        path: ['event', 'aggregateId'],
      });
    }
    if (fixture.event.aggregateVersion !== fixture.relationship.version) {
      context.addIssue({
        code: 'custom',
        message:
          'Session consumer must observe the exact Social aggregate version.',
        path: ['event', 'aggregateVersion'],
      });
    }
    if (
      fixture.event.payload.blockerPlayerId !==
        fixture.relationship.viewerPlayerId ||
      fixture.event.payload.blockedPlayerId !==
        fixture.relationship.targetPlayerId
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Session block direction must match the relationship snapshot.',
        path: ['event', 'payload'],
      });
    }
  });

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

it('publishes canonical blocked-player management rows', () => {
  const page = BlockedPlayerListPageV2Schema.parse(
    read('provider', 'blocked-player-page.json'),
  );
  expect(page.totalCount).toBe(1);
  expect(page.items[0]?.relationship.capabilities.canUnblock).toBe(true);
  expect(page.items[0]?.player.playerId).toBe(
    page.items[0]?.relationship.targetPlayerId,
  );
});

it('publishes the privacy-gated canonical profile identity bridge', () => {
  const identity = VisibleProfileIdentityV2Schema.parse(
    read('provider', 'visible-profile-identity.json'),
  );
  expect(identity.playerId).not.toBe(identity.profileId);
  expect(identity.profileId).not.toBe(identity.legacyProfileId);
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

  it('locks the S1.4 Session block precedence without redefining Session state', () => {
    const fixture = SessionBlockConsumerPolicyV2Schema.parse(
      read('consumer', 'session-block-enforcement.json'),
    );

    expect(fixture.relationship.capabilities).toMatchObject({
      blocked: true,
      canInviteToSession: false,
    });
    expect(new Set(fixture.policy.preStart.deny)).toEqual(
      new Set(['invite', 'join', 'ready_response', 'member_visibility']),
    );
    expect(fixture.policy.activePlay).toEqual({
      preserveHistoricalMembership: true,
      transition: 'disputed',
    });
    expect(fixture.policy.unblock).toEqual({
      restoreFriendship: false,
      restoreReadiness: false,
      restoreSessionMembership: false,
    });
  });

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
