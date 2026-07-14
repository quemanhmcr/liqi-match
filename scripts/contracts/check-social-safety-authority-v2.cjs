#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/202607140056_social_safety_command_authority_v2.sql',
  ),
  'utf8',
);
const test = fs.readFileSync(
  path.join(
    root,
    'supabase/tests/database/social_safety_command_authority_v2.test.sql',
  ),
  'utf8',
);

for (const marker of [
  'public.block_player_v2',
  'public.unblock_player_v2',
  'public.mute_player_v2',
  'public.unmute_player_v2',
  'player_blocks_v2',
  'player_mutes_v2',
  'legacy_block_dual_write',
  'legacy_block_mapping_missing',
  'friendshipRestored',
  'player.blocked.v2',
  'player.unblocked.v2',
  'player.muted.v2',
  'player.unmuted.v2',
]) {
  if (!migration.includes(marker)) {
    throw new Error(`Missing Core V2 safety authority marker: ${marker}`);
  }
}
for (const assertion of [
  'block revokes message capability',
  'block revokes session invite capability',
  'unblock never restores friendship automatically',
  'legacy block is dual-written during shadow cutover',
  'block terminates pending request lifecycle',
  'suspended actor cannot create safety mutation',
]) {
  if (!test.includes(assertion)) {
    throw new Error(`Missing safety pgTAP coverage: ${assertion}`);
  }
}
const plan = Number(test.match(/select plan\((\d+)\)/)?.[1] ?? 0);
const assertions = (
  test.match(/select (?:is|isnt|ok|throws_ok|throws_like)\(/g) ?? []
).length;
if (plan !== assertions) {
  throw new Error(
    `Safety pgTAP plan ${plan} does not match ${assertions} assertions.`,
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
    `Core V2 social safety authority check passed (${assertions} pgTAP assertions).`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
