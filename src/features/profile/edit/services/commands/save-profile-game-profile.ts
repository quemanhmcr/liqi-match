import { RankIdSchema, type RankId } from '@/entities/player-profile';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { ProfileEditForm } from '../../model/profile-edit-model';
import { ProfileEditCommandError } from './profile-edit-command-error';
import { normalizeGameHandle } from './profile-edit-command-utils';

export async function saveProfileGameProfile(input: {
  baseline: ProfileEditForm['gameProfile'];
  current: ProfileEditForm['gameProfile'];
  hasGameProfileRecord: boolean;
  profileId: string;
  rankDbIds: Partial<Record<RankId, string>>;
  session: AuthSession;
}) {
  if (!input.hasGameProfileRecord) {
    throw new ProfileEditCommandError(
      'Hồ sơ game chưa tồn tại. Profile Edit sẽ không tự tạo region hoặc handle giả.',
    );
  }

  const patch: Record<string, unknown> = {};
  if (input.baseline.handle !== input.current.handle) {
    patch.handle = normalizeGameHandle(input.current.handle);
  }
  if (input.baseline.rankId !== input.current.rankId) {
    if (input.current.rankId === null) {
      patch.rank_id = null;
    } else {
      const rankId = RankIdSchema.parse(input.current.rankId);
      const dbId = input.rankDbIds[rankId];
      if (!dbId) {
        throw new ProfileEditCommandError(
          `Rank canonical “${rankId}” chưa có DB UUID trong edit draft. Không có dữ liệu nào được ghi.`,
        );
      }
      patch.rank_id = dbId;
    }
  }
  if (!Object.keys(patch).length) return;

  await supabaseRest(
    `game_profiles?profile_id=eq.${encodeURIComponent(input.profileId)}`,
    {
      body: patch,
      method: 'PATCH',
      prefer: 'return=minimal',
      session: input.session,
    },
  );
}
