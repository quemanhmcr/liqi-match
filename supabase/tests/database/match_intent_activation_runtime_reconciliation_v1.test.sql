begin;
select plan(8);

select ok(
  to_regprocedure('public.activate_match_intent_v1(jsonb,text,bigint)') is not null,
  'canonical Match Intent activation RPC exists'
);
select is(
  pg_get_function_result(
    to_regprocedure('public.activate_match_intent_v1(jsonb,text,bigint)')
  ),
  'jsonb',
  'activation RPC returns jsonb'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.activate_match_intent_v1(jsonb,text,bigint)',
    'EXECUTE'
  ),
  'authenticated can activate Match Intent'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.activate_match_intent_v1(jsonb,text,bigint)',
    'EXECUTE'
  ),
  'anonymous cannot activate Match Intent'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = to_regprocedure(
      'public.activate_match_intent_v1(jsonb,text,bigint)'
    )
  ),
  'activation RPC is security definer'
);
select is(
  (
    select proargnames::text
    from pg_proc
    where oid = to_regprocedure(
      'public.activate_match_intent_v1(jsonb,text,bigint)'
    )
  ),
  '{p_filters,p_idempotency_key,p_expected_version}',
  'activation RPC exposes the PostgREST parameter names used by the app'
);
select ok(
  to_regprocedure('private.canonical_match_intent_filters_v1(jsonb)') is not null,
  'activation filter canonicalizer exists'
);
select ok(
  to_regprocedure('private.match_intent_snapshot_v1(uuid)') is not null,
  'activation snapshot projection exists'
);

select * from finish();
rollback;
