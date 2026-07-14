#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/202607140055_friendship_command_authority_v2.sql',
  ),
  'utf8',
);
const test = fs.readFileSync(
  path.join(
    root,
    'supabase/tests/database/friendship_command_authority_v2.test.sql',
  ),
  'utf8',
);

for (const marker of [
  'public.request_friendship_v2',
  'public.accept_friendship_v2',
  'public.decline_friendship_v2',
  'public.cancel_friendship_request_v2',
  'public.remove_friendship_v2',
  'private.begin_social_command_v2',
  'private.begin_command_v1',
  'private.finish_command_v1',
  'private.enqueue_contract_event_v2',
  'private.write_social_command_audit_v2',
  'expectedRelationshipVersion',
  'expectedRequestVersion',
  'friendship.accepted.v2',
  'friendship.removed.v2',
]) {
  if (!migration.includes(marker)) {
    throw new Error(`Missing Core V2 friendship authority marker: ${marker}`);
  }
}

for (const requiredAssertion of [
  'reciprocal request does not create duplicate request rows',
  'same idempotency key returns durable replay',
  'accept rejects stale relationship version',
  'suspended player cannot create relationship mutation',
  'target privacy denies new friendship request',
]) {
  if (!test.includes(requiredAssertion)) {
    throw new Error(`Missing friendship pgTAP coverage: ${requiredAssertion}`);
  }
}

const plan = Number(test.match(/select plan\((\d+)\)/)?.[1] ?? 0);
const assertions = (
  test.match(/select (?:is|isnt|ok|throws_ok|throws_like)\(/g) ?? []
).length;
if (plan !== assertions) {
  throw new Error(
    `Friendship pgTAP plan ${plan} does not match ${assertions} assertions.`,
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
    `Core V2 friendship authority check passed (${assertions} pgTAP assertions).`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
