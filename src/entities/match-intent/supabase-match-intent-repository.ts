import { z } from 'zod';

import {
  ActivateMatchIntentCommandV1Schema,
  ActivateMatchIntentReceiptV1Schema,
  MatchIntentSnapshotV1Schema,
  PauseMatchIntentCommandV1Schema,
  PauseMatchIntentReceiptV1Schema,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { MatchIntentRepository } from './match-intent-repository';

export type MatchIntentRpcTransport = (
  functionName: string,
  session: AuthSession,
  body: Record<string, unknown>,
) => Promise<unknown>;

const nullableSnapshotSchema = MatchIntentSnapshotV1Schema.nullable();

export class SupabaseMatchIntentRepository implements MatchIntentRepository {
  constructor(private readonly rpc: MatchIntentRpcTransport = callRpc) {}

  async getCurrent(session: AuthSession) {
    const response = await this.rpc('get_current_match_intent_v1', session, {});
    return parseRpc(nullableSnapshotSchema, response);
  }

  async activate(session: AuthSession, command: unknown) {
    const input = ActivateMatchIntentCommandV1Schema.parse(command);
    const response = await this.rpc('activate_match_intent_v1', session, {
      p_expected_version: input.expectedVersion ?? null,
      p_filters: input.filters,
      p_idempotency_key: input.idempotencyKey,
    });
    return parseRpc(ActivateMatchIntentReceiptV1Schema, response);
  }

  async pause(session: AuthSession, command: unknown) {
    const input = PauseMatchIntentCommandV1Schema.parse(command);
    const response = await this.rpc('pause_match_intent_v1', session, {
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    });
    return parseRpc(PauseMatchIntentReceiptV1Schema, response);
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

function parseRpc<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  throw Object.assign(new Error('Match Intent RPC contract violation.'), {
    cause: result.error,
    code: 'contract_violation',
    retryable: false,
  });
}
