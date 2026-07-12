const { availableParallelism, cpus } = require('node:os');
const { spawnSync } = require('node:child_process');

const parallelism =
  typeof availableParallelism === 'function'
    ? availableParallelism()
    : cpus().length;
const configuredWorkers = Number.parseInt(
  process.env.JEST_MAX_WORKERS ?? '',
  10,
);
const workers =
  Number.isFinite(configuredWorkers) && configuredWorkers > 0
    ? configuredWorkers
    : Math.max(1, Math.min(4, Math.floor(parallelism / 2)));
const forwardedArgs = process.argv.slice(2);
const hasWorkerOverride = forwardedArgs.some((argument) =>
  argument.startsWith('--maxWorkers'),
);
const jestArgs = hasWorkerOverride
  ? forwardedArgs
  : [...forwardedArgs, `--maxWorkers=${workers}`];
const result = spawnSync(
  process.execPath,
  [require.resolve('jest/bin/jest'), ...jestArgs],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
