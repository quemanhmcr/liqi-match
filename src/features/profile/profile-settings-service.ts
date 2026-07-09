import type { AuthSession } from '@/shared/auth/auth-service';
import { env } from '@/shared/config/env';
import { supabaseRest } from '@/shared/services/supabase-rest';

import { profileMediaUrl } from './profile-service';

type ProfileSettingsProfileRow = {
  id: string;
  is_discoverable: boolean;
};

type ProfileSettingsHabitRow = {
  media_summary: unknown | null;
};

type BlockedProfileRow = {
  avatar_media_id: string | null;
  blocked_id: string;
  created_at: string;
  deleted_at: string | null;
  display_name: string | null;
  reason: string | null;
};

type AccountDeleteResponse = {
  auditLogged: boolean;
  cleanup: {
    attempted: number;
    failed: string[];
    succeeded: number;
  };
  deletedAt: string;
  mediaDeleted: number;
  profileFound: boolean;
  profileId: string;
  status: 'deleted';
};

export type ProfileSettingsState = {
  allowProfileShare: boolean;
  blockedCount: number;
  isDiscoverable: boolean;
  showWinRate: boolean;
};

export type BlockedProfile = {
  avatarUrl?: string;
  blockedId: string;
  createdAt: string;
  displayName: string;
  reason?: string;
};

const settingsDefaults = {
  allow_profile_share: true,
  show_win_rate: true,
};

const defaultHabitInsert = {
  comeback_response: 'Vẫn cố gắng đến cuối',
  communication_channels: ['Voice khi cần'],
  decision_style: 'Cùng trao đổi trước khi quyết định',
  feedback_style: 'Chỉ nhắc ngắn gọn trong trận',
  loss_response: 'Chơi tiếp ngay',
  online_time_presets: ['Tối'],
  seriousness: 'Cân bằng',
  session_length: '3-5 trận',
  strategy_styles: [],
  team_atmospheres: ['Bình tĩnh, không tạo áp lực'],
  team_goals: ['Leo rank nghiêm túc'],
};

export async function fetchProfileSettings(
  session: AuthSession,
): Promise<ProfileSettingsState> {
  const profileId = session.user.id;
  const [profiles, habits, blocks] = await Promise.all([
    supabaseRest<ProfileSettingsProfileRow[]>(
      `profiles?select=id,is_discoverable&id=eq.${encodeURIComponent(profileId)}&limit=1`,
      { session },
    ),
    supabaseRest<ProfileSettingsHabitRow[]>(
      `profile_habits?select=media_summary&profile_id=eq.${encodeURIComponent(profileId)}&limit=1`,
      { session },
    ).catch(() => [] as ProfileSettingsHabitRow[]),
    supabaseRest<{ blocked_id: string }[]>(
      `blocks?select=blocked_id&blocker_id=eq.${encodeURIComponent(profileId)}`,
      { session },
    ).catch(() => [] as { blocked_id: string }[]),
  ]);

  const settings = settingsFromMediaSummary(habits[0]?.media_summary);

  return {
    allowProfileShare: settings.allow_profile_share,
    blockedCount: blocks.length,
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
  ).catch(() => [] as ProfileSettingsHabitRow[]);
  const mediaSummary = mediaSummaryRecord(rows[0]?.media_summary);
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

  await supabaseRest('profile_habits?on_conflict=profile_id', {
    body: {
      ...defaultHabitInsert,
      media_summary: {
        ...mediaSummary,
        settings: nextSettings,
      },
      profile_id: profileId,
    },
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    session,
  });
}

export async function fetchBlockedProfiles(
  session: AuthSession,
): Promise<BlockedProfile[]> {
  const rows = await supabaseRest<BlockedProfileRow[]>(
    'rpc/list_blocked_profiles',
    { body: {}, method: 'POST', session },
  );

  return rows.map((row) => ({
    avatarUrl: profileMediaUrl(row.avatar_media_id),
    blockedId: row.blocked_id,
    createdAt: row.created_at,
    displayName:
      row.deleted_at || !row.display_name
        ? `Người chơi ${row.blocked_id.slice(0, 8)}`
        : row.display_name,
    reason: row.reason ?? undefined,
  }));
}

export async function unblockProfile(session: AuthSession, blockedId: string) {
  await supabaseRest(
    [
      'blocks?',
      `blocker_id=eq.${encodeURIComponent(session.user.id)}`,
      `blocked_id=eq.${encodeURIComponent(blockedId)}`,
    ].join('&'),
    { method: 'DELETE', prefer: 'return=minimal', session },
  );
}

export async function deleteOwnAccount(session: AuthSession) {
  const response = await fetch(
    new URL('/functions/v1/account-delete', env.EXPO_PUBLIC_SUPABASE_URL),
    {
      body: JSON.stringify({ confirmation: 'DELETE' }),
      headers: {
        apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    },
  );

  if (!response.ok) {
    throw await toAccountDeleteError(response);
  }

  return (await response.json()) as AccountDeleteResponse;
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
async function toAccountDeleteError(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return new Error(
      body.error?.message ?? `Không thể xoá tài khoản (${response.status}).`,
    );
  } catch {
    return new Error(`Không thể xoá tài khoản (${response.status}).`);
  }
}
