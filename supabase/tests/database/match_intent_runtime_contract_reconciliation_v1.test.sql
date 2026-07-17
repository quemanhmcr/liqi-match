begin;
select plan(10);

select ok(
  to_regprocedure('public.get_current_match_intent_v1()') is not null,
  'current Match Intent read RPC exists'
);
select ok(
  to_regprocedure('public.pause_match_intent_v1(text,bigint)') is not null,
  'pause Match Intent RPC exists'
);
select is(
  pg_get_function_result(to_regprocedure('public.get_current_match_intent_v1()')),
  'jsonb',
  'current Match Intent RPC returns jsonb'
);
select is(
  pg_get_function_result(to_regprocedure('public.pause_match_intent_v1(text,bigint)')),
  'jsonb',
  'pause Match Intent RPC returns jsonb'
);
select ok(
  has_function_privilege('authenticated', 'public.get_current_match_intent_v1()', 'EXECUTE'),
  'authenticated can read current Match Intent'
);
select ok(
  not has_function_privilege('anon', 'public.get_current_match_intent_v1()', 'EXECUTE'),
  'anonymous cannot read current Match Intent'
);
select ok(
  has_function_privilege('authenticated', 'public.pause_match_intent_v1(text,bigint)', 'EXECUTE'),
  'authenticated can pause Match Intent'
);
select ok(
  not has_function_privilege('anon', 'public.pause_match_intent_v1(text,bigint)', 'EXECUTE'),
  'anonymous cannot pause Match Intent'
);
select ok(
  (select prosecdef from pg_proc where oid = to_regprocedure('public.get_current_match_intent_v1()')),
  'current Match Intent RPC is security definer'
);
select ok(
  (select prosecdef from pg_proc where oid = to_regprocedure('public.pause_match_intent_v1(text,bigint)')),
  'pause Match Intent RPC is security definer'
);

select * from finish();
rollback;
