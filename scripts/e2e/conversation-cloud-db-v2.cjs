#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  E2E_DISPOSABLE_PROJECT,
  assertLinkedProjectTarget,
  requireExplicitProjectTarget,
} = require('../supabase/project-registry.cjs');

const SUPABASE_CLI = 'supabase@2.109.1';
const suites = [
  'supabase/tests/database/conversation_authority_v2.test.sql',
  'supabase/tests/database/conversation_bootstrap_dispatch_v1.test.sql',
  'supabase/tests/database/conversation_mobile_surface_v2.test.sql',
  'supabase/tests/database/conversation_reliability_v1.test.sql',
  'supabase/tests/database/conversation_report_evidence_v2.test.sql',
  'supabase/tests/database/conversation_runtime_v2.test.sql',
];

function parseExpectedProjectRef(argv) {
  return requireExplicitProjectTarget(argv, 'e2e-disposable').projectRef;
}

function readLinkedProjectRef(repoRoot) {
  return assertLinkedProjectTarget(repoRoot, 'e2e-disposable').projectRef;
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

function runSupabase(repoRoot, args) {
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
  process.stdout.write(output);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Supabase CLI failed with exit code ${result.status}.`);
  }
  return stripAnsi(output);
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
    `CONVERSATION_CLOUD_DB_TARGET target=${E2E_DISPOSABLE_PROJECT.target} project_name=${E2E_DISPOSABLE_PROJECT.projectName} project_ref=${linkedProjectRef} cli=${SUPABASE_CLI}`,
  );

  runSupabase(repoRoot, [
    'db',
    'query',
    '--linked',
    '--file',
    'scripts/e2e/sql/conversation-cloud-db-bootstrap-v2.sql',
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
    `ALL_CONVERSATION_CLOUD_DB_PASS suites=${suites.length} assertions=${assertionCount} project_ref=${linkedProjectRef}`,
  );
}

try {
  main();
} catch (error) {
  console.error(`CONVERSATION_CLOUD_DB_FAIL ${error.message}`);
  process.exitCode = 1;
}
