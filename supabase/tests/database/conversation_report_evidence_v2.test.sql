create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

select has_function(
  'public',
  'capture_message_report_evidence_v2',
  array['uuid'],
  'strict report evidence RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.capture_message_report_evidence_v2(uuid)',
    'EXECUTE'
  ),
  'authenticated reporter may execute evidence capture'
);
select ok(
  position(
    '''message'', jsonb_build_object' in
    pg_get_functiondef(
      'public.capture_message_report_evidence_v2(uuid)'::regprocedure
    )
  ) > 0,
  'evidence response embeds the immutable Message V2 snapshot'
);
select ok(
  position(
    '''repeated''' in
    pg_get_functiondef(
      'public.capture_message_report_evidence_v2(uuid)'::regprocedure
    )
  ) = 0,
  'strict evidence DTO omits transport-only replay fields'
);

select * from finish();
rollback;
