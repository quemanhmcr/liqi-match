#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  E2E_DISPOSABLE_PROJECT,
  PROJECT_REF_PATTERN,
  STAGING_RUNTIME_PROJECT,
} = require('../supabase/project-registry.cjs');

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const REQUIRED_CHECKS = [
  'migrationParity',
  'databaseAuthority',
  'rpcPrivileges',
  'rolloutFlags',
  'authenticatedApiSmoke',
  'realtimeTwoDeviceSmoke',
  'workersHealthy',
  'rollbackDrill',
];

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

function inspectSecrets(value, trail, failures) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const nextTrail = trail ? `${trail}.${key}` : key;
    if (
      /(?:secret|password|service.?role|access.?token|refresh.?token|anon.?key|publishable.?key)/i.test(
        key,
      )
    ) {
      failures.push(
        `${nextTrail}: evidence files must reference secret-store locations, never contain credentials`,
      );
    }
    inspectSecrets(child, nextTrail, failures);
  }
}

function validateTargetIdentity(evidence, failures) {
  const targets = evidence?.targets ?? {};
  const expectedRef = targets.expectedProjectRef;
  assert(
    PROJECT_REF_PATTERN.test(expectedRef ?? ''),
    'targets.expectedProjectRef is invalid',
    failures,
  );
  assert(
    Boolean(targets.projectName?.trim()),
    'targets.projectName is required',
    failures,
  );
  assert(
    ['staging-runtime', 'production-runtime'].includes(targets.targetRole),
    'targets.targetRole must be staging-runtime or production-runtime',
    failures,
  );

  for (const field of [
    'runtimeProjectRef',
    'remoteOperationProjectRef',
    'evidenceProjectRef',
  ]) {
    const value = targets[field];
    assert(
      PROJECT_REF_PATTERN.test(value ?? ''),
      `targets.${field} is invalid`,
      failures,
    );
    assert(
      !expectedRef || value === expectedRef,
      `targets.${field} must equal targets.expectedProjectRef`,
      failures,
    );
  }
  assert(
    targets.workspaceDefaultCliProjectRef === E2E_DISPOSABLE_PROJECT.projectRef,
    `targets.workspaceDefaultCliProjectRef must remain the disposable E2E project ${E2E_DISPOSABLE_PROJECT.projectRef}`,
    failures,
  );

  if (evidence?.environment === 'staging') {
    assert(
      targets.targetRole === 'staging-runtime',
      'staging evidence requires targets.targetRole=staging-runtime',
      failures,
    );
    assert(
      targets.projectName === STAGING_RUNTIME_PROJECT.projectName,
      `staging evidence projectName must be ${STAGING_RUNTIME_PROJECT.projectName}`,
      failures,
    );
    assert(
      expectedRef === STAGING_RUNTIME_PROJECT.projectRef,
      `staging evidence must target ${STAGING_RUNTIME_PROJECT.projectRef}`,
      failures,
    );
  }

  if (evidence?.environment === 'production') {
    assert(
      targets.targetRole === 'production-runtime',
      'production evidence requires targets.targetRole=production-runtime',
      failures,
    );
    assert(
      expectedRef !== STAGING_RUNTIME_PROJECT.projectRef &&
        expectedRef !== E2E_DISPOSABLE_PROJECT.projectRef,
      'production evidence cannot reuse staging or disposable E2E',
      failures,
    );
  }
}

function validateEvidence(
  evidence,
  { maxAgeHours = 24, now = new Date() } = {},
) {
  const failures = [];
  assert(evidence?.schemaVersion === 2, 'schemaVersion must equal 2', failures);
  assert(
    ['staging', 'production'].includes(evidence?.environment),
    'environment must be staging or production',
    failures,
  );
  const capturedAt = new Date(evidence?.capturedAt ?? 'invalid');
  assert(
    !Number.isNaN(capturedAt.valueOf()),
    'capturedAt must be an ISO timestamp',
    failures,
  );
  if (!Number.isNaN(capturedAt.valueOf())) {
    const age = now.valueOf() - capturedAt.valueOf();
    assert(age >= 0, 'capturedAt cannot be in the future', failures);
    assert(
      age <= maxAgeHours * 60 * 60 * 1000,
      `evidence is older than ${maxAgeHours} hours`,
      failures,
    );
  }

  assert(
    SHA_PATTERN.test(evidence?.source?.gitHead ?? ''),
    'source.gitHead must be a full Git SHA',
    failures,
  );
  assert(
    Boolean(evidence?.source?.branch?.trim()),
    'source.branch is required',
    failures,
  );
  assert(
    Boolean(evidence?.database?.migrationHead?.trim()),
    'database.migrationHead is required',
    failures,
  );

  validateTargetIdentity(evidence, failures);

  for (const checkName of REQUIRED_CHECKS) {
    const check = evidence?.checks?.[checkName];
    assert(
      check?.status === 'passed',
      `checks.${checkName}.status must be passed`,
      failures,
    );
    assert(
      Boolean(check?.artifact?.trim()),
      `checks.${checkName}.artifact is required`,
      failures,
    );
    assert(
      Boolean(check?.observedAt),
      `checks.${checkName}.observedAt is required`,
      failures,
    );
    if (check?.observedAt) {
      const observedAt = new Date(check.observedAt);
      assert(
        !Number.isNaN(observedAt.valueOf()),
        `checks.${checkName}.observedAt must be an ISO timestamp`,
        failures,
      );
      if (
        !Number.isNaN(observedAt.valueOf()) &&
        !Number.isNaN(capturedAt.valueOf())
      ) {
        assert(
          observedAt <= capturedAt,
          `checks.${checkName}.observedAt cannot be after capturedAt`,
          failures,
        );
      }
    }
  }
  assert(
    (evidence?.checks?.authenticatedApiSmoke?.actors ?? 0) >= 2,
    'authenticatedApiSmoke must use at least two actors',
    failures,
  );
  assert(
    (evidence?.checks?.realtimeTwoDeviceSmoke?.devices ?? 0) >= 2,
    'realtimeTwoDeviceSmoke must use at least two devices',
    failures,
  );
  assert(
    (evidence?.checks?.databaseAuthority?.suites ?? 0) > 0,
    'databaseAuthority.suites must be positive',
    failures,
  );
  assert(
    (evidence?.checks?.databaseAuthority?.assertions ?? 0) > 0,
    'databaseAuthority.assertions must be positive',
    failures,
  );
  assert(
    evidence?.approval?.status === 'approved',
    'approval.status must be approved',
    failures,
  );
  assert(
    Boolean(evidence?.approval?.approver?.trim()),
    'approval.approver is required',
    failures,
  );
  assert(
    Boolean(evidence?.approval?.changeReference?.trim()),
    'approval.changeReference is required',
    failures,
  );
  inspectSecrets(evidence, '', failures);
  return failures;
}

function validFixture(now) {
  const observedAt = new Date(now.valueOf() - 60_000).toISOString();
  const check = {
    artifact: 'artifact://release/check',
    observedAt,
    status: 'passed',
  };
  return {
    approval: {
      approver: 'release-owner',
      changeReference: 'CHG-1234',
      status: 'approved',
    },
    capturedAt: now.toISOString(),
    checks: {
      authenticatedApiSmoke: { ...check, actors: 2 },
      databaseAuthority: { ...check, assertions: 1221, suites: 50 },
      migrationParity: check,
      realtimeTwoDeviceSmoke: { ...check, devices: 2 },
      rollbackDrill: check,
      rolloutFlags: check,
      rpcPrivileges: check,
      workersHealthy: check,
    },
    database: { migrationHead: '202607171200_example.sql' },
    environment: 'staging',
    schemaVersion: 2,
    source: { branch: 'release/example', gitHead: 'a'.repeat(40) },
    targets: {
      evidenceProjectRef: STAGING_RUNTIME_PROJECT.projectRef,
      expectedProjectRef: STAGING_RUNTIME_PROJECT.projectRef,
      projectName: STAGING_RUNTIME_PROJECT.projectName,
      remoteOperationProjectRef: STAGING_RUNTIME_PROJECT.projectRef,
      runtimeProjectRef: STAGING_RUNTIME_PROJECT.projectRef,
      targetRole: 'staging-runtime',
      workspaceDefaultCliProjectRef: E2E_DISPOSABLE_PROJECT.projectRef,
    },
  };
}

function runSelfTest() {
  const now = new Date('2026-07-18T10:00:00.000Z');
  const valid = validFixture(now);
  if (validateEvidence(valid, { now }).length) {
    throw new Error('valid fixture was rejected');
  }
  const wrongRemoteOperation = structuredClone(valid);
  wrongRemoteOperation.targets.remoteOperationProjectRef =
    E2E_DISPOSABLE_PROJECT.projectRef;
  if (
    !validateEvidence(wrongRemoteOperation, { now }).some((item) =>
      item.includes('remoteOperationProjectRef'),
    )
  ) {
    throw new Error('staging remote-operation mismatch was not rejected');
  }
  const e2eRuntime = structuredClone(valid);
  e2eRuntime.targets.runtimeProjectRef = E2E_DISPOSABLE_PROJECT.projectRef;
  if (
    !validateEvidence(e2eRuntime, { now }).some((item) =>
      item.includes('runtimeProjectRef'),
    )
  ) {
    throw new Error('E2E runtime evidence was not rejected');
  }
  const secretBearing = structuredClone(valid);
  secretBearing.serviceRoleKey = 'forbidden';
  if (
    !validateEvidence(secretBearing, { now }).some((item) =>
      item.includes('credentials'),
    )
  ) {
    throw new Error('credential-bearing evidence was not rejected');
  }
  console.log(
    'Release evidence validator self-test passed (staging split, cross-role rejection, secret cases).',
  );
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--self-test') return { selfTest: true };
    if (!argument.startsWith('--')) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const [name, inlineValue] = argument.slice(2).split('=', 2);
    const value = inlineValue ?? argv[++index];
    if (!value) throw new Error(`Missing value for --${name}`);
    options[name] = value;
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) return runSelfTest();
  if (!options.file) throw new Error('--file is required');
  const file = path.resolve(process.cwd(), options.file);
  const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
  const maxAgeHours = Number.parseInt(options['max-age-hours'] ?? '24', 10);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours < 1) {
    throw new Error('--max-age-hours must be a positive integer');
  }
  const failures = validateEvidence(evidence, { maxAgeHours });
  if (failures.length) {
    console.error(
      `Release evidence validation failed for ${path.relative(process.cwd(), file)}:`,
    );
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
    `Release evidence passed for ${evidence.environment} target=${evidence.targets.targetRole} project=${evidence.targets.projectName} ref=${evidence.targets.expectedProjectRef}.`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Release evidence validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { validateEvidence };
