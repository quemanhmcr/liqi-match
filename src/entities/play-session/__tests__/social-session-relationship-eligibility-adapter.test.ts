import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import { PlayerIdSchema } from '@/shared/contracts/core-v1';
import { SocialRelationshipSnapshotV2Schema } from '@/shared/contracts/core-v2';
import { InMemorySocialRelationshipRepository } from '@/entities/social-relationship';
import {
  socialTestSession,
  targetPlayerId,
  viewerPlayerId,
} from '@/entities/social-relationship/__tests__/social-relationship-test-fixtures';

import { SocialSessionRelationshipEligibilityAdapter } from '../social-session-relationship-eligibility-adapter';

const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v2/fixtures/provider',
);
const readRelationship = (name: string) =>
  SocialRelationshipSnapshotV2Schema.parse(
    JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8')),
  );

describe('SocialSessionRelationshipEligibilityAdapter', () => {
  it('consumes canInviteToSession without redefining friendship semantics', async () => {
    const repository = new InMemorySocialRelationshipRepository({
      relationships: [readRelationship('relationship-friend.json')],
    });
    const adapter = new SocialSessionRelationshipEligibilityAdapter(
      repository,
      () => socialTestSession(),
    );

    await expect(
      adapter.getInviteEligibility(viewerPlayerId, targetPlayerId),
    ).resolves.toEqual({ allowed: true, blocked: false, reasonCodes: [] });
  });

  it('denies Session invites from current privacy capability and does not infer presence', async () => {
    const friend = readRelationship('relationship-friend.json');
    const privacyDenied = SocialRelationshipSnapshotV2Schema.parse({
      ...friend,
      capabilities: {
        ...friend.capabilities,
        canInviteToSession: false,
        canViewPresence: false,
      },
      targetPrivacy: {
        ...friend.targetPrivacy,
        presenceVisibility: 'hidden',
        sessionInvites: 'nobody',
        version: friend.targetPrivacy.version + 1,
      },
      version: friend.version + 1,
    });
    const repository = new InMemorySocialRelationshipRepository({
      relationships: [privacyDenied],
    });
    const adapter = new SocialSessionRelationshipEligibilityAdapter(
      repository,
      () => socialTestSession(),
    );

    await expect(
      adapter.getInviteEligibility(viewerPlayerId, targetPlayerId),
    ).resolves.toEqual({
      allowed: false,
      blocked: false,
      reasonCodes: ['session_invite_policy_denied'],
    });
    await expect(
      repository.getRelationship(socialTestSession(), targetPlayerId),
    ).resolves.toMatchObject({
      capabilities: { canViewPresence: false },
      targetPrivacy: {
        presenceVisibility: 'hidden',
        sessionInvites: 'nobody',
      },
    });
  });

  it('fails closed when either directional block is authoritative', async () => {
    const repository = new InMemorySocialRelationshipRepository({
      relationships: [readRelationship('relationship-blocked.json')],
    });
    const adapter = new SocialSessionRelationshipEligibilityAdapter(
      repository,
      () => socialTestSession(),
    );

    await expect(
      adapter.getInviteEligibility(viewerPlayerId, targetPlayerId),
    ).resolves.toEqual({
      allowed: false,
      blocked: true,
      reasonCodes: ['relationship_blocked'],
    });
  });

  it('rejects missing or mismatched canonical actor context', async () => {
    const repository = new InMemorySocialRelationshipRepository();
    const unauthenticated = new SocialSessionRelationshipEligibilityAdapter(
      repository,
      () => null,
    );
    await expect(
      unauthenticated.getInviteEligibility(viewerPlayerId, targetPlayerId),
    ).rejects.toMatchObject({ code: 'unauthenticated' });

    const mismatched = new SocialSessionRelationshipEligibilityAdapter(
      repository,
      () => socialTestSession(),
    );
    await expect(
      mismatched.getInviteEligibility(
        PlayerIdSchema.parse('20000000-0000-4000-8000-000000000099'),
        targetPlayerId,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
