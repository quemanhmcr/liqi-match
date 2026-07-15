const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const root = path.resolve(__dirname, '..', '..');
const sourcePath =
  'supabase/migrations/202607141450_repeat_play_session_source_v2.sql';
const consumerPath =
  'supabase/migrations/202607141451_repeat_play_session_consumer_v2.sql';
const testPath =
  'supabase/tests/database/repeat_play_session_consumer_v2.test.sql';
const contractPath = 'contracts/core-v2/party/play-session.ts';
const eventPath = 'contracts/core-v2/events/trust-events.ts';
const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
const consumer = fs.readFileSync(path.join(root, consumerPath), 'utf8');
const test = fs.readFileSync(path.join(root, testPath), 'utf8');
const contract = fs.readFileSync(path.join(root, contractPath), 'utf8');
const events = fs.readFileSync(path.join(root, eventPath), 'utf8');
const failures = [];
const expectInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

(async () => {
  for (const [relative, sql] of [
    [sourcePath, source],
    [consumerPath, consumer],
    [testPath, test],
  ]) {
    const parser = await PgQueryModule();
    const result = parser.parse(sql);
    expectInvariant(
      !result.error?.message,
      `${relative} PostgreSQL parse failed: ${result.error?.message}`,
    );
  }
  const functionPattern = /create or replace function[\s\S]*?\$\$;/gi;
  for (const functionSql of consumer.match(functionPattern) ?? []) {
    if (!/language\s+plpgsql/i.test(functionSql)) continue;
    const parser = await PgQueryModule();
    const result = parser.parsePlpgsql(functionSql);
    expectInvariant(
      !result.error?.message,
      `${consumerPath} PL/pgSQL parse failed: ${result.error?.message}`,
    );
  }

  expectInvariant(
    /add value if not exists 'repeat_play'/i.test(source),
    'Session source enum must add repeat_play in a separate committed migration',
  );
  expectInvariant(
    /source_repeat_request_id uuid[\s\S]*repeat_play_requests_v2/i.test(
      consumer,
    ),
    'Session must reference the canonical Repeat Play request aggregate',
  );
  expectInvariant(
    /create unique index play_sessions_v2_source_repeat_request_idx/i.test(
      consumer,
    ),
    'Repeat Play request source must be unique per Session',
  );
  expectInvariant(
    /repeat_play_session_consumptions_v2/i.test(consumer) &&
      /event_id uuid primary key/i.test(consumer) &&
      /request_id uuid not null unique/i.test(consumer),
    'Consumer must durably dedupe eventId and requestId',
  );
  expectInvariant(
    /unsupported_event_version/i.test(consumer) &&
      /event_replay_conflict/i.test(consumer),
    'Consumer must reject unsupported/replayed event contracts stably',
  );
  expectInvariant(
    (consumer.match(/assert_session_invite_eligible_v2/g) ?? []).length >= 2,
    'Consumer must check relationship/privacy in both directions',
  );
  expectInvariant(
    /assert_party_session_player_active_v2/i.test(consumer),
    'Consumer must recheck player lifecycle at write time',
  );
  expectInvariant(
    /'session\.created\.v2'[\s\S]*event_id_value/i.test(consumer) &&
      /'session\.invite_created\.v2'[\s\S]*created_event_id_value/i.test(
        consumer,
      ),
    'Session and invite events must preserve repeat-play causation',
  );
  expectInvariant(
    /for update skip locked/i.test(consumer) &&
      /status = 'failed'/i.test(consumer) &&
      /available_at = now\(\) \+ make_interval/i.test(consumer),
    'Worker must support concurrent retry/backoff reconciliation',
  );
  expectInvariant(
    /kind: z\.literal\('repeat_play'\)/i.test(contract) &&
      /RepeatPlayRequestIdSchema/i.test(contract),
    'Shared Session source contract must expose canonical repeat_play source',
  );
  expectInvariant(
    /RepeatPlayRequestedEventV2Schema/i.test(events) &&
      /RepeatPlayRequestIdSchema/i.test(events),
    'Repeat-play supplier event must brand the canonical request ID',
  );
  expectInvariant(
    /select plan\(12\)/i.test(test) &&
      (
        test.match(/select (?:has_column|has_table|has_function|ok)\s*\(/gi) ??
        []
      ).length === 12,
    'repeat-play Session pgTAP plan must cover twelve assertions',
  );

  if (failures.length) {
    console.error('Repeat Play Session consumer v2 check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
    'Repeat Play Session consumer v2 check passed with source, replay, policy, causation, worker and pgTAP coverage.',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
