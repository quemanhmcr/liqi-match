#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/202607140057_social_privacy_report_authority_v2.sql',
  ),
  'utf8',
);
const evidenceMigration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/202607142100_message_report_evidence_snapshot_v2.sql',
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
for (const marker of [
  'private.capture_message_report_snapshot_v2',
  'reports_capture_message_snapshot_v2',
  'private.message_report_evidence_v1',
  'public.capture_message_report_evidence_v2',
  'report_evidence_immutable',
  'content_snapshot',
  'message_report_evidence_v1_immutable',
  "to_regclass('public.message_report_evidence_v2')",
  "to_jsonb(report_row) ->> 'conversation_v2_id'",
  'from public.conversation_members_v2',
]) {
  if (!evidenceMigration.includes(marker)) {
    throw new Error(`Missing immutable message evidence marker: ${marker}`);
  }
}
if (
  evidenceMigration.includes("'reportId', evidence_row") ||
  evidenceMigration.includes("'reportId', evidence.report_id")
) {
  throw new Error(
    'Conversation evidence DTO must not duplicate the Social report receipt ID.',
  );
}

for (const assertion of [
  'privacy update rejects stale aggregate version',
  'privacy replay does not duplicate event',
  'unverified report event has no reputation delta',
  'historical member can report message after block',
  'social report evidence does not copy message content',
  'nonmember cannot capture conversation report evidence',
  'message report transaction captures one immutable snapshot',
  'evidence capture replay does not duplicate snapshot rows',
  'immutable message snapshot cannot be updated',
  'another account cannot read guessed report evidence',
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
    ['evidence migration', evidenceMigration],
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
