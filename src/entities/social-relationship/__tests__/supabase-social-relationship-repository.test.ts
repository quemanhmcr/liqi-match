import { describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  BlockPlayerCommandV2Schema,
  ReportPlayerCommandV2Schema,
  UpdatePlayerPrivacyCommandV2Schema,
} from '@/shared/contracts/core-v2';

import { SupabaseSocialRelationshipRepository } from '../supabase-social-relationship-repository';

import {
  socialTestSession,
  targetPlayerId,
  viewerPlayerId,
} from './social-relationship-test-fixtures';

const testAuthSession = socialTestSession();
const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v2/fixtures/provider',
);
const read = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8')) as unknown;

describe('SupabaseSocialRelationshipRepository', () => {
  it('implements the exact RelationshipCapabilityReader RPC seam', async () => {
    const rpc = jest.fn(async () => read('relationship-friend.json'));
    const repository = new SupabaseSocialRelationshipRepository(rpc);

    await expect(
      repository.getRelationship(testAuthSession, targetPlayerId),
    ).resolves.toMatchObject({
      targetPlayerId,
      viewerPlayerId,
      capabilities: { friendshipLabel: 'friend' },
    });
    expect(rpc).toHaveBeenCalledWith('get_relationship_v2', testAuthSession, {
      p_target_player_id: targetPlayerId,
    });
  });

  it('reads explicit trust visibility instead of inferring from profile data', async () => {
    const rpc = jest.fn(async () => read('trust-visibility-friend.json'));
    const repository = new SupabaseSocialRelationshipRepository(rpc);

    await expect(
      repository.getTrustVisibility(testAuthSession, targetPlayerId),
    ).resolves.toMatchObject({
      canViewTrust: true,
      trustVisibility: 'friends',
    });
    expect(rpc).toHaveBeenCalledWith(
      'get_trust_visibility_v2',
      testAuthSession,
      { p_target_player_id: targetPlayerId },
    );
  });

  it('normalizes friendship pagination and rejects contract drift', async () => {
    const friend = read('relationship-friend.json');
    const rpc = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({
        contractVersion: 2,
        items: [friend],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ contractVersion: 3, items: [] });
    const repository = new SupabaseSocialRelationshipRepository(rpc);

    await expect(
      repository.listFriendships(testAuthSession, { limit: 500 }),
    ).resolves.toMatchObject({ items: [friend], nextCursor: null });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'list_friendships_v2',
      testAuthSession,
      { p_after_player_id: null, p_limit: 100 },
    );
    await expect(repository.listFriendships(testAuthSession)).rejects.toThrow();
  });
  it('sends friendship and safety commands as opaque authoritative RPC commands', async () => {
    const receipt = {
      correlationId: '44000000-0000-4000-8000-000000000001',
      eventIds: ['43000000-0000-4000-8000-000000000001'],
      relationship: read('relationship-blocked.json'),
      repeated: false,
    };
    const rpc = jest.fn(async () => receipt);
    const repository = new SupabaseSocialRelationshipRepository(rpc);
    const command = BlockPlayerCommandV2Schema.parse({
      audit: {
        clientCreatedAt: '2026-07-14T15:00:00.000Z',
        clientPlatform: 'android' as const,
        clientVersion: '2.0.0',
        requestId: 'social:block-player:test',
      },
      correlationId: '44000000-0000-4000-8000-000000000001',
      expectedRelationshipVersion: 4,
      idempotencyKey: 'social:block-player:test',
      reasonCode: 'user_safety',
      targetPlayerId,
    });

    await expect(
      repository.blockPlayer(testAuthSession, command),
    ).resolves.toMatchObject({
      relationship: { capabilities: { blocked: true } },
    });
    expect(rpc).toHaveBeenCalledWith('block_player_v2', testAuthSession, {
      command,
    });
  });

  it('parses privacy and report receipts on their dedicated provider ports', async () => {
    const rpc = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(read('privacy-update-receipt.json'))
      .mockResolvedValueOnce(read('report-submission-receipt.json'));
    const repository = new SupabaseSocialRelationshipRepository(rpc);
    const privacyCommand = UpdatePlayerPrivacyCommandV2Schema.parse({
      audit: {
        clientCreatedAt: '2026-07-14T15:00:00.000Z',
        clientPlatform: 'ios' as const,
        clientVersion: '2.0.0',
        requestId: 'privacy-update-test',
      },
      correlationId: '44000000-0000-4000-8000-000000000101',
      expectedPrivacyVersion: 1,
      friendshipRequests: 'matched_only' as const,
      idempotencyKey: 'privacy-update-test',
      presenceVisibility: 'hidden' as const,
      profileVisibility: 'friends' as const,
      sessionInvites: 'nobody' as const,
      trustVisibility: 'private' as const,
    });
    const reportCommand = ReportPlayerCommandV2Schema.parse({
      audit: privacyCommand.audit,
      category: 'harassment' as const,
      correlationId: '44000000-0000-4000-8000-000000000102',
      details: null,
      expectedReportVersion: 0 as const,
      idempotencyKey: 'report-player-test',
      targetPlayerId,
    });

    await expect(
      repository.updatePrivacy(testAuthSession, privacyCommand),
    ).resolves.toMatchObject({ privacy: { trustVisibility: 'private' } });
    await expect(
      repository.reportPlayer(testAuthSession, reportCommand),
    ).resolves.toMatchObject({ status: 'submitted', version: 1 });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'update_player_privacy_v2',
      testAuthSession,
      { command: privacyCommand },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'report_player_v2',
      testAuthSession,
      { command: reportCommand },
    );
  });
});
