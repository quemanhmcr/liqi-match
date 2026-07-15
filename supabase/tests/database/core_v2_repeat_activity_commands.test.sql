create extension if not exists pgtap with schema extensions;

begin;

select plan(34);

select has_function(
  'public',
  'request_repeat_session_v2',
  array['uuid[]', 'jsonb', 'bigint', 'jsonb', 'text', 'uuid'],
  'repeat-session request RPC exists'
);
select has_function(
  'public',
  'dismiss_activity_item_v2',
  array['uuid', 'bigint', 'jsonb', 'text', 'uuid'],
  'activity dismissal RPC exists'
);
select has_function(
  'public',
  'update_engagement_preferences_v2',
  array['jsonb', 'bigint', 'jsonb', 'text', 'uuid'],
  'engagement preference RPC exists'
);
select has_function(
  'public',
  'rebuild_reputation_projection_v2',
  array['uuid', 'bigint', 'jsonb', 'text', 'uuid'],
  'projection rebuild RPC exists'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000000941', 'authenticated', 'authenticated', 'repeat-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000942', 'authenticated', 'authenticated', 'repeat-b@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000000941', 'Repeat A'),
  ('01000000-0000-4000-8000-000000000942', 'Repeat B');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000941', '01000000-0000-4000-8000-000000000941', '01000000-0000-4000-8000-000000000941', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000942', '01000000-0000-4000-8000-000000000942', '01000000-0000-4000-8000-000000000942', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('30000000-0000-4000-8000-000000000941', '20000000-0000-4000-8000-000000000941', '01000000-0000-4000-8000-000000000941', 1, now()),
  ('30000000-0000-4000-8000-000000000942', '20000000-0000-4000-8000-000000000942', '01000000-0000-4000-8000-000000000942', 1, now());

insert into public.session_outcomes_v2 (
  id, session_id, source_event_id, source_session_version,
  participant_player_ids, role_assignments, source, scheduled_for,
  started_at, completed_at, confirmation_deadline_at, version
) values
  (
    '44000000-0000-4000-8000-000000000941',
    '82000000-0000-4000-8000-000000000941',
    '48000000-0000-4000-8000-000000000941',
    4,
    array[
      '20000000-0000-4000-8000-000000000941'::uuid,
      '20000000-0000-4000-8000-000000000942'::uuid
    ],
    '[]'::jsonb,
    '{"kind":"manual"}'::jsonb,
    '2026-07-10T10:00:00Z',
    '2026-07-10T10:05:00Z',
    '2026-07-10T11:00:00Z',
    '2026-07-13T11:00:00Z',
    3
  ),
  (
    '44000000-0000-4000-8000-000000000942',
    '82000000-0000-4000-8000-000000000942',
    '48000000-0000-4000-8000-000000000942',
    5,
    array[
      '20000000-0000-4000-8000-000000000941'::uuid,
      '20000000-0000-4000-8000-000000000942'::uuid
    ],
    '[]'::jsonb,
    '{"kind":"manual"}'::jsonb,
    '2026-07-12T10:00:00Z',
    '2026-07-12T10:05:00Z',
    '2026-07-12T11:00:00Z',
    '2026-07-15T11:00:00Z',
    3
  ),
  (
    '44000000-0000-4000-8000-000000000943',
    '82000000-0000-4000-8000-000000000943',
    '48000000-0000-4000-8000-000000000943',
    6,
    array[
      '20000000-0000-4000-8000-000000000941'::uuid,
      '20000000-0000-4000-8000-000000000942'::uuid
    ],
    '[]'::jsonb,
    '{"kind":"manual"}'::jsonb,
    '2026-07-14T10:00:00Z',
    '2026-07-14T10:05:00Z',
    '2026-07-14T11:00:00Z',
    '2026-07-17T11:00:00Z',
    3
  );

insert into public.session_participation_confirmations_v2 (
  id, outcome_id, session_id, player_id, status, reason_code,
  dispute_note, audit_metadata, confirmed_at
) values
  ('45000000-0000-4000-8000-000000000941', '44000000-0000-4000-8000-000000000941', '82000000-0000-4000-8000-000000000941', '20000000-0000-4000-8000-000000000941', 'confirmed', null, null, '{}'::jsonb, '2026-07-10T11:05:00Z'),
  ('45000000-0000-4000-8000-000000000942', '44000000-0000-4000-8000-000000000941', '82000000-0000-4000-8000-000000000941', '20000000-0000-4000-8000-000000000942', 'confirmed', null, null, '{}'::jsonb, '2026-07-10T11:06:00Z'),
  ('45000000-0000-4000-8000-000000000943', '44000000-0000-4000-8000-000000000942', '82000000-0000-4000-8000-000000000942', '20000000-0000-4000-8000-000000000941', 'confirmed', null, null, '{}'::jsonb, '2026-07-12T11:05:00Z'),
  ('45000000-0000-4000-8000-000000000944', '44000000-0000-4000-8000-000000000942', '82000000-0000-4000-8000-000000000942', '20000000-0000-4000-8000-000000000942', 'confirmed', null, null, '{}'::jsonb, '2026-07-12T11:06:00Z'),
  ('45000000-0000-4000-8000-000000000945', '44000000-0000-4000-8000-000000000943', '82000000-0000-4000-8000-000000000943', '20000000-0000-4000-8000-000000000941', 'confirmed', null, null, '{}'::jsonb, '2026-07-14T11:05:00Z'),
  ('45000000-0000-4000-8000-000000000946', '44000000-0000-4000-8000-000000000943', '82000000-0000-4000-8000-000000000943', '20000000-0000-4000-8000-000000000942', 'confirmed', null, null, '{}'::jsonb, '2026-07-14T11:06:00Z');

select lives_ok(
  $$select private.derive_repeat_teammates_v2(
    '44000000-0000-4000-8000-000000000942',
    '20000000-0000-4000-8000-000000000942',
    '43000000-0000-4000-8000-000000000941',
    '48000000-0000-4000-8000-000000000942'
  )$$,
  'second fully confirmed session derives repeat teammate facts'
);
select is(
  (select count(*)::integer from public.repeat_teammate_relationships_v2),
  1,
  'one canonical repeat teammate relationship is formed'
);
select is(
  (select completed_session_count::integer
    from public.repeat_teammate_relationships_v2),
  3,
  'derivation sees all currently fully confirmed sessions'
);
select is(
  (select player_low_id::text from public.repeat_teammate_relationships_v2),
  '20000000-0000-4000-8000-000000000941',
  'repeat teammate pair is canonically ordered'
);
select is(
  (select count(*)::integer from public.player_reputation_ledger_v2
    where dimension = 'repeat_teammate_count'),
  2,
  'relationship formation creates one immutable ledger fact per player'
);
select is(
  (select repeat_teammate_count::integer
    from public.player_reputation_projection_v2
    where player_id = '20000000-0000-4000-8000-000000000941'),
  1,
  'player A projection includes one repeat teammate'
);
select is(
  (select repeat_teammate_count::integer
    from public.player_reputation_projection_v2
    where player_id = '20000000-0000-4000-8000-000000000942'),
  1,
  'player B projection includes one repeat teammate'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type = 'repeat_teammate.formed.v2'),
  1,
  'relationship formation emits one versioned event'
);

select lives_ok(
  $$select private.derive_repeat_teammates_v2(
    '44000000-0000-4000-8000-000000000942',
    '20000000-0000-4000-8000-000000000942',
    '43000000-0000-4000-8000-000000000941',
    '48000000-0000-4000-8000-000000000942'
  )$$,
  'repeat derivation can be safely replayed'
);
select is(
  (select count(*)::integer from public.repeat_teammate_relationships_v2),
  1,
  'repeat derivation replay creates no duplicate relationship'
);
select is(
  (select count(*)::integer from public.player_reputation_ledger_v2
    where dimension = 'repeat_teammate_count'),
  2,
  'repeat derivation replay creates no duplicate ledger facts'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type = 'repeat_teammate.formed.v2'),
  1,
  'repeat derivation replay emits no second formation event'
);

insert into public.activity_items_v2 (
  id, player_id, kind, payload, priority, deduplication_key
) values (
  '47000000-0000-4000-8000-000000000941',
  '20000000-0000-4000-8000-000000000941',
  'reputation_progress',
  '{"projectionVersion":1}'::jsonb,
  500,
  'test-dismiss:repeat-a'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000941', true);
select is(
  public.dismiss_activity_item_v2(
    '47000000-0000-4000-8000-000000000941',
    1,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T12:00:00Z","clientRequestId":"49000000-0000-4000-8000-000000000941","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000041',
    '43000000-0000-4000-8000-000000000942'
  ) ->> 'resultCode',
  'activity_item_dismissed',
  'activity owner can dismiss an item'
);
select is(
  (public.dismiss_activity_item_v2(
    '47000000-0000-4000-8000-000000000941',
    1,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T12:00:00Z","clientRequestId":"49000000-0000-4000-8000-000000000941","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000041',
    '43000000-0000-4000-8000-000000000942'
  ) ->> 'repeated')::boolean,
  true,
  'activity dismissal replay returns the same receipt'
);
reset role;

select is(
  (select version::integer from public.activity_items_v2
    where id = '47000000-0000-4000-8000-000000000941'),
  2,
  'dismissal advances the activity aggregate version'
);
select isnt(
  (select dismissed_at from public.activity_items_v2
    where id = '47000000-0000-4000-8000-000000000941'),
  null::timestamptz,
  'dismissal records an authoritative timestamp'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type = 'activity.item_dismissed.v2'
      and aggregate_id = '47000000-0000-4000-8000-000000000941'),
  1,
  'dismissal replay emits one event only'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000941', true);
select is(
  public.update_engagement_preferences_v2(
    '{"activityEnabled":true,"feedbackPromptsEnabled":false,"maxReactivationNotificationsPerDay":0,"pushReactivationEnabled":false,"repeatPlayPromptsEnabled":true}'::jsonb,
    1,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T12:05:00Z","clientRequestId":"49000000-0000-4000-8000-000000000942","platform":"ios"}'::jsonb,
    '49000000-0000-4000-8000-000000000042',
    '43000000-0000-4000-8000-000000000943'
  ) ->> 'resultCode',
  'engagement_preferences_updated',
  'player can update exact engagement preferences'
);
select is(
  (public.update_engagement_preferences_v2(
    '{"activityEnabled":true,"feedbackPromptsEnabled":false,"maxReactivationNotificationsPerDay":0,"pushReactivationEnabled":false,"repeatPlayPromptsEnabled":true}'::jsonb,
    1,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T12:05:00Z","clientRequestId":"49000000-0000-4000-8000-000000000942","platform":"ios"}'::jsonb,
    '49000000-0000-4000-8000-000000000042',
    '43000000-0000-4000-8000-000000000943'
  ) ->> 'repeated')::boolean,
  true,
  'preference timeout replay returns the same receipt'
);
select throws_like(
  $$select public.update_engagement_preferences_v2(
    '{"activityEnabled":true,"feedbackPromptsEnabled":true,"maxReactivationNotificationsPerDay":5,"pushReactivationEnabled":true,"repeatPlayPromptsEnabled":true}'::jsonb,
    2,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T12:06:00Z","clientRequestId":"49000000-0000-4000-8000-000000000943","platform":"ios"}'::jsonb,
    '49000000-0000-4000-8000-000000000043',
    '43000000-0000-4000-8000-000000000944'
  )$$,
  '%validation_failed%',
  'notification cap above four fails closed'
);
reset role;

select is(
  (select version::integer from public.engagement_preferences_v2
    where player_id = '20000000-0000-4000-8000-000000000941'),
  2,
  'preference update advances aggregate version'
);
select is(
  (select max_reactivation_notifications_per_day::integer
    from public.engagement_preferences_v2
    where player_id = '20000000-0000-4000-8000-000000000941'),
  0,
  'preference update persists the exact frequency cap'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type = 'engagement.preferences_updated.v2'
      and aggregate_id = '20000000-0000-4000-8000-000000000941'),
  1,
  'preference replay emits one event only'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.rebuild_reputation_projection_v2(
    '20000000-0000-4000-8000-000000000941',
    1,
    '{"appVersion":"rebuild-worker","clientCreatedAt":"2026-07-14T12:10:00Z","clientRequestId":"49000000-0000-4000-8000-000000000944","platform":"unknown"}'::jsonb,
    '49000000-0000-4000-8000-000000000044',
    '43000000-0000-4000-8000-000000000945'
  ) ->> 'resultCode',
  'projection_rebuilt',
  'service-role worker can rebuild a projection from immutable ledger facts'
);
select is(
  (public.rebuild_reputation_projection_v2(
    '20000000-0000-4000-8000-000000000941',
    1,
    '{"appVersion":"rebuild-worker","clientCreatedAt":"2026-07-14T12:10:00Z","clientRequestId":"49000000-0000-4000-8000-000000000944","platform":"unknown"}'::jsonb,
    '49000000-0000-4000-8000-000000000044',
    '43000000-0000-4000-8000-000000000945'
  ) ->> 'repeated')::boolean,
  true,
  'projection rebuild replay returns the authoritative receipt'
);
reset role;

select is(
  (select repeat_teammate_count::integer
    from public.player_reputation_projection_v2
    where player_id = '20000000-0000-4000-8000-000000000941'),
  1,
  'rebuild parity preserves repeat teammate count'
);
select isnt(
  (select rebuilt_at from public.player_reputation_projection_v2
    where player_id = '20000000-0000-4000-8000-000000000941'),
  null::timestamptz,
  'rebuild records an authoritative rebuiltAt timestamp'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type = 'player.reputation_changed.v2'
      and correlation_id = '43000000-0000-4000-8000-000000000945'),
  1,
  'projection rebuild replay emits one reputation event only'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000941', true);
select throws_like(
  $$select public.rebuild_reputation_projection_v2(
    '20000000-0000-4000-8000-000000000941',
    1,
    '{}'::jsonb,
    '49000000-0000-4000-8000-000000000045',
    '43000000-0000-4000-8000-000000000946'
  )$$,
  '%permission denied%',
  'mobile clients cannot invoke projection rebuild tooling'
);
select throws_like(
  $$select public.request_repeat_session_v2(
    array['20000000-0000-4000-8000-000000000942'::uuid],
    '[{"teammatePlayerId":"20000000-0000-4000-8000-000000000942","version":1}]'::jsonb,
    1,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T12:15:00Z","clientRequestId":"49000000-0000-4000-8000-000000000946","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000046',
    '43000000-0000-4000-8000-000000000947'
  )$$,
  '%validation_failed%',
  'repeat request enforces create aggregate expectedVersion zero before Social capability evaluation'
);
reset role;

select * from finish();
rollback;
