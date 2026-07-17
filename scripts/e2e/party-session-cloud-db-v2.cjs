#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SUPABASE_CLI = 'supabase@2.109.1';
const APPROVED_PROJECT_REF = 'ibprkyemsuktfrdpxvza';
const suites = [
  'supabase/tests/database/match_set_authority_v1.test.sql',
  'supabase/tests/database/match_set_dashboard_identity_v2.test.sql',
  'supabase/tests/database/repeat_play_session_consumer_v2.test.sql',
  'supabase/tests/database/core_v2_completed_session_consumer.test.sql',
  'supabase/tests/database/session_social_safety_consumer_v2.test.sql',
  'supabase/tests/database/party_session_release_readiness_v2.test.sql',
  'supabase/tests/database/party_session_runtime_v2.test.sql',
  'supabase/tests/database/decline_session_invite_v2.test.sql',
  'supabase/tests/database/session_conversation_dispatch_runtime_v2.test.sql',
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
  if (value !== APPROVED_PROJECT_REF) {
    throw new Error(
      `Refusing non-E2E project ${value}; approved project is ${APPROVED_PROJECT_REF}.`,
    );
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
  return value.replace(/\u001b\[[0-9;]*m/g, '');
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

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function runSupabase(repoRoot, args) {
  const invocation = resolveNpxInvocation();
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
    process.stdout.write(output);
    if (result.error) {
      throw result.error;
    }
    if (result.status === 0) {
      return stripAnsi(output);
    }

    const normalized = stripAnsi(output);
    const transientConnectionFailure =
      /failed to connect|failed to connect as temp role|unexpected eof|connection reset|connection refused/i.test(
        normalized,
      );
    if (!transientConnectionFailure || attempt === maxAttempts) {
      throw new Error(`Supabase CLI failed with exit code ${result.status}.`);
    }

    console.warn(
      `CLOUD_DB_TRANSIENT_RETRY attempt=${attempt + 1}/${maxAttempts}`,
    );
    sleep(attempt * 1_000);
  }
  throw new Error('Supabase CLI retry loop ended unexpectedly.');
}

function planFor(sqlPath) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const match = sql.match(/select\s+plan\((\d+)\);/i);
  if (!match) {
    throw new Error(`Missing pgTAP plan() in ${sqlPath}.`);
  }
  return Number(match[1]);
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
    `PARTY_SESSION_CLOUD_DB_TARGET project_ref=${linkedProjectRef} cli=${SUPABASE_CLI}`,
  );

  runSupabase(repoRoot, [
    'db',
    'query',
    '--linked',
    '--file',
    'scripts/e2e/sql/party-session-cloud-db-bootstrap-v2.sql',
  ]);

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

    if (/\bnot ok\b/i.test(output)) {
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

    assertionCount += plan;
    console.log(
      `CLOUD_DB_SUITE_PASS suite=${path.basename(relativeSuite)} assertions=${plan}`,
    );
  }

  console.log(
    `ALL_PARTY_SESSION_CLOUD_DB_PASS suites=${suites.length} assertions=${assertionCount} project_ref=${linkedProjectRef}`,
  );
}

try {
  main();
} catch (error) {
  console.error(`PARTY_SESSION_CLOUD_DB_FAIL ${error.message}`);
  process.exitCode = 1;
}
