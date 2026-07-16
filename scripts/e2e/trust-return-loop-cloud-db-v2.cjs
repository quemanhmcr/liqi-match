#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SUPABASE_CLI = 'supabase@2.109.1';
const REQUIRED_MIGRATIONS = [
  '202607151200',
  '202607150130',
  '202607151210',
  '202607151220',
];
const suites = [
  'supabase/tests/database/return_loop_authority_v1.test.sql',
  'supabase/tests/database/notification_deep_link_resolution_v1.test.sql',
  'supabase/tests/database/core_v2_trust_outcome_foundation.test.sql',
  'supabase/tests/database/core_v2_completed_session_consumer.test.sql',
  'supabase/tests/database/core_v2_trust_commands.test.sql',
  'supabase/tests/database/core_v2_repeat_activity_commands.test.sql',
  'supabase/tests/database/core_v2_profile_trusted_stats_cutover.test.sql',
  'supabase/tests/database/core_v2_session_feedback_surface.test.sql',
  'supabase/tests/database/core_v2_activity_notification_delivery.test.sql',
  'supabase/tests/database/friendship_notification_projection_v2.test.sql',
];

function parseExpectedProjectRef(argv) {
  const index = argv.indexOf('--project-ref');
  if (index < 0 || !argv[index + 1]) {
    throw new Error(
      'Refusing to run cloud database tests without --project-ref <20-char test project ref>.',
    );
  }
  const value = argv[index + 1];
  if (!/^[a-z]{20}$/.test(value)) {
    throw new Error(`Invalid Supabase project ref: ${value}`);
  }
  return value;
}

function readLinkedProjectRef(repoRoot) {
  const candidates = [
    path.join(repoRoot, 'supabase', '.temp', 'project-ref'),
    path.join(repoRoot, '.supabase', 'project-ref'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf8').trim();
    }
  }
  throw new Error(
    'No linked Supabase project found. Run `supabase link` first.',
  );
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*[mK]/g, '');
}

function resolveNpxInvocation() {
  if (process.platform !== 'win32') {
    return { command: 'npx', prefix: [] };
  }

  const candidates = [
    process.env.npm_execpath
      ? path.join(path.dirname(process.env.npm_execpath), 'npx-cli.js')
      : null,
    path.join(
      path.dirname(process.execPath),
      'node_modules',
      'npm',
      'bin',
      'npx-cli.js',
    ),
  ].filter(Boolean);
  const npxCli = candidates.find((candidate) => fs.existsSync(candidate));
  if (!npxCli) {
    throw new Error('Unable to locate npx-cli.js on Windows. Run through npm.');
  }
  return { command: process.execPath, prefix: [npxCli] };
}

function runSupabase(
  repoRoot,
  args,
  { allowNonZero = false, print = true } = {},
) {
  const invocation = resolveNpxInvocation();
  const result = spawnSync(
    invocation.command,
    [...invocation.prefix, '--yes', SUPABASE_CLI, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (print) process.stdout.write(output);
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowNonZero) {
    if (!print) process.stderr.write(output);
    throw new Error(`Supabase CLI failed with exit code ${result.status}.`);
  }
  return stripAnsi(output);
}

function planFor(sqlPath) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const match = sql.match(/select\s+plan\((\d+)\);/i);
  if (!match) throw new Error(`Missing pgTAP plan() in ${sqlPath}.`);
  return Number(match[1]);
}

function assertMigrationParity(output) {
  const rows = [...output.matchAll(/^\s*`([^`]*)`\s*\|\s*`([^`]*)`/gm)]
    .map((match) => ({ local: match[1].trim(), remote: match[2].trim() }))
    .filter((row) => row.local || row.remote);
  if (rows.length === 0) {
    throw new Error('Could not parse linked migration history.');
  }
  const gaps = rows.filter((row) => !row.local || !row.remote);
  if (gaps.length > 0) {
    throw new Error(
      `Linked migration history is not aligned: ${JSON.stringify(gaps)}`,
    );
  }
  for (const requiredMigration of REQUIRED_MIGRATIONS) {
    if (!rows.some((row) => row.local === requiredMigration)) {
      throw new Error(
        `Required cloud repair migration ${requiredMigration} is missing.`,
      );
    }
  }
  const latest = rows.at(-1);
  if (latest.local !== latest.remote) {
    throw new Error(`Migration head mismatch: ${JSON.stringify(latest)}`);
  }
  return { count: rows.length, head: latest.local };
}

function assertTapSuccess(output, relativeSuite, plan) {
  if (/\bnot ok\b/i.test(output) || /Looks like you failed/i.test(output)) {
    throw new Error(`pgTAP assertion failed in ${relativeSuite}.`);
  }
  if (/Looks like you planned/i.test(output)) {
    throw new Error(`pgTAP plan mismatch in ${relativeSuite}.`);
  }
  const finalAssertion = new RegExp(`\\bok\\s+${plan}\\s+-`, 'i');
  if (!finalAssertion.test(output)) {
    throw new Error(
      `Did not observe final pgTAP assertion ${plan} in ${relativeSuite}.`,
    );
  }
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const expectedProjectRef = parseExpectedProjectRef(process.argv.slice(2));
  const linkedProjectRef = readLinkedProjectRef(repoRoot);
  if (linkedProjectRef !== expectedProjectRef) {
    throw new Error(
      `Linked project ${linkedProjectRef} does not match explicitly approved test project ${expectedProjectRef}.`,
    );
  }

  console.log(
    `TRUST_RETURN_LOOP_CLOUD_DB_TARGET project_ref=${linkedProjectRef} cli=${SUPABASE_CLI}`,
  );
  const migrationOutput = runSupabase(
    repoRoot,
    ['migration', 'list', '--linked'],
    { allowNonZero: true, print: false },
  );
  const migration = assertMigrationParity(migrationOutput);
  console.log(
    `CLOUD_DB_MIGRATION_PARITY_PASS migrations=${migration.count} head=${migration.head}`,
  );

  let assertionCount = 0;
  for (const relativeSuite of suites) {
    const absoluteSuite = path.join(repoRoot, relativeSuite);
    const plan = planFor(absoluteSuite);
    console.log(`\n===== ${relativeSuite} =====`);
    const output = runSupabase(repoRoot, [
      'db',
      'query',
      '--linked',
      '--file',
      relativeSuite,
    ]);
    assertTapSuccess(output, relativeSuite, plan);
    assertionCount += plan;
    console.log(
      `CLOUD_DB_SUITE_PASS suite=${path.basename(relativeSuite)} assertions=${plan}`,
    );
  }

  console.log(
    `ALL_TRUST_RETURN_LOOP_CLOUD_DB_PASS suites=${suites.length} assertions=${assertionCount} migrations=${migration.count} migration_head=${migration.head} project_ref=${linkedProjectRef}`,
  );
}

try {
  main();
} catch (error) {
  console.error(`TRUST_RETURN_LOOP_CLOUD_DB_FAIL ${error.message}`);
  process.exitCode = 1;
}
