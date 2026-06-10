import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set for pre-deploy Prisma verification.');
  process.exit(1);
}

if (process.env.DATABASE_URL.startsWith('file:')) {
  console.log('SQLite database URL detected; skipping PostgreSQL Prisma drift verification.');
  process.exit(0);
}

const statusResult = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'status'], {
  cwd: repoRoot,
  env: process.env,
  encoding: 'utf8',
});

const statusOutput = `${statusResult.stdout ?? ''}${statusResult.stderr ?? ''}`;
if (statusResult.stdout) {
  process.stdout.write(statusResult.stdout);
}
if (statusResult.stderr) {
  process.stderr.write(statusResult.stderr);
}

const statusExitCode = statusResult.status ?? 1;
const hasPendingMigrations =
  statusOutput.includes('Following migrations have not yet been applied:') ||
  statusOutput.includes('Following migration have not yet been applied:');

if (statusExitCode !== 0 && !hasPendingMigrations) {
  process.exit(statusExitCode);
}

if (hasPendingMigrations) {
  console.log('Pending migrations detected; continuing so deploy can apply them.');
}

console.log('Prisma pre-deploy verification passed.');
