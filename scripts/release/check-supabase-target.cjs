#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  E2E_DISPOSABLE_PROJECT,
  STAGING_RUNTIME_PROJECT,
  assertProjectTarget,
  projectForRef,
  projectForTarget,
  projectRefFromUrl,
  readLinkedProject,
} = require('../supabase/project-registry.cjs');

const SCOPES = ['workspace-split', 'runtime', 'linked-cli', 'runtime-and-cli'];

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--status' || argument === '--self-test') {
      options[argument.slice(2)] = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const [name, inlineValue] = argument.slice(2).split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (!inlineValue) index += 1;
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`);
    }
    options[name] = value;
  }
  return options;
}

function readEnvValues(envFile) {
  const values = new Map();
  if (!fs.existsSync(envFile)) return values;
  for (const rawLine of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(name, value);
  }
  return values;
}

function readRuntimeContext(envFile) {
  const values = readEnvValues(envFile);
  const url =
    values.get('EXPO_PUBLIC_SUPABASE_URL') ?? values.get('SUPABASE_URL');
  let projectRef = null;
  if (url) projectRef = projectRefFromUrl(url, 'Runtime Supabase URL');
  return {
    expectedProjectRef:
      values.get('EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF') ?? null,
    mode: values.get('EXPO_PUBLIC_APPLICATION_RUNTIME_MODE') ?? null,
    projectRef,
    registeredProject: projectRef ? (projectForRef(projectRef) ?? null) : null,
    target: values.get('EXPO_PUBLIC_BACKEND_TARGET') ?? null,
  };
}

function evaluateRuntimeTarget(runtime, target) {
  const failures = [];
  const project = projectForTarget(target);
  if (!project.allowMobileRuntime) {
    failures.push(`${target} is not allowed as a mobile/API runtime.`);
  }
  if (runtime.mode !== 'api') {
    failures.push(`Runtime mode must be api for ${target}.`);
  }
  if (runtime.target !== target) {
    failures.push(
      `Runtime target ${runtime.target ?? '<missing>'} does not match ${target}.`,
    );
  }
  if (runtime.projectRef !== project.projectRef) {
    failures.push(
      `Runtime ref ${runtime.projectRef ?? '<missing>'} does not match ${project.projectRef}.`,
    );
  }
  if (runtime.expectedProjectRef !== project.projectRef) {
    failures.push(
      `Runtime expected ref ${runtime.expectedProjectRef ?? '<missing>'} does not match ${project.projectRef}.`,
    );
  }
  return failures;
}

function evaluateLinkedTarget(linked, target) {
  const failures = [];
  const project = projectForTarget(target);
  if (!linked) {
    failures.push('Supabase CLI is not linked to a project.');
    return failures;
  }
  if (linked.projectRef !== project.projectRef) {
    failures.push(
      `CLI ref ${linked.projectRef} does not match ${target} (${project.projectRef}).`,
    );
  }
  return failures;
}

function evaluateTargetContext({ linked, runtime, scope, target }) {
  const failures = [];
  if (!SCOPES.includes(scope)) {
    failures.push(`Scope must be one of: ${SCOPES.join(', ')}.`);
    return failures;
  }

  if (scope === 'workspace-split') {
    failures.push(...evaluateRuntimeTarget(runtime, 'staging-runtime'));
    failures.push(...evaluateLinkedTarget(linked, 'e2e-disposable'));
    return failures;
  }

  if (!target) {
    failures.push(`Scope ${scope} requires --target.`);
    return failures;
  }
  projectForTarget(target);

  if (scope === 'runtime' || scope === 'runtime-and-cli') {
    failures.push(...evaluateRuntimeTarget(runtime, target));
  }
  if (scope === 'linked-cli' || scope === 'runtime-and-cli') {
    failures.push(...evaluateLinkedTarget(linked, target));
  }
  return failures;
}

function describeRuntime(runtime) {
  const project = runtime.registeredProject;
  return [
    `target=${runtime.target ?? '(missing)'}`,
    `mode=${runtime.mode ?? '(missing)'}`,
    `project_name=${project?.projectName ?? '(unregistered)'}`,
    `project_ref=${runtime.projectRef ?? '(missing)'}`,
    `expected_ref=${runtime.expectedProjectRef ?? '(missing)'}`,
  ].join(' ');
}

function describeLinked(linked) {
  if (!linked)
    return 'project_name=(missing) project_ref=(missing) role=(missing)';
  return [
    `project_name=${linked.linkedProjectName ?? linked.registeredProject?.projectName ?? '(unknown)'}`,
    `project_ref=${linked.projectRef}`,
    `role=${linked.registeredProject?.target ?? 'unregistered'}`,
  ].join(' ');
}

function runSelfTest() {
  const stagingRuntime = {
    expectedProjectRef: STAGING_RUNTIME_PROJECT.projectRef,
    mode: 'api',
    projectRef: STAGING_RUNTIME_PROJECT.projectRef,
    registeredProject: STAGING_RUNTIME_PROJECT,
    target: 'staging-runtime',
  };
  const e2eLinked = {
    projectRef: E2E_DISPOSABLE_PROJECT.projectRef,
    registeredProject: E2E_DISPOSABLE_PROJECT,
  };
  const cases = [
    {
      expectedValid: true,
      input: {
        linked: e2eLinked,
        runtime: stagingRuntime,
        scope: 'workspace-split',
      },
    },
    {
      expectedValid: true,
      input: {
        linked: e2eLinked,
        runtime: stagingRuntime,
        scope: 'runtime',
        target: 'staging-runtime',
      },
    },
    {
      expectedValid: true,
      input: {
        linked: e2eLinked,
        runtime: stagingRuntime,
        scope: 'linked-cli',
        target: 'e2e-disposable',
      },
    },
    {
      expectedValid: false,
      input: {
        linked: e2eLinked,
        runtime: stagingRuntime,
        scope: 'runtime',
        target: 'e2e-disposable',
      },
    },
    {
      expectedValid: false,
      input: {
        linked: e2eLinked,
        runtime: stagingRuntime,
        scope: 'linked-cli',
        target: 'staging-runtime',
      },
    },
  ];
  for (const testCase of cases) {
    const failures = evaluateTargetContext(testCase.input);
    const valid = failures.length === 0;
    if (valid !== testCase.expectedValid) {
      throw new Error(
        `Target guard self-test expected valid=${testCase.expectedValid}, got ${valid}: ${failures.join('; ')}`,
      );
    }
  }
  assertProjectTarget(
    STAGING_RUNTIME_PROJECT.projectRef,
    'staging-runtime',
    'Self-test staging',
  );
  console.log(
    `Supabase target guard self-test passed (${cases.length} role cases).`,
  );
}

function main() {
  const root = path.resolve(__dirname, '../..');
  const options = parseArgs(process.argv.slice(2));
  if (options['self-test']) return runSelfTest();

  const envFile = path.resolve(root, options['env-file'] ?? '.env.local');
  const runtime = readRuntimeContext(envFile);
  let linked = null;
  try {
    linked = readLinkedProject(root, options['linked-ref-file']);
  } catch (error) {
    if (!options.status) throw error;
  }

  console.log(`Runtime: ${describeRuntime(runtime)}`);
  console.log(`CLI: ${describeLinked(linked)}`);

  const scope = options.scope ?? 'workspace-split';
  const target = options.target;
  const failures = evaluateTargetContext({ linked, runtime, scope, target });
  if (options.status) {
    console.log(
      `Workspace roles: ${failures.length === 0 ? 'valid' : 'invalid'} (${scope})`,
    );
    for (const failure of failures) console.log(`- ${failure}`);
    return;
  }

  if (failures.length) {
    console.error(`Target verification failed for scope ${scope}:`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
    `Target verification passed for scope ${scope}${target ? ` target=${target}` : ''}.`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Supabase target verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  evaluateTargetContext,
  readRuntimeContext,
};
