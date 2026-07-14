create extension if not exists pgtap with schema extensions;

begin;

select plan(15);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000601', 'authenticated', 'authenticated', 'rollout-a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000602', 'authenticated', 'authenticated', 'rollout-b@example.test', 'x', now(), now(), now());

select is(
  private.match_authority_capability_enabled_v1(
    'reads',
    '00000000-0000-0000-0000-000000000601'
  ),
  false,
  'reads are disabled before cohort rollout'
);
select is(
  private.match_authority_capability_enabled_v1(
    'intent_writes',
    '00000000-0000-0000-0000-000000000601'
  ),
  false,
  'intent writes are independently disabled'
);
select is(
  private.match_authority_capability_enabled_v1(
    'decision_writes',
    '00000000-0000-0000-0000-000000000601'
  ),
  false,
  'decision writes are independently disabled'
);

set local role service_role;
select public.configure_match_authority_cohort_v1(
  '00000000-0000-0000-0000-000000000601',
  true,
  false,
  false
);
reset role;

select is(
  private.match_authority_capability_enabled_v1(
    'reads',
    '00000000-0000-0000-0000-000000000601'
  ),
  true,
  'read cohort can shadow/cut over before writes'
);
select is(
  private.match_authority_capability_enabled_v1(
    'intent_writes',
    '00000000-0000-0000-0000-000000000601'
  ),
  false,
  'read cohort does not implicitly enable intent writes'
);
select is(
  private.match_authority_capability_enabled_v1(
    'reads',
    '00000000-0000-0000-0000-000000000602'
  ),
  false,
  'non-cohort account remains on the previous read path'
);

set local role service_role;
select public.configure_match_authority_cohort_v1(
  '00000000-0000-0000-0000-000000000601',
  true,
  true,
  false
);
reset role;

select is(
  private.match_authority_capability_enabled_v1(
    'intent_writes',
    '00000000-0000-0000-0000-000000000601'
  ),
  true,
  'Match Intent writes can cut over independently'
);
select is(
  private.match_authority_capability_enabled_v1(
    'decision_writes',
    '00000000-0000-0000-0000-000000000601'
  ),
  false,
  'mutual-match writes remain disabled until final cutover'
);

set local role service_role;
select public.set_match_authority_emergency_stop_v1(true);
reset role;

select is(
  private.match_authority_capability_enabled_v1(
    'reads',
    '00000000-0000-0000-0000-000000000601'
  ),
  false,
  'emergency stop overrides cohort reads'
);
select is(
  private.match_authority_capability_enabled_v1(
    'intent_writes',
    '00000000-0000-0000-0000-000000000601'
  ),
  false,
  'emergency stop overrides cohort writes'
);

set local role service_role;
select public.set_match_authority_emergency_stop_v1(false);
reset role;

update private.match_authority_config_v1
set reads_enabled = true;

select is(
  private.match_authority_capability_enabled_v1(
    'reads',
    '00000000-0000-0000-0000-000000000602'
  ),
  true,
  'global read cutover enables accounts outside cohorts'
);
select is(
  private.match_authority_capability_enabled_v1(
    'decision_writes',
    '00000000-0000-0000-0000-000000000602'
  ),
  false,
  'global reads do not implicitly enable authoritative writes'
);
select throws_like(
  $$select private.match_authority_capability_enabled_v1(
    'unknown',
    '00000000-0000-0000-0000-000000000601'
  )$$,
  '%validation_failed%',
  'unknown rollout capability is rejected'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.configure_match_authority_cohort_v1(uuid,boolean,boolean,boolean)',
    'EXECUTE'
  ),
  'service role can configure cohorts'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.configure_match_authority_cohort_v1(uuid,boolean,boolean,boolean)',
    'EXECUTE'
  ),
  'authenticated clients cannot configure cohorts'
);

select * from finish();
rollback;
