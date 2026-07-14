#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/202607140056_social_privacy_report_authority_v2.sql',
  ),
  'utf8',
);
const test = fs.readFileSync(
  path.join(
    root,
    'supabase/tests/database/social_privacy_report_authority_v2.test.sql',
  ),
  'utf8',
);

for (const marker of [
  'public.get_player_privacy_v2',
  'public.update_player_privacy_v2',
  'public.report_player_v2',
  'public.report_message_v2',
  'private.player_privacy_snapshot_v2',
  'private.finish_report_submission_v2',
  'private.is_conversation_player_member_v1',
  'contentFingerprint',
  'report.submitted.v2',
  'privacy.updated.v2',
  'report_submission_completed',
]) {
  if (!migration.includes(marker)) {
    throw new Error(
      `Missing Core V2 privacy/report authority marker: ${marker}`,
    );
  }
}
for (const assertion of [
  'privacy update rejects stale aggregate version',
  'privacy replay does not duplicate event',
  'unverified report event has no reputation delta',
  'historical member can report message after block',
  'social report evidence does not copy message content',
  'nonmember cannot capture conversation report evidence',
]) {
  if (!test.includes(assertion)) {
    throw new Error(`Missing privacy/report pgTAP coverage: ${assertion}`);
  }
}
if (/content_v1[^\n]*jsonb_build_object\([^)]*payload/i.test(migration)) {
  throw new Error(
    'Social report evidence must not copy authoritative message content.',
  );
}
const plan = Number(test.match(/select plan\((\d+)\)/)?.[1] ?? 0);
const assertions = (
  test.match(/select (?:is|isnt|ok|throws_ok|throws_like)\(/g) ?? []
).length;
if (plan !== assertions) {
  throw new Error(
    `Privacy/report pgTAP plan ${plan} does not match ${assertions} assertions.`,
  );
}

(async () => {
  const parser = await new PgQueryModule();
  for (const [label, sql] of [
    ['migration', migration],
    ['pgTAP', test],
  ]) {
    const parsed = parser.parse(sql);
    if (parsed.error) {
      throw new Error(
        `${label}: ${parsed.error.message ?? String(parsed.error)}`,
      );
    }
  }
  console.log(
    `Core V2 privacy/report authority check passed (${assertions} pgTAP assertions).`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
