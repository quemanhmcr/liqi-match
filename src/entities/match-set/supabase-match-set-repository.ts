import {
  CreateSetInviteCommandV1Schema,
  RequestSetJoinCommandV1Schema,
  SetDiscoveryPageV1Schema,
  SetDiscoveryQueryV1Schema,
  SetInviteReceiptV1Schema,
  SetJoinRequestReceiptV1Schema,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';
import { prepareCoreV2CommandMetadata } from '@/shared/core-v2';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { MatchSetRepository } from './match-set-repository';

export type MatchSetRpcTransport = (
  functionName: string,
  session: AuthSession,
  body: Record<string, unknown>,
) => Promise<unknown>;

export type MatchSetMetadataFactory = (
  expectedVersion: number,
) => ReturnType<typeof prepareCoreV2CommandMetadata>;

export class SupabaseMatchSetRepository implements MatchSetRepository {
  constructor(
    private readonly rpc: MatchSetRpcTransport = callRpc,
    private readonly metadataFactory: MatchSetMetadataFactory = defaultMetadataFactory,
  ) {}

  async list(
    session: AuthSession,
    input: { cursor?: string | null; limit?: number },
  ) {
    const query = SetDiscoveryQueryV1Schema.parse(input);
    return SetDiscoveryPageV1Schema.parse(
      await this.rpc('list_discovery_sets_v1', session, {
        p_cursor: query.cursor ?? null,
        p_limit: query.limit,
      }),
    );
  }

  async invite(session: AuthSession, command: unknown) {
    const input = CreateSetInviteCommandV1Schema.parse(command);
    const metadata = this.metadataFactory(input.expectedSetVersion);
    return SetInviteReceiptV1Schema.parse(
      await this.rpc('create_set_invite_compat_v2', session, {
        p_audit: metadata.audit,
        p_correlation_id: input.correlationId,
        p_expected_version: input.expectedSetVersion,
        p_idempotency_key: input.idempotencyKey,
        p_set_id: input.setId,
        p_target_player_id: input.targetPlayerId,
      }),
    );
  }

  async requestJoin(session: AuthSession, command: unknown) {
    const input = RequestSetJoinCommandV1Schema.parse(command);
    const metadata = this.metadataFactory(input.expectedSetVersion);
    return SetJoinRequestReceiptV1Schema.parse(
      await this.rpc('request_set_join_compat_v2', session, {
        p_audit: metadata.audit,
        p_correlation_id: input.correlationId,
        p_expected_version: input.expectedSetVersion,
        p_idempotency_key: input.idempotencyKey,
        p_set_id: input.setId,
      }),
    );
  }
}

async function callRpc(
  functionName: string,
  session: AuthSession,
  body: Record<string, unknown>,
) {
  return await supabaseRest<unknown>(`rpc/${functionName}`, {
    body,
    method: 'POST',
    session,
  });
}

function defaultMetadataFactory(expectedVersion: number) {
  return prepareCoreV2CommandMetadata(expectedVersion, {
    idempotencyScope: 'match-set',
  });
}
