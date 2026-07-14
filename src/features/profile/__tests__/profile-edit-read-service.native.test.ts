import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createEmptyHabitAnswers } from '@/entities/player-profile';
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

function mockReads(input: {
  availability?: unknown[];
  identitySnapshot?: unknown;
  backendHeroes?: unknown[];
  profile: Record<string, unknown>;
  ranks?: unknown[];
  roles?: unknown[];
  selectedHeroes?: unknown[];
  selectedRoles?: unknown[];
}) {
  mockSupabaseRest
    .mockResolvedValueOnce(
      input.identitySnapshot ?? identitySnapshotFromProfile(input.profile),
    )
    .mockResolvedValueOnce([input.profile])
    .mockResolvedValueOnce(input.ranks ?? [])
    .mockResolvedValueOnce(input.roles ?? [])
    .mockResolvedValueOnce(input.selectedRoles ?? [])
    .mockResolvedValueOnce(input.selectedHeroes ?? [])
    .mockResolvedValueOnce(input.backendHeroes ?? [])
    .mockResolvedValueOnce(input.availability ?? []);
}

function identitySnapshotFromProfile(profile: Record<string, unknown>) {
  const habits = Array.isArray(profile.profile_habits)
    ? (profile.profile_habits[0] as Record<string, unknown> | undefined)
    : undefined;
  const mediaSummary =
    habits?.media_summary && typeof habits.media_summary === 'object'
      ? (habits.media_summary as Record<string, unknown>)
      : {};
  const basics =
    mediaSummary.profile_basics &&
    typeof mediaSummary.profile_basics === 'object'
      ? (mediaSummary.profile_basics as Record<string, unknown>)
      : {};
  const gender =
    basics.gender === 'male' ||
    basics.gender === 'female' ||
    basics.gender === 'hidden'
      ? basics.gender
      : null;
  const status =
    mediaSummary.profile_status === 'ready' ||
    mediaSummary.profile_status === 'busy' ||
    mediaSummary.profile_status === 'offline' ||
    mediaSummary.profile_status === 'friends'
      ? mediaSummary.profile_status
      : null;
  return {
    identity: {
      bio: typeof profile.bio === 'string' ? profile.bio : '',
      displayName:
        typeof profile.display_name === 'string'
          ? profile.display_name
          : 'Player',
      genderId: gender,
      stats: { matches: 0, rating: 0, reputation: 0, winRate: 0 },
      status,
    },
    playerId: '20000000-0000-4000-8000-000000000003',
    profileId: '30000000-0000-4000-8000-000000000003',
    profileVersion: 2,
  };
}

describe('fetchProfileEditDraft', () => {
  beforeEach(() => {
    mockSupabaseRest.mockReset();
  });

  it('keeps missing rank, lanes and habits unanswered without fake defaults', async () => {
    mockReads({
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
        timezone: 'Asia/Bangkok',
      },
    });

    const draft = await fetchProfileEditDraft(session);

    expect(draft.form.identity.displayName).toBe('Display Name');
    expect(draft.form.gameProfile.handle).toBe('SeparateGameHandle');
    expect(draft.form.gameProfile.rankId).toBeNull();
    expect(draft.form.laneSelection).toBeNull();
    expect(draft.form.habits).toEqual(createEmptyHabitAnswers());
    expect(draft.form.availability).toBeNull();
    expect(draft.form.identity.genderId).toBeNull();
    expect(draft.meta.serverRegion).toBe('legacy-region');
    expect(draft.meta.profileVersion).toBe(2);
    expect(draft.meta.playerId).toBe('20000000-0000-4000-8000-000000000003');
    expect(draft.meta.canonicalProfileId).toBe(
      '30000000-0000-4000-8000-000000000003',
    );
    expect(draft.form.media.coverMediaId).toBeNull();
  });

  it('resolves exact backend values to canonical IDs and keeps DB UUIDs in metadata', async () => {
    mockReads({
      availability: [
        { day_of_week: 1, starts_at: '18:00:00', ends_at: '21:00:00' },
        { day_of_week: 1, starts_at: '21:00:00', ends_at: '23:59:59' },
      ],
      backendHeroes: [{ id: 'hero-db-edras', slug: 'edras' }],
      profile: {
        avatar_media_id: null,
        bio: '',
        display_name: 'Canonical Player',
        game_profiles: [
          {
            handle: 'CanonicalHandle',
            rank_id: 'rank-db-master',
            server_region: 'global',
          },
        ],
        id: session.user.id,
        profile_habits: [
          {
            comeback_response: 'Theo quyết định chung của đội',
            communication_channels: ['Voice khi cần'],
            decision_style: 'Cùng trao đổi trước khi quyết định',
            feedback_style: 'Chỉ nhắc ngắn gọn trong trận',
            loss_response: 'Nghỉ 5-15 phút',
            media_summary: { profile_basics: { gender: 'male' } },
            online_time_presets: ['Tối'],
            seriousness: 'Cân bằng',
            session_length: '3-5 trận',
            strategy_styles: ['Ưu tiên kiểm soát mục tiêu'],
            team_atmospheres: ['Nghiêm túc nhưng tôn trọng'],
            team_goals: ['Leo rank nghiêm túc'],
          },
        ],
        timezone: 'Asia/Bangkok',
      },
      ranks: [{ id: 'rank-db-master', slug: 'master' }],
      roles: [{ id: 'role-db-jungle', slug: 'jungle' }],
      selectedHeroes: [
        {
          created_at: '2026-07-01T00:00:00Z',
          hero_id: 'hero-db-edras',
          heroes: { slug: 'edras' },
        },
      ],
      selectedRoles: [
        { created_at: '2026-07-01T00:00:00Z', role_id: 'role-db-jungle' },
      ],
    });

    const draft = await fetchProfileEditDraft(session);

    expect(draft.form.gameProfile.rankId).toBe('master');
    expect(draft.form.laneSelection).toEqual({
      primary: 'jungle',
      secondary: null,
    });
    expect(draft.form.heroes).toEqual([{ heroId: 'edras', priority: 1 }]);
    expect(draft.form.habits.seriousnessId).toBe('seriousness.balanced');
    expect(draft.form.habits.communicationPreferenceIds).toEqual([
      'communication.voice-as-needed',
    ]);
    expect(draft.form.identity.genderId).toBe('male');
    expect(draft.form.availability).toEqual({
      slots: [{ dayOfWeek: 1, startMinute: 1080, endMinute: 1440 }],
      timezone: 'Asia/Bangkok',
    });
    expect(draft.meta.rankDbIds.master).toBe('rank-db-master');
    expect(draft.meta.laneDbIds.jungle).toBe('role-db-jungle');
    expect(draft.meta.heroDbIds.edras).toBe('hero-db-edras');
    expect(draft.meta.habitsLossless).toBe(true);
  });

  it('keeps unsupported legacy values outside canonical form and marks loss', async () => {
    mockReads({
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
        timezone: 'Asia/Bangkok',
      },
      selectedRoles: [
        { created_at: '2026-07-01T00:00:00Z', role_id: 'legacy-role-id' },
      ],
    });

    const draft = await fetchProfileEditDraft(session);

    expect(draft.form.gameProfile.rankId).toBeNull();
    expect(draft.form.laneSelection).toBeNull();
    expect(draft.form.habits.seriousnessId).toBeNull();
    expect(draft.form.identity.genderId).toBeNull();
    expect(draft.form.identity.status).toBeNull();
    expect(draft.form.media.coverMediaId).toBe('cover-explicit');
    expect(draft.meta.habitsLossless).toBe(false);
    expect(draft.meta.lanesLossless).toBe(false);
    expect(draft.meta.readIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown_rank' }),
        expect.objectContaining({ code: 'unknown_lane' }),
        expect.objectContaining({ code: 'unknown_gender' }),
      ]),
    );
    expect(draft.meta.habitIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown_legacy_value' }),
      ]),
    );
    expect(mockSupabaseRest).toHaveBeenCalledTimes(8);
  });
});
