import { HomeMatchFactsV1Schema } from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { HomeMatchFactsRepository } from './home-match-facts-repository';

export type HomeMatchFactsRpcTransport = (
  functionName: string,
  session: AuthSession,
  body: Record<string, never>,
) => Promise<unknown>;

export class SupabaseHomeMatchFactsRepository implements HomeMatchFactsRepository {
  constructor(private readonly rpc: HomeMatchFactsRpcTransport = callRpc) {}

  async list(session: AuthSession) {
    return HomeMatchFactsV1Schema.parse(
      await this.rpc('list_home_match_facts_v1', session, {}),
    );
  }
}

async function callRpc(
  functionName: string,
  session: AuthSession,
  body: Record<string, never>,
) {
  return await supabaseRest<unknown>(`rpc/${functionName}`, {
    body,
    method: 'POST',
    session,
  });
}
