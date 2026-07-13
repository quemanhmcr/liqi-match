import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import { ProfileEditCommandError } from './profile-edit-command-error';
import { recordValue } from './profile-edit-command-utils';

type MediaSummaryRow = { media_summary: unknown | null };

export async function patchProfileMediaSummary(
  session: AuthSession,
  profileId: string,
  update: (summary: Record<string, unknown>) => Record<string, unknown>,
) {
  const rows = await supabaseRest<MediaSummaryRow[]>(
    `profile_habits?select=media_summary&profile_id=eq.${encodeURIComponent(profileId)}&limit=1`,
    { session },
  );
  if (!rows[0]) {
    throw new ProfileEditCommandError(
      'profile_habits chưa tồn tại; không tạo completion marker từ Profile Edit.',
    );
  }
  const current = recordValue(rows[0].media_summary);
  await supabaseRest(
    `profile_habits?profile_id=eq.${encodeURIComponent(profileId)}`,
    {
      body: { media_summary: update(current) },
      method: 'PATCH',
      prefer: 'return=minimal',
      session,
    },
  );
}
