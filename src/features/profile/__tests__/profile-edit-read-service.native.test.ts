import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import { fetchProfileEditDraft } from '../edit/services/profile-edit-read-service';

jest.mock('@/shared/services/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}));

jest.mock('@/features/profile/services/profile-service', () => ({
  profileMediaUrl: jest.fn((assetId?: string | null) =>
    assetId ? `https://media.example/${assetId}` : undefined,
  ),
}));

const mockSupabaseRest = jest.mocked(supabaseRest);

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4102444800,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: {
    email: 'profile@example.com',
    id: '00000000-0000-0000-0000-000000000003',
    user_metadata: { avatar_url: 'https://identity.example/avatar.png' },
  },
};

function mockReferenceReads(input: {
  profile: Record<string, unknown>;
  selectedRoles?: { created_at: string; role_id: string }[];
}) {
  mockSupabaseRest
    .mockResolvedValueOnce([input.profile])
    .mockResolvedValueOnce([
      { id: 'master-id', name: 'Master', slug: 'master', sort_order: 1 },
    ])
    .mockResolvedValueOnce([
      { id: 'jungle-id', name: 'Jungle', slug: 'jungle' },
    ])
    .mockResolvedValueOnce(input.selectedRoles ?? [])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
}

describe('fetchProfileEditDraft', () => {
  beforeEach(() => {
    mockSupabaseRest.mockReset();
  });

  it('keeps missing rank, lanes and habits missing without fake defaults', async () => {
    mockReferenceReads({
      profile: {
        avatar_media_id: null,
        bio: null,
        display_name: 'Display Name',
        game_profiles: [
          {
            handle: 'SeparateGameHandle',
            rank_id: null,
            server_region: 'legacy-region',
          },
        ],
        id: session.user.id,
      },
    });

    const draft = await fetchProfileEditDraft(session);

    expect(draft.form.identity.displayName).toBe('Display Name');
    expect(draft.form.gameProfile.handle).toBe('SeparateGameHandle');
    expect(draft.form.gameProfile.rankId).toBeUndefined();
    expect(draft.form.lanes.roleIds).toEqual([]);
    expect(draft.form.habits).toEqual({});
    expect(draft.form.availability.presets).toBeUndefined();
    expect(draft.meta.serverRegion).toBe('legacy-region');
    expect(draft.form.media.coverMediaId).toBeNull();
  });

  it('preserves unsupported legacy values for explicit UI handling', async () => {
    mockReferenceReads({
      profile: {
        avatar_media_id: null,
        bio: '',
        display_name: 'Legacy Player',
        game_profiles: [
          {
            handle: 'LegacyHandle',
            rank_id: 'legacy-rank-id',
            server_region: 'old-shard',
          },
        ],
        id: session.user.id,
        profile_habits: [
          {
            comeback_response: null,
            communication_channels: null,
            decision_style: null,
            feedback_style: null,
            loss_response: null,
            media_summary: {
              cover_media_id: 'cover-explicit',
              profile_basics: { gender: 'legacy-gender' },
              profile_status: 'legacy-status',
            },
            online_time_presets: null,
            seriousness: 'Legacy serious mode',
            session_length: null,
            strategy_styles: null,
            team_atmospheres: null,
            team_goals: null,
          },
        ],
      },
      selectedRoles: [
        { created_at: '2026-07-01T00:00:00Z', role_id: 'legacy-role-id' },
      ],
    });

    const draft = await fetchProfileEditDraft(session);

    expect(draft.form.gameProfile.rankId).toBe('legacy-rank-id');
    expect(draft.form.lanes.roleIds).toEqual(['legacy-role-id']);
    expect(draft.form.habits.seriousness).toBe('Legacy serious mode');
    expect(draft.form.habits.communication_channels).toBeUndefined();
    expect(draft.form.identity.gender).toBe('legacy-gender');
    expect(draft.form.identity.status).toBe('legacy-status');
    expect(draft.form.media.coverMediaId).toBe('cover-explicit');
    expect(draft.form.media.coverUrl).toBe(
      'https://media.example/cover-explicit',
    );
    expect(mockSupabaseRest).toHaveBeenCalledTimes(7);
  });
});
