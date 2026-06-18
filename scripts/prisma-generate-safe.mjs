#!/usr/bin/env node
// Thin wrapper around `prisma generate`, invoked by prebuild/pretest/pretypecheck.
//
// Prisma 7 generator emits TypeScript into src/server/generated. Both generated
// clients are gitignored, so CI/fresh clones must generate both the default
// PostgreSQL client and the SQLite testing client before typecheck/build.
//
// Historically this also retried with `--no-engine` to work around Windows
// locking `query_engine-windows.dll.node`. Prisma 7 is engine-free (driver
// adapters), so there is no native DLL to lock and the workaround is gone.

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
const generateCommands = [
  ['generate'],
  ['generate', '--schema', 'prisma/schema.sqlite.prisma'],
];

for (const args of generateCommands) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}
