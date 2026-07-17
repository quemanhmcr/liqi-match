begin;
select plan(8);

select ok(
  to_regprocedure('private.canonical_match_intent_filters_v1(jsonb)') is not null,
  'canonical Match Intent filter helper exists'
);
select ok(
  to_regprocedure('private.match_intent_snapshot_v1(uuid)') is not null,
  'Match Intent snapshot helper exists'
);
select is(
  pg_get_function_result(
    to_regprocedure('private.canonical_match_intent_filters_v1(jsonb)')
  ),
  'jsonb',
  'filter helper returns jsonb'
);
select is(
  pg_get_function_result(
    to_regprocedure('private.match_intent_snapshot_v1(uuid)')
  ),
  'jsonb',
  'snapshot helper returns jsonb'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.canonical_match_intent_filters_v1(jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot call private filter helper directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.match_intent_snapshot_v1(uuid)',
    'EXECUTE'
  ),
  'authenticated cannot call private snapshot helper directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'private.canonical_match_intent_filters_v1(jsonb)',
    'EXECUTE'
  ),
  'service role can execute filter helper'
);
select ok(
  has_function_privilege(
    'service_role',
    'private.match_intent_snapshot_v1(uuid)',
    'EXECUTE'
  ),
  'service role can execute snapshot helper'
);

select * from finish();
rollback;
