import {
  LaneSelectionSchema,
  type LaneSelection,
  type LaneSlug,
} from '@/entities/player-profile';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import { ProfileEditCommandError } from './profile-edit-command-error';

export async function saveProfileRoles(input: {
  baselineSelection: LaneSelection | null;
  currentSelection: LaneSelection | null;
  laneDbIds: Partial<Record<LaneSlug, string>>;
  lanesLossless: boolean;
  profileId: string;
  session: AuthSession;
}) {
  if (!input.lanesLossless) {
    throw new ProfileEditCommandError(
      'Lane legacy chưa resolve losslessly. Hãy xử lý giá trị unsupported trước khi lưu lane.',
    );
  }

  const previous = toDbIds(input.baselineSelection, input.laneDbIds);
  const selected = toDbIds(input.currentSelection, input.laneDbIds);
  const additions = selected.filter((roleId) => !previous.includes(roleId));
  const removals = previous.filter((roleId) => !selected.includes(roleId));
  let databaseChanged = false;

  try {
    for (const roleId of additions) {
      await supabaseRest('profile_roles?on_conflict=profile_id,role_id', {
        body: { profile_id: input.profileId, role_id: roleId },
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        session: input.session,
      });
      databaseChanged = true;
    }

    for (const roleId of removals) {
      await supabaseRest(
        [
          'profile_roles?',
          `profile_id=eq.${encodeURIComponent(input.profileId)}`,
          `&role_id=eq.${encodeURIComponent(roleId)}`,
        ].join(''),
        { method: 'DELETE', prefer: 'return=minimal', session: input.session },
      );
      databaseChanged = true;
    }
  } catch (error) {
    throw new ProfileEditCommandError(
      'Vai trò chỉ được cập nhật một phần. Replacement luôn được upsert trước khi vai trò cũ bị xoá.',
      { cause: error, partiallySaved: databaseChanged },
    );
  }
}

function toDbIds(
  selection: LaneSelection | null,
  dbIds: Partial<Record<LaneSlug, string>>,
) {
  if (!selection) return [];
  const canonical = LaneSelectionSchema.parse(selection);
  return [canonical.primary, canonical.secondary]
    .filter((value): value is LaneSlug => Boolean(value))
    .map((laneId) => {
      const dbId = dbIds[laneId];
      if (!dbId) {
        throw new ProfileEditCommandError(
          `Lane canonical “${laneId}” chưa có DB UUID trong edit draft.`,
        );
      }
      return dbId;
    });
}
