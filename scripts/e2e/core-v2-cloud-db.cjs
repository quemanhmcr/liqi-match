#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const {
  E2E_DISPOSABLE_PROJECT,
  assertLinkedProjectTarget,
  requireExplicitProjectTarget,
} = require('../supabase/project-registry.cjs');

const SUPABASE_CLI = 'supabase@2.109.1';
const DATABASE_TEST_DIRECTORY = 'supabase/tests/database';
const DEFAULT_CONCURRENCY = 1;
const EVIDENCE_SCHEMA = 'liqi.core-v2-cloud-db-evidence.v1';
const TRANSIENT_CONNECTION_PATTERN =
  /Failed to connect|failed to connect as temp role|connection.*(?:closed|reset|terminated)|unexpected EOF|telemetry\.json[\s\S]*EPERM|FileSystem\.rename[\s\S]*telemetry/i;

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function requiredProjectRef(argv) {
  return requireExplicitProjectTarget(argv, 'e2e-disposable').projectRef;
}

function integerOption(argv, name, fallback) {
  const raw = optionValue(argv, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function readLinkedProjectRef(repoRoot) {
  return assertLinkedProjectTarget(repoRoot, 'e2e-disposable').projectRef;
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*[mK]/g, '');
}

let cachedSupabaseInvocation;

function exactCachedSupabaseBinary() {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return null;
  const npxRoot = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
  if (!fs.existsSync(npxRoot)) return null;
  for (const entry of fs.readdirSync(npxRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageRoot = path.join(npxRoot, entry.name, 'node_modules');
    const packageJson = path.join(packageRoot, 'supabase', 'package.json');
    const executable = path.join(
      packageRoot,
      '@supabase',
      'cli-windows-x64',
      'bin',
      'supabase.exe',
    );
    if (!fs.existsSync(packageJson) || !fs.existsSync(executable)) continue;
    const packageVersion = JSON.parse(
      fs.readFileSync(packageJson, 'utf8'),
    ).version;
    if (packageVersion !== SUPABASE_CLI.replace('supabase@', '')) continue;
    const versionCheck = spawnSync(executable, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (
      versionCheck.status === 0 &&
      versionCheck.stdout.trim() === packageVersion
    ) {
      return executable;
    }
  }
  return null;
}

function resolveSupabaseInvocation() {
  if (cachedSupabaseInvocation) return cachedSupabaseInvocation;
  const explicit = process.env.SUPABASE_CLI_PATH;
  if (explicit) {
    if (!fs.existsSync(explicit)) {
      throw new Error(`SUPABASE_CLI_PATH does not exist: ${explicit}`);
    }
    cachedSupabaseInvocation = {
      command: explicit,
      mode: 'explicit',
      prefix: [],
    };
    return cachedSupabaseInvocation;
  }

  const directBinary = exactCachedSupabaseBinary();
  if (directBinary) {
    cachedSupabaseInvocation = {
      command: directBinary,
      mode: 'direct_cache',
      prefix: [],
    };
    return cachedSupabaseInvocation;
  }

  if (process.platform !== 'win32') {
    cachedSupabaseInvocation = {
      command: 'npx',
      mode: 'npx_fallback',
      prefix: ['--yes', SUPABASE_CLI],
    };
    return cachedSupabaseInvocation;
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
    throw new Error('Unable to locate Supabase CLI 2.109.1 or npx fallback.');
  }
  cachedSupabaseInvocation = {
    command: process.execPath,
    mode: 'npx_fallback',
    prefix: [npxCli, '--yes', SUPABASE_CLI],
  };
  return cachedSupabaseInvocation;
}

function invokeSupabase(repoRoot, args) {
  const invocation = resolveSupabaseInvocation();
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, [...invocation.prefix, ...args], {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => {
      resolve({ output: stripAnsi(`${stdout}${stderr}`), status });
    });
  });
}

async function runSuite(repoRoot, relativeSuite) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await invokeSupabase(repoRoot, [
      'db',
      'query',
      '--linked',
      '--file',
      relativeSuite,
    ]);
    if (result.status === 0) return result.output;
    if (attempt < 3 && TRANSIENT_CONNECTION_PATTERN.test(result.output)) {
      console.log(
        `CLOUD_DB_TRANSIENT_RETRY suite=${path.basename(relativeSuite)} attempt=${attempt + 1}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }
    process.stderr.write(result.output);
    throw new Error(
      `Supabase CLI failed for ${relativeSuite} with exit code ${result.status}.`,
    );
  }
  throw new Error(`Unreachable retry state for ${relativeSuite}.`);
}

function planFor(absoluteSuite) {
  const sql = fs.readFileSync(absoluteSuite, 'utf8');
  const match = sql.match(/select\s+plan\((\d+)\)/i);
  if (!match) throw new Error(`Missing pgTAP plan() in ${absoluteSuite}.`);
  return Number(match[1]);
}

function listSuites(repoRoot) {
  const directory = path.join(repoRoot, DATABASE_TEST_DIRECTORY);
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.sql'))
    .map((entry) => path.posix.join(DATABASE_TEST_DIRECTORY, entry.name))
    .sort();
}

function expectedEvidence(repoRoot) {
  const suites = listSuites(repoRoot);
  const results = suites.map((suite) => ({
    assertions: planFor(path.join(repoRoot, suite)),
    suite,
  }));
  return {
    assertions: results.reduce((total, result) => total + result.assertions, 0),
    results,
    suites: results.length,
  };
}

function assertSuitePassed(relativeSuite, plan, output) {
  if (/\bnot ok\b/i.test(output)) {
    throw new Error(`pgTAP assertion failed in ${relativeSuite}.`);
  }
  if (/Looks like you (?:planned|failed)/i.test(output)) {
    throw new Error(`pgTAP summary reported failure in ${relativeSuite}.`);
  }
  const finalAssertion = new RegExp(`\\bok\\s+${plan}\\s+-`, 'i');
  if (!finalAssertion.test(output)) {
    throw new Error(
      `Did not observe final pgTAP assertion ${plan} in ${relativeSuite}.`,
    );
  }
}

async function runPool(items, workerCount, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  async function consume() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(workerCount, items.length) }, consume),
  );
  return results;
}

function writeEvidence(filename, evidence) {
  const absolutePath = path.resolve(filename);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(
    absolutePath,
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8',
  );
  console.log(`CLOUD_DB_EVIDENCE_WRITTEN path=${absolutePath}`);
}

function aggregateEvidence(repoRoot, directory, expectedProjectRef) {
  const expected = expectedEvidence(repoRoot);
  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name))
    .sort();
  if (!files.length)
    throw new Error(`No evidence JSON files found in ${directory}.`);

  const observed = new Map();
  let shardCount;
  const shardIndexes = new Set();
  for (const file of files) {
    const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (evidence.schema !== EVIDENCE_SCHEMA) {
      throw new Error(`${file} uses unsupported evidence schema.`);
    }
    if (evidence.projectRef !== expectedProjectRef) {
      throw new Error(
        `${file} targets unexpected project ${evidence.projectRef}.`,
      );
    }
    if (
      evidence.totalSuites !== expected.suites ||
      evidence.totalAssertions !== expected.assertions
    ) {
      throw new Error(
        `${file} was generated from a different database test matrix.`,
      );
    }
    shardCount ??= evidence.shardCount;
    if (evidence.shardCount !== shardCount) {
      throw new Error('Evidence files disagree on shardCount.');
    }
    if (shardIndexes.has(evidence.shardIndex)) {
      throw new Error(`Duplicate shard evidence ${evidence.shardIndex}.`);
    }
    shardIndexes.add(evidence.shardIndex);
    for (const result of evidence.results) {
      if (!result.passed)
        throw new Error(`${result.suite} is not marked passed.`);
      if (observed.has(result.suite)) {
        throw new Error(`Duplicate suite evidence for ${result.suite}.`);
      }
      observed.set(result.suite, result.assertions);
    }
  }

  if (shardCount === undefined || shardIndexes.size !== shardCount) {
    throw new Error(
      `Expected ${shardCount ?? 'unknown'} shard files but found ${shardIndexes.size}.`,
    );
  }
  for (const expectedResult of expected.results) {
    if (observed.get(expectedResult.suite) !== expectedResult.assertions) {
      throw new Error(`Missing or stale evidence for ${expectedResult.suite}.`);
    }
  }
  if (observed.size !== expected.suites) {
    throw new Error(
      `Expected ${expected.suites} suites but observed ${observed.size}.`,
    );
  }

  console.log(
    `ALL_CORE_V2_CLOUD_DB_PASS suites=${expected.suites} assertions=${expected.assertions} project_ref=${expectedProjectRef}`,
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const repoRoot = path.resolve(__dirname, '..', '..');
  const expectedProjectRef = requiredProjectRef(argv);
  const aggregateDirectory = optionValue(argv, '--aggregate-evidence');
  if (aggregateDirectory) {
    aggregateEvidence(
      repoRoot,
      path.resolve(aggregateDirectory),
      expectedProjectRef,
    );
    return;
  }

  const linkedProjectRef = readLinkedProjectRef(repoRoot);
  if (linkedProjectRef !== expectedProjectRef) {
    throw new Error(
      `Linked project ${linkedProjectRef} does not match explicitly approved test project ${expectedProjectRef}.`,
    );
  }

  const expected = expectedEvidence(repoRoot);
  const shardCount = integerOption(argv, '--shard-count', 1);
  const shardIndex = integerOption(argv, '--shard-index', 0);
  const concurrency = integerOption(argv, '--concurrency', DEFAULT_CONCURRENCY);
  if (shardCount < 1) throw new Error('--shard-count must be at least 1.');
  if (shardIndex >= shardCount) {
    throw new Error('--shard-index must be less than --shard-count.');
  }
  if (concurrency < 1) throw new Error('--concurrency must be at least 1.');

  const selected = expected.results.filter(
    (_result, index) => index % shardCount === shardIndex,
  );
  const cliInvocation = resolveSupabaseInvocation();
  const effectiveConcurrency = process.platform === 'win32' ? 1 : concurrency;
  if (effectiveConcurrency !== concurrency) {
    console.log(
      `CLOUD_DB_CONCURRENCY_CLAMP requested=${concurrency} effective=${effectiveConcurrency} reason=windows_supabase_telemetry_lock`,
    );
  }
  console.log(
    `CORE_V2_CLOUD_DB_TARGET target=${E2E_DISPOSABLE_PROJECT.target} project_name=${E2E_DISPOSABLE_PROJECT.projectName} project_ref=${linkedProjectRef} cli=${SUPABASE_CLI} cli_mode=${cliInvocation.mode} shard=${shardIndex + 1}/${shardCount} suites=${selected.length} concurrency=${effectiveConcurrency}`,
  );

  const results = await runPool(
    selected,
    effectiveConcurrency,
    async (entry) => {
      const output = await runSuite(repoRoot, entry.suite);
      assertSuitePassed(entry.suite, entry.assertions, output);
      console.log(
        `CLOUD_DB_SUITE_PASS suite=${path.basename(entry.suite)} assertions=${entry.assertions}`,
      );
      return { ...entry, passed: true };
    },
  );

  const evidence = {
    generatedAt: new Date().toISOString(),
    projectRef: linkedProjectRef,
    results,
    schema: EVIDENCE_SCHEMA,
    shardCount,
    shardIndex,
    totalAssertions: expected.assertions,
    totalSuites: expected.suites,
  };
  const evidenceOut = optionValue(argv, '--evidence-out');
  if (evidenceOut) writeEvidence(evidenceOut, evidence);

  console.log(
    `ALL_CORE_V2_CLOUD_DB_SHARD_PASS shard=${shardIndex + 1}/${shardCount} suites=${results.length} assertions=${results.reduce((total, result) => total + result.assertions, 0)} project_ref=${linkedProjectRef}`,
  );
}

main().catch((error) => {
  console.error(`CORE_V2_CLOUD_DB_FAIL ${error.message}`);
  process.exitCode = 1;
});
