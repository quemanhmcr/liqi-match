import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

type ProfileSettingsProfileRow = {
  id: string;
  is_discoverable: boolean;
};

type ProfileSettingsHabitRow = {
  media_summary: unknown | null;
};

export type ProfileSettingsState = {
  allowProfileShare: boolean;
  isDiscoverable: boolean;
  showWinRate: boolean;
};

const settingsDefaults = {
  allow_profile_share: true,
  show_win_rate: true,
};

export async function fetchProfileSettings(
  session: AuthSession,
): Promise<ProfileSettingsState> {
  const profileId = session.user.id;
  const [profiles, habits] = await Promise.all([
    supabaseRest<ProfileSettingsProfileRow[]>(
      `profiles?select=id,is_discoverable&id=eq.${encodeURIComponent(profileId)}&limit=1`,
      { session },
    ),
    supabaseRest<ProfileSettingsHabitRow[]>(
      `profile_habits?select=media_summary&profile_id=eq.${encodeURIComponent(profileId)}&limit=1`,
      { session },
    ).catch(() => [] as ProfileSettingsHabitRow[]),
  ]);

  const settings = settingsFromMediaSummary(habits[0]?.media_summary);

  return {
    allowProfileShare: settings.allow_profile_share,
    isDiscoverable: profiles[0]?.is_discoverable ?? true,
    showWinRate: settings.show_win_rate,
  };
}

export async function updateDiscoverability(
  session: AuthSession,
  isDiscoverable: boolean,
) {
  await supabaseRest(`profiles?id=eq.${encodeURIComponent(session.user.id)}`, {
    body: { is_discoverable: isDiscoverable },
    method: 'PATCH',
    prefer: 'return=minimal',
    session,
  });
}

export async function updateProfileSoftSettings(
  session: AuthSession,
  input: Partial<
    Pick<ProfileSettingsState, 'allowProfileShare' | 'showWinRate'>
  >,
) {
  const profileId = session.user.id;
  const rows = await supabaseRest<ProfileSettingsHabitRow[]>(
    `profile_habits?select=media_summary&profile_id=eq.${encodeURIComponent(profileId)}&limit=1`,
    { session },
  );
  const row = rows[0];
  if (!row) {
    throw new Error(
      'Chưa thể lưu cài đặt mềm trước khi hồ sơ hoàn tất. Không có dữ liệu thói quen nào được tạo.',
    );
  }
  const mediaSummary = mediaSummaryRecord(row.media_summary);
  const currentSettings = settingsFromMediaSummary(mediaSummary);
  const nextSettings = {
    ...currentSettings,
    ...(input.allowProfileShare === undefined
      ? {}
      : { allow_profile_share: input.allowProfileShare }),
    ...(input.showWinRate === undefined
      ? {}
      : { show_win_rate: input.showWinRate }),
  };

  await supabaseRest(
    `profile_habits?profile_id=eq.${encodeURIComponent(profileId)}`,
    {
      body: {
        media_summary: {
          ...mediaSummary,
          settings: nextSettings,
        },
      },
      method: 'PATCH',
      prefer: 'return=minimal',
      session,
    },
  );
}

function settingsFromMediaSummary(value: unknown) {
  const summary = mediaSummaryRecord(value);
  const settings = mediaSummaryRecord(summary.settings);
  return {
    allow_profile_share: booleanSetting(
      settings.allow_profile_share,
      settingsDefaults.allow_profile_share,
    ),
    show_win_rate: booleanSetting(
      settings.show_win_rate,
      settingsDefaults.show_win_rate,
    ),
  };
}

function booleanSetting(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function mediaSummaryRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
