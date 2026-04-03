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
  'Prisma engine file is locked on Windows; retrying with --no-engine to refresh the client without replacing the native DLL.',
);

const fallbackAttempt = runPrismaGenerate(['--no-engine']);
process.exit(fallbackAttempt.status ?? 1);
