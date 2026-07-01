#!/usr/bin/env node
// Thin wrapper around `prisma generate`, invoked by prebuild/pretest/pretypecheck.
//
// Prisma 7 generator emits TypeScript into src/server/generated. The generated
// client is gitignored, so CI/fresh clones must generate it before typecheck/build.
//
// Historically this also retried with `--no-engine` to work around Windows
// locking `query_engine-windows.dll.node`. Prisma 7 is engine-free (driver
// adapters), so there is no native DLL to lock and the workaround is gone.

import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

rmSync(path.join(process.cwd(), "src", "server", "generated", "client"), {
  recursive: true,
  force: true,
});

const prismaCli = path.join(
  process.cwd(),
  "node_modules",
  "prisma",
  "build",
  "index.js",
);

const result = spawnSync(process.execPath, [prismaCli, "generate"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
}

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}
