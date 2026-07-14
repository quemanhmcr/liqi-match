create extension if not exists pgtap with schema extensions;

begin;
select plan(53);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000002501', 'authenticated', 'authenticated', 'privacy-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002502', 'authenticated', 'authenticated', 'privacy-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002503', 'authenticated', 'authenticated', 'privacy-c@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000002504', 'authenticated', 'authenticated', 'privacy-suspended@example.test', 'x', now(), now(), now());
insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000002501', 'Privacy A'),
  ('01000000-0000-4000-8000-000000002502', 'Privacy B'),
  ('01000000-0000-4000-8000-000000002503', 'Privacy C'),
  ('01000000-0000-4000-8000-000000002504', 'Privacy Suspended');
insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000002501', '01000000-0000-4000-8000-000000002501', '01000000-0000-4000-8000-000000002501', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002502', '01000000-0000-4000-8000-000000002502', '01000000-0000-4000-8000-000000002502', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002503', '01000000-0000-4000-8000-000000002503', '01000000-0000-4000-8000-000000002503', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000002504', '01000000-0000-4000-8000-000000002504', '01000000-0000-4000-8000-000000002504', 'suspended', 2, false, false);
insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000002501', '21000000-0000-4000-8000-000000002501', '01000000-0000-4000-8000-000000002501', 1, now()),
  ('31000000-0000-4000-8000-000000002502', '21000000-0000-4000-8000-000000002502', '01000000-0000-4000-8000-000000002502', 1, now()),
  ('31000000-0000-4000-8000-000000002503', '21000000-0000-4000-8000-000000002503', '01000000-0000-4000-8000-000000002503', 1, now()),
  ('31000000-0000-4000-8000-000000002504', '21000000-0000-4000-8000-000000002504', '01000000-0000-4000-8000-000000002504', 1, now());
update private.social_authority_config_v2 set writes_enabled = true where singleton;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002501', true);

create temporary table privacy_default as
select public.get_player_privacy_v2() as snapshot;
select is((select (snapshot ->> 'contractVersion')::integer from privacy_default), 2, 'privacy read uses Core V2 contract');
select is((select (snapshot ->> 'version')::integer from privacy_default), 1, 'privacy aggregate begins at version one');
select is((select snapshot ->> 'profileVisibility' from privacy_default), 'everyone', 'profile visibility defaults to everyone');
select is((select snapshot ->> 'presenceVisibility' from privacy_default), 'friends', 'presence visibility defaults to friends');
select is((select snapshot ->> 'trustVisibility' from privacy_default), 'friends', 'trust projection defaults to friends');

create temporary table privacy_updated as
select public.update_player_privacy_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T14:00:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'privacy-update-a'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002501',
  'expectedPrivacyVersion', 1,
  'friendshipRequests', 'matched_only',
  'idempotencyKey', 'privacy.update.a.0001',
  'presenceVisibility', 'hidden',
  'profileVisibility', 'friends',
  'sessionInvites', 'nobody',
  'trustVisibility', 'private'
)) as receipt;
select is((select (receipt ->> 'repeated')::boolean from privacy_updated), false, 'first privacy update is not replay');
select is((select (receipt #>> '{privacy,version}')::integer from privacy_updated), 2, 'privacy update increments version');
select is((select receipt #>> '{privacy,profileVisibility}' from privacy_updated), 'friends', 'privacy receipt returns profile policy');
select is((select receipt #>> '{privacy,presenceVisibility}' from privacy_updated), 'hidden', 'privacy receipt returns presence policy');
select is((select receipt #>> '{privacy,trustVisibility}' from privacy_updated), 'private', 'privacy receipt returns trust policy');
select is((select jsonb_array_length(receipt -> 'eventIds') from privacy_updated), 1, 'privacy update returns one event');

create temporary table privacy_replay as
select public.update_player_privacy_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T14:00:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'privacy-update-a'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002501',
  'expectedPrivacyVersion', 1,
  'friendshipRequests', 'matched_only',
  'idempotencyKey', 'privacy.update.a.0001',
  'presenceVisibility', 'hidden',
  'profileVisibility', 'friends',
  'sessionInvites', 'nobody',
  'trustVisibility', 'private'
)) as receipt;
select is((select (receipt ->> 'repeated')::boolean from privacy_replay), true, 'privacy retry returns durable receipt');
select is((select receipt -> 'eventIds' from privacy_replay), (select receipt -> 'eventIds' from privacy_updated), 'privacy replay preserves event identity');
select throws_like(
  $$select public.update_player_privacy_v2(jsonb_build_object(
    'audit', jsonb_build_object(
      'clientCreatedAt', '2026-07-14T14:01:00.000Z',
      'clientPlatform', 'ios',
      'clientVersion', '2.0.0',
      'requestId', 'privacy-update-stale'
    ),
    'correlationId', '43000000-0000-4000-8000-000000002502',
    'expectedPrivacyVersion', 1,
    'friendshipRequests', 'everyone',
    'idempotencyKey', 'privacy.update.a.stale',
    'presenceVisibility', 'friends',
    'profileVisibility', 'everyone',
    'sessionInvites', 'friends',
    'trustVisibility', 'friends'
  ))$$,
  '%privacy_version_conflict%',
  'privacy update rejects stale aggregate version'
);

reset role;
select is(
  (select count(*)::integer from private.outbox_events where event_type = 'privacy.updated.v2' and aggregate_id = '21000000-0000-4000-8000-000000002501'),
  1,
  'privacy replay does not duplicate event'
);
select is(
  (select payload #>> '{payload,trustVisibility}' from private.outbox_events where event_type = 'privacy.updated.v2' and aggregate_id = '21000000-0000-4000-8000-000000002501'),
  'private',
  'privacy event carries trust visibility authority'
);
select is(
  (select count(*)::integer from private.audit_logs where action = 'privacy.updated.v2' and target_id = '21000000-0000-4000-8000-000000002501'),
  1,
  'privacy update writes one server audit row'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002504', true);
select is(public.get_player_privacy_v2() ->> 'playerId', '21000000-0000-4000-8000-000000002504', 'suspended player may read own privacy settings');
select throws_like(
  $$select public.update_player_privacy_v2(jsonb_build_object(
    'audit', jsonb_build_object(
      'clientCreatedAt', '2026-07-14T14:02:00.000Z',
      'clientPlatform', 'android',
      'clientVersion', '2.0.0',
      'requestId', 'privacy-update-suspended'
    ),
    'correlationId', '43000000-0000-4000-8000-000000002503',
    'expectedPrivacyVersion', 1,
    'friendshipRequests', 'nobody',
    'idempotencyKey', 'privacy.update.suspended',
    'presenceVisibility', 'hidden',
    'profileVisibility', 'private',
    'sessionInvites', 'nobody',
    'trustVisibility', 'private'
  ))$$,
  '%relationship_player_not_active%',
  'suspended player cannot mutate privacy'
);

select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002501', true);
create temporary table report_player as
select public.report_player_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T14:03:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'report-player-ab'
  ),
  'category', 'harassment',
  'correlationId', '43000000-0000-4000-8000-000000002504',
  'details', 'Repeated harassment after the match.',
  'expectedReportVersion', 0,
  'idempotencyKey', 'report.player.ab.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002502'
)) as receipt;
select is((select receipt ->> 'status' from report_player), 'submitted', 'player report returns submitted status');
select is((select (receipt ->> 'version')::integer from report_player), 1, 'player report aggregate begins at version one');
select ok((select receipt ->> 'reportId' is not null from report_player), 'player report returns canonical report id');

create temporary table report_player_replay as
select public.report_player_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T14:03:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'report-player-ab'
  ),
  'category', 'harassment',
  'correlationId', '43000000-0000-4000-8000-000000002504',
  'details', 'Repeated harassment after the match.',
  'expectedReportVersion', 0,
  'idempotencyKey', 'report.player.ab.0001',
  'targetPlayerId', '21000000-0000-4000-8000-000000002502'
)) as receipt;
select is((select (receipt ->> 'repeated')::boolean from report_player_replay), true, 'player report retry returns durable receipt');
select is((select receipt ->> 'reportId' from report_player_replay), (select receipt ->> 'reportId' from report_player), 'report replay preserves report identity');
select throws_like(
  $$select public.report_player_v2(jsonb_build_object(
    'audit', jsonb_build_object(
      'clientCreatedAt', '2026-07-14T14:04:00.000Z',
      'clientPlatform', 'ios',
      'clientVersion', '2.0.0',
      'requestId', 'report-self'
    ),
    'category', 'other',
    'correlationId', '43000000-0000-4000-8000-000000002505',
    'details', null,
    'expectedReportVersion', 0,
    'idempotencyKey', 'report.player.self.001',
    'targetPlayerId', '21000000-0000-4000-8000-000000002501'
  ))$$,
  '%report_self_forbidden%',
  'player cannot report self'
);

reset role;
select is(
  (select count(*)::integer from public.reports_v2 where id = (select (receipt ->> 'reportId')::uuid from report_player)),
  1,
  'report replay does not duplicate canonical report'
);
select is(
  (select count(*)::integer from public.report_evidence_v2 where report_id = (select (receipt ->> 'reportId')::uuid from report_player) and evidence_kind = 'client_context'),
  1,
  'player report stores immutable client context evidence'
);
select is(
  (select count(*)::integer from private.social_authority_metrics_v2 where metric_name = 'report_submission_completed' and actor_player_id = '21000000-0000-4000-8000-000000002501'),
  1,
  'report completion telemetry is recorded once'
);
select ok(
  not ((select payload -> 'payload' from private.outbox_events where event_type = 'report.submitted.v2' and aggregate_id = (select (receipt ->> 'reportId')::uuid from report_player)) ? 'reputationDelta'),
  'unverified report event has no reputation delta'
);

insert into public.conversations (
  id, state_v1, version_v1, last_sequence_v1, created_at
) values (
  '51000000-0000-4000-8000-000000002501',
  'open',
  1,
  1,
  now()
);
insert into public.conversation_participants_v1 (
  conversation_id, player_id, profile_id, legacy_profile_id
) values
  ('51000000-0000-4000-8000-000000002501', '21000000-0000-4000-8000-000000002501', '31000000-0000-4000-8000-000000002501', '01000000-0000-4000-8000-000000002501'),
  ('51000000-0000-4000-8000-000000002501', '21000000-0000-4000-8000-000000002502', '31000000-0000-4000-8000-000000002502', '01000000-0000-4000-8000-000000002502');
insert into public.messages (
  id,
  conversation_id,
  sender_id,
  body,
  schema_version_v1,
  sender_player_id_v1,
  client_message_id_v1,
  sequence_v1,
  content_kind_v1,
  content_v1,
  correlation_id_v1,
  request_fingerprint_v1,
  created_at
) values (
  '52000000-0000-4000-8000-000000002501',
  '51000000-0000-4000-8000-000000002501',
  '01000000-0000-4000-8000-000000002502',
  'Immutable report evidence body',
  1,
  '21000000-0000-4000-8000-000000002502',
  'report-message-client-0001',
  1,
  'text',
  jsonb_build_object('kind', 'text', 'text', 'Immutable report evidence body'),
  '53000000-0000-4000-8000-000000002501',
  private.request_fingerprint_v1(jsonb_build_object('message', 'report-evidence')),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002501', true);
create temporary table block_for_report as
select public.block_player_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T14:05:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'block-before-report'
  ),
  'correlationId', '43000000-0000-4000-8000-000000002506',
  'expectedRelationshipVersion', 0,
  'idempotencyKey', 'block.before.report.001',
  'reasonCode', 'report_evidence',
  'targetPlayerId', '21000000-0000-4000-8000-000000002502'
)) as receipt;
select is((select (receipt #>> '{relationship,capabilities,canViewConversation}')::boolean from block_for_report), false, 'block revokes public conversation access before reporting');

create temporary table report_message as
select public.report_message_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T14:06:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'report-message-ab'
  ),
  'category', 'threat',
  'conversationId', '51000000-0000-4000-8000-000000002501',
  'correlationId', '43000000-0000-4000-8000-000000002507',
  'details', 'Message retained for privileged moderation evidence.',
  'expectedReportVersion', 0,
  'idempotencyKey', 'report.message.ab.0001',
  'messageId', '52000000-0000-4000-8000-000000002501',
  'targetPlayerId', '21000000-0000-4000-8000-000000002502'
)) as receipt;
select is((select receipt ->> 'status' from report_message), 'submitted', 'historical member can report message after block');
select is((select (receipt ->> 'version')::integer from report_message), 1, 'message report aggregate begins at version one');

reset role;
select is(
  (select payload ->> 'messageId' from public.report_evidence_v2 where report_id = (select (receipt ->> 'reportId')::uuid from report_message) and evidence_kind = 'message_reference'),
  '52000000-0000-4000-8000-000000002501',
  'message report stores immutable message reference'
);
select ok(
  (select payload ? 'contentFingerprint' from public.report_evidence_v2 where report_id = (select (receipt ->> 'reportId')::uuid from report_message) and evidence_kind = 'message_reference'),
  'message reference stores content fingerprint'
);
select ok(
  not (select payload ? 'content' from public.report_evidence_v2 where report_id = (select (receipt ->> 'reportId')::uuid from report_message) and evidence_kind = 'message_reference'),
  'social report evidence does not copy message content'
);
select is(
  (select payload #>> '{payload,messageId}' from private.outbox_events where event_type = 'report.submitted.v2' and aggregate_id = (select (receipt ->> 'reportId')::uuid from report_message)),
  '52000000-0000-4000-8000-000000002501',
  'message report event references authoritative message'
);

select is(
  (select count(*)::integer from private.message_report_evidence_v1 where report_id = (select (receipt ->> 'reportId')::uuid from report_message)),
  1,
  'message report transaction captures one immutable snapshot'
);
select is(
  (select content_snapshot ->> 'text' from private.message_report_evidence_v1 where report_id = (select (receipt ->> 'reportId')::uuid from report_message)),
  'Immutable report evidence body',
  'immutable snapshot preserves exact authoritative text'
);
select is(
  (select client_message_id from private.message_report_evidence_v1 where report_id = (select (receipt ->> 'reportId')::uuid from report_message)),
  'report-message-client-0001',
  'immutable snapshot preserves canonical client message identity'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002501', true);
create temporary table captured_message_evidence as
select public.capture_message_report_evidence_v2(
  (select (receipt ->> 'reportId')::uuid from report_message)
) as evidence;
select ok(
  not (select evidence ? 'reportId' from captured_message_evidence),
  'evidence DTO does not duplicate the Social report receipt identity'
);
select is(
  (select evidence #>> '{message,content,text}' from captured_message_evidence),
  'Immutable report evidence body',
  'reporter receives the exact immutable content snapshot'
);
select ok(
  (select evidence #>> '{message,tombstonedAt}' from captured_message_evidence) is null,
  'evidence preserves a null tombstone timestamp'
);
create temporary table captured_message_evidence_replay as
select public.capture_message_report_evidence_v2(
  (select (receipt ->> 'reportId')::uuid from report_message)
) as evidence;
select is(
  (select evidence ->> 'evidenceId' from captured_message_evidence_replay),
  (select evidence ->> 'evidenceId' from captured_message_evidence),
  'evidence capture replay preserves evidence identity'
);

reset role;
select is(
  (select count(*)::integer from private.message_report_evidence_v1 where report_id = (select (receipt ->> 'reportId')::uuid from report_message)),
  1,
  'evidence capture replay does not duplicate snapshot rows'
);
select throws_like(
  $$update private.message_report_evidence_v1
    set content_snapshot = jsonb_build_object('tampered', true)
    where report_id = (select (receipt ->> 'reportId')::uuid from report_message)$$,
  '%report_evidence_immutable%',
  'immutable message snapshot cannot be updated'
);
select throws_like(
  $$delete from private.message_report_evidence_v1
    where report_id = (select (receipt ->> 'reportId')::uuid from report_message)$$,
  '%report_evidence_immutable%',
  'immutable message snapshot cannot be deleted'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002501', true);
create temporary table report_message_replay as
select public.report_message_v2(jsonb_build_object(
  'audit', jsonb_build_object(
    'clientCreatedAt', '2026-07-14T14:06:00.000Z',
    'clientPlatform', 'ios',
    'clientVersion', '2.0.0',
    'requestId', 'report-message-ab'
  ),
  'category', 'threat',
  'conversationId', '51000000-0000-4000-8000-000000002501',
  'correlationId', '43000000-0000-4000-8000-000000002507',
  'details', 'Message retained for privileged moderation evidence.',
  'expectedReportVersion', 0,
  'idempotencyKey', 'report.message.ab.0001',
  'messageId', '52000000-0000-4000-8000-000000002501',
  'targetPlayerId', '21000000-0000-4000-8000-000000002502'
)) as receipt;
select is((select (receipt ->> 'repeated')::boolean from report_message_replay), true, 'message report retry returns durable receipt');
select is((select receipt ->> 'reportId' from report_message_replay), (select receipt ->> 'reportId' from report_message), 'message report retry preserves report identity');
reset role;
select is(
  (select count(*)::integer from private.message_report_evidence_v1 where report_id = (select (receipt ->> 'reportId')::uuid from report_message)),
  1,
  'message report retry preserves one transactional snapshot'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002503', true);
select throws_like(
  $$select public.capture_message_report_evidence_v2(
    (select (receipt ->> 'reportId')::uuid from report_message)
  )$$,
  '%report_evidence_invalid%',
  'another account cannot read guessed report evidence'
);
select throws_like(
  $$select public.report_message_v2(jsonb_build_object(
    'audit', jsonb_build_object(
      'clientCreatedAt', '2026-07-14T14:07:00.000Z',
      'clientPlatform', 'android',
      'clientVersion', '2.0.0',
      'requestId', 'report-message-nonmember'
    ),
    'category', 'spam',
    'conversationId', '51000000-0000-4000-8000-000000002501',
    'correlationId', '43000000-0000-4000-8000-000000002508',
    'details', null,
    'expectedReportVersion', 0,
    'idempotencyKey', 'report.message.nonmember.1',
    'messageId', '52000000-0000-4000-8000-000000002501',
    'targetPlayerId', '21000000-0000-4000-8000-000000002502'
  ))$$,
  '%report_evidence_invalid%',
  'nonmember cannot capture conversation report evidence'
);

select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002501', true);
select throws_like(
  $$select public.report_message_v2(jsonb_build_object(
    'audit', jsonb_build_object(
      'clientCreatedAt', '2026-07-14T14:08:00.000Z',
      'clientPlatform', 'ios',
      'clientVersion', '2.0.0',
      'requestId', 'report-message-wrong-target'
    ),
    'category', 'spam',
    'conversationId', '51000000-0000-4000-8000-000000002501',
    'correlationId', '43000000-0000-4000-8000-000000002509',
    'details', null,
    'expectedReportVersion', 0,
    'idempotencyKey', 'report.message.wrong-target.1',
    'messageId', '52000000-0000-4000-8000-000000002501',
    'targetPlayerId', '21000000-0000-4000-8000-000000002503'
  ))$$,
  '%report_evidence_invalid%',
  'reported target must match authoritative message sender'
);

select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000002504', true);
select throws_like(
  $$select public.report_player_v2(jsonb_build_object(
    'audit', jsonb_build_object(
      'clientCreatedAt', '2026-07-14T14:09:00.000Z',
      'clientPlatform', 'android',
      'clientVersion', '2.0.0',
      'requestId', 'report-suspended-actor'
    ),
    'category', 'other',
    'correlationId', '43000000-0000-4000-8000-000000002510',
    'details', null,
    'expectedReportVersion', 0,
    'idempotencyKey', 'report.suspended.actor.1',
    'targetPlayerId', '21000000-0000-4000-8000-000000002501'
  ))$$,
  '%relationship_player_not_active%',
  'suspended actor cannot submit report'
);

select * from finish();
rollback;
