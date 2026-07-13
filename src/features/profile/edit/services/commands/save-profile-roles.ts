import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import { ProfileEditCommandError } from './profile-edit-command-error';
import { uniqueIds } from './profile-edit-command-utils';

export async function saveProfileRoles(input: {
  baselineRoleIds: readonly string[];
  currentRoleIds: readonly string[];
  profileId: string;
  session: AuthSession;
}) {
  const previous = uniqueIds(input.baselineRoleIds);
  const selected = uniqueIds(input.currentRoleIds).slice(0, 2);
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
