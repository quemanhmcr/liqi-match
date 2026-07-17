import { z } from 'zod';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  PlayerSummaryV1Schema,
  type PlayerId,
} from '@/shared/contracts/core-v1';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { PlayerIdentityRepository } from './player-identity-repository';

const VisiblePlayerIdentitiesSchema = z.array(PlayerSummaryV1Schema).max(50);

export class SupabasePlayerIdentityRepository implements PlayerIdentityRepository {
  async listVisible(session: AuthSession, playerIds: readonly PlayerId[]) {
    if (playerIds.length === 0) return [];
    return VisiblePlayerIdentitiesSchema.parse(
      await supabaseRest<unknown>('rpc/list_visible_player_identities_v2', {
        body: { p_player_ids: [...new Set(playerIds)].slice(0, 50) },
        method: 'POST',
        session,
      }),
    );
  }
}
