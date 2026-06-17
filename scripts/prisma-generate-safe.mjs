#!/usr/bin/env node
// Thin wrapper around `prisma generate`, invoked by the prebuild/pretest hooks.
//
// Historically this also retried with `--no-engine` to work around Windows
// locking `query_engine-windows.dll.node`. Prisma 7 is engine-free (driver
// adapters), so there is no native DLL to lock and the workaround is gone.

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');

const result = spawnSync(process.execPath, [prismaCli, 'generate'], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
