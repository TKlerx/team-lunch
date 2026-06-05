#!/usr/bin/env node
// The Prisma client is generated to src/server/generated/client (explicit
// output, required under pnpm). tsc does not emit generated JS/.d.ts into dist,
// so the production server (dist/server/db.js -> ./generated/client) can't find
// it. Copy the generated client (incl. query engine) into dist after build.
import { cpSync, existsSync, rmSync } from 'node:fs';

const src = 'src/server/generated/client';
const dest = 'dist/server/generated/client';

if (!existsSync(src)) {
  console.error(
    `copy-prisma-client: ${src} is missing. Run \`pnpm exec prisma generate\` before building.`,
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`copy-prisma-client: ${src} -> ${dest}`);
