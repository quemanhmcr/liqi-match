#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const migrationDirectory = path.join(root, 'supabase', 'migrations');
const failures = [];

function fail(message) {
  failures.push(message);
}

function normalizeSql(value) {
  return value
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const migrationFiles = fs
  .readdirSync(migrationDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();

if (!migrationFiles.length) fail('supabase/migrations contains no migrations');

const versionOwners = new Map();
const migrationContents = new Map();
for (const file of migrationFiles) {
  const match = /^(\d{12})_([a-z0-9_]+)\.sql$/.exec(file);
  if (!match) {
    fail(
      `${file}: migration filename must be <12-digit-version>_<snake_case>.sql`,
    );
    continue;
  }
  const [, version] = match;
  const existing = versionOwners.get(version);
  if (existing) {
    fail(
      `migration version ${version} is duplicated by ${existing} and ${file}`,
    );
  } else {
    versionOwners.set(version, file);
  }

  const raw = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
  migrationContents.set(file, { raw, normalized: normalizeSql(raw) });
  if (/<<<<<<<|=======|>>>>>>>/.test(raw)) {
    fail(`${file}: unresolved merge conflict marker`);
  }
}

const allNormalizedSql = [...migrationContents.values()]
  .map((entry) => entry.normalized)
  .join('\n');

if (
  /create table (?:if not exists )?private\.command_idempotency_v1\b/.test(
    allNormalizedSql,
  )
) {
  fail(
    'private.command_idempotency_v1 must not be created; private.command_receipts_v1 is the single command receipt authority',
  );
}

const receiptDefinitions = [...migrationContents.entries()].filter(
  ([, entry]) =>
    /create table (?:if not exists )?private\.command_receipts_v1\b/.test(
      entry.normalized,
    ),
);
if (receiptDefinitions.length !== 1) {
  fail(
    `private.command_receipts_v1 must be created exactly once; found ${receiptDefinitions.length}`,
  );
}
if (
  !/create or replace function private\.begin_command_v1\b/.test(
    allNormalizedSql,
  )
) {
  fail('private.begin_command_v1 is missing from migration history');
}
if (
  !/create or replace function private\.finish_command_v1\b/.test(
    allNormalizedSql,
  )
) {
  fail('private.finish_command_v1 is missing from migration history');
}

const forbiddenOverloads = [
  {
    label: 'activate_match_intent_v1(jsonb,text,integer)',
    create:
      /create or replace function public\.activate_match_intent_v1\s*\(\s*p_filters jsonb\s*,\s*p_idempotency_key text\s*,\s*p_expected_version integer(?:\s+default\s+null)?\s*\)/,
    drop: /drop function if exists public\.activate_match_intent_v1\s*\(\s*jsonb\s*,\s*text\s*,\s*integer\s*\)/,
  },
  {
    label:
      'record_player_decision_v1(uuid,relationship_decision_v1,text,uuid,integer,integer)',
    create:
      /create or replace function public\.record_player_decision_v1\s*\(\s*p_target_player_id uuid\s*,\s*p_decision public\.relationship_decision_v1\s*,\s*p_idempotency_key text\s*,\s*p_correlation_id uuid\s*,\s*p_expected_intent_version integer\s*,\s*p_expected_target_profile_version integer\s*\)/,
    drop: /drop function if exists public\.record_player_decision_v1\s*\(\s*uuid\s*,\s*public\.relationship_decision_v1\s*,\s*text\s*,\s*uuid\s*,\s*integer\s*,\s*integer\s*\)/,
  },
];

for (const overload of forbiddenOverloads) {
  let active = false;
  let lastCreate = null;
  let lastDrop = null;
  for (const file of migrationFiles) {
    const entry = migrationContents.get(file);
    if (!entry) continue;
    if (overload.create.test(entry.normalized)) {
      active = true;
      lastCreate = file;
    }
    if (overload.drop.test(entry.normalized)) {
      active = false;
      lastDrop = file;
    }
  }
  if (active) {
    fail(
      `${overload.label} remains active after ${lastCreate}; add a later forward-only drop migration`,
    );
  }
  if (lastCreate && (!lastDrop || lastDrop <= lastCreate)) {
    fail(
      `${overload.label} was introduced by ${lastCreate} but no later repair migration removes it`,
    );
  }
}

const canonicalSignatures = [
  {
    label: 'activate_match_intent_v1 bigint signature',
    pattern:
      /create or replace function public\.activate_match_intent_v1\s*\(\s*p_filters jsonb\s*,\s*p_idempotency_key text\s*,\s*p_expected_version bigint(?:\s+default\s+null)?\s*\)/,
  },
  {
    label: 'record_player_decision_v1 bigint signature',
    pattern:
      /create or replace function public\.record_player_decision_v1\s*\(\s*p_target_player_id uuid\s*,\s*p_decision public\.relationship_decision_v1\s*,\s*p_idempotency_key text\s*,\s*p_correlation_id uuid\s*,\s*p_expected_intent_version bigint\s*,\s*p_expected_target_profile_version bigint\s*\)/,
  },
];
for (const signature of canonicalSignatures) {
  if (!signature.pattern.test(allNormalizedSql)) {
    fail(`${signature.label} is missing from migration history`);
  }
}

const referencedMigrationPattern =
  /supabase\/migrations\/(\d{12}_[a-z0-9_]+\.sql)/g;
const referenceRoots = ['scripts', 'docs', '.github'];
for (const referenceRoot of referenceRoots) {
  const absoluteRoot = path.join(root, referenceRoot);
  if (!fs.existsSync(absoluteRoot)) continue;
  const stack = [absoluteRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (!/\.(?:cjs|mjs|js|ts|tsx|md|yml|yaml|json)$/.test(entry.name)) {
        continue;
      }
      const content = fs.readFileSync(absolute, 'utf8');
      for (const match of content.matchAll(referencedMigrationPattern)) {
        if (!migrationContents.has(match[1])) {
          fail(
            `${path.relative(root, absolute).replaceAll('\\', '/')}: references missing migration ${match[1]}`,
          );
        }
      }
    }
  }
}

const integratedVersions = [...versionOwners.keys()].filter((version) =>
  version.startsWith('20260714'),
);
const latestIntegratedVersion = integratedVersions.sort().at(-1);
if (!latestIntegratedVersion || latestIntegratedVersion < '202607140035') {
  fail(
    `integrated production chain must include migration 202607140035 or later; found ${latestIntegratedVersion ?? 'none'}`,
  );
}

if (failures.length) {
  console.error(
    `Migration history v1 check failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`,
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const nextVersion = String(Number(latestIntegratedVersion) + 1).padStart(
  12,
  '0',
);
console.log(
  `Migration history v1 check passed (${migrationFiles.length} files, latest ${latestIntegratedVersion}, next ${nextVersion}).`,
);
