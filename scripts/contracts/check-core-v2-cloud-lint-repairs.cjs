#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PgQueryModule = require('pg-query-emscripten').default;

const root = path.resolve(__dirname, '..', '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/202607151220_core_v2_cloud_lint_runtime_repairs_v2.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');

for (const marker of [
  'private.advance_match_set_after_join_v2',
  'public.update_match_set_v2',
  'public.reopen_match_set_v2',
  'public.provision_direct_conversation_v2',
  "'full'::public.match_set_state_v2",
  "'open'::public.match_set_state_v2",
  'source_type_value public.conversation_source_type_v2',
  'sources.source_type = source_type_value',
]) {
  if (!migration.includes(marker)) {
    throw new Error(`Missing Core V2 cloud lint repair marker: ${marker}`);
  }
}

if (/\bsource_type\s+public\.conversation_source_type_v2/.test(migration)) {
  throw new Error('Ambiguous Conversation source_type variable remains.');
}
if (/sources\.source_type\s*=\s*source_type\b/.test(migration)) {
  throw new Error('Conversation source comparison remains ambiguous.');
}
const enumCases = migration.match(
  /state\s*=\s*case[\s\S]*?'full'::public\.match_set_state_v2[\s\S]*?'open'::public\.match_set_state_v2[\s\S]*?end,/g,
);
if ((enumCases ?? []).length !== 3) {
  throw new Error(
    `Expected three explicitly typed Match Set state CASE expressions; found ${(enumCases ?? []).length}.`,
  );
}

(async () => {
  const parser = await new PgQueryModule();
  const parsed = parser.parse(migration);
  if (parsed.error) throw new Error(parsed.error.message);
  console.log(
    `Core V2 cloud lint runtime repair check passed (${parsed.parse_tree?.stmts?.length ?? 0} statements).`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
