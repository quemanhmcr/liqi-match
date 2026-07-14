-- Remove the incompatible integer overloads introduced during parallel Match /
-- Conversation integration. The canonical bigint signatures from
-- 202607140004 remain authoritative and use private.command_receipts_v1.
-- Keeping both overloads makes PostgREST RPC resolution ambiguous and the
-- integer implementations depend on a command_idempotency_v1 table that is not
-- part of the integrated schema.

drop function if exists public.activate_match_intent_v1(jsonb, text, integer);

drop function if exists public.record_player_decision_v1(
  uuid,
  public.relationship_decision_v1,
  text,
  uuid,
  integer,
  integer
);
