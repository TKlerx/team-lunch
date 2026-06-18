#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

function runPrismaGenerate(extraArgs = []) {
  const prismaCli = path.join(
    process.cwd(),
    'node_modules',
    'prisma',
    'build',
    'index.js',
  );

  const result = spawnSync(
    process.execPath,
    [prismaCli, 'generate', ...extraArgs],
    {
      stdio: 'pipe',
      env: process.env,
      encoding: 'utf8',
    },
  );

  if (result.error) {
    console.error(result.error.message);
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result;
}

const firstAttempt = runPrismaGenerate();

if (firstAttempt.status === 0) {
  process.exit(0);
}

const stderr = `${firstAttempt.stderr ?? ''}`;
const stdout = `${firstAttempt.stdout ?? ''}`;
const combinedOutput = `${stdout}\n${stderr}`;
const isWindowsLockFailure =
  process.platform === 'win32' &&
  combinedOutput.includes('EPERM') &&
  combinedOutput.includes('query_engine-windows.dll.node');

if (!isWindowsLockFailure) {
  process.exit(firstAttempt.status ?? 1);
}

console.warn(
  'Prisma engine file is locked on Windows. Stop the process using src/server/generated/client/query_engine-windows.dll.node, then rerun Prisma generate.',
);

if (process.env.PRISMA_GENERATE_ALLOW_NO_ENGINE !== '1') {
  console.warn(
    'Refusing to fall back to --no-engine because engine-less clients break server tests and runtime database access. Set PRISMA_GENERATE_ALLOW_NO_ENGINE=1 only for type-only generation while a local service is running.',
  );
  process.exit(firstAttempt.status ?? 1);
}

console.warn(
  'PRISMA_GENERATE_ALLOW_NO_ENGINE=1 is set; retrying with --no-engine for type-only client refresh.',
);

const fallbackAttempt = runPrismaGenerate(['--no-engine']);
process.exit(fallbackAttempt.status ?? 1);
