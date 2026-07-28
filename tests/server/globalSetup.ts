// Server test global setup — runs ONCE per `vitest run`, before any worker starts.
//
// `prisma migrate deploy` belongs here, not in setup.ts: setup files re-execute
// for every test file, so migrating there cost ~3.5s x 52 files (~180s) to apply
// zero pending migrations. The migration lock is kept because a second vitest
// process (or another dev) can still race us for the same database.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configureTestDatabaseEnv } from './testEnv.js';

function getExecErrorOutput(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const execError = error as {
    stdout?: Buffer | string;
    stderr?: Buffer | string;
    message?: string;
  };

  const parts = [execError.stdout, execError.stderr, execError.message]
    .filter((value): value is Buffer | string => typeof value === 'string' || value instanceof Buffer)
    .map((value) => value.toString())
    .filter((value) => value.trim().length > 0);

  return parts.join('\n');
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function getMigrationLockDir(): string {
  const key = createHash('sha256')
    .update(process.env.DATABASE_URL ?? 'unknown-database')
    .digest('hex')
    .slice(0, 16);
  return path.join(os.tmpdir(), `team-lunch-prisma-migrate-${key}.lock`);
}

function tryAcquireLock(lockDir: string): boolean {
  try {
    mkdirSync(lockDir);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
    return false;
  }
}

// `prisma migrate` is hard-killed at MIGRATE_TIMEOUT_MS, so a live lock can never be
// held much longer than that. Anything older was leaked by a killed run (Ctrl+C), hence
// the 2x margin: a slow-but-alive migrate must never have its lock stolen out from under
// it, or two migrations run against the same database at once.
const MIGRATE_TIMEOUT_MS = 60_000;
const STALE_LOCK_MS = 2 * MIGRATE_TIMEOUT_MS;
// Must exceed STALE_LOCK_MS, otherwise a waiter gives up before it is ever allowed to steal.
const LOCK_WAIT_TIMEOUT_MS = 5 * MIGRATE_TIMEOUT_MS;

function removeLockIfStale(lockDir: string): void {
  try {
    if (Date.now() - statSync(lockDir).mtimeMs > STALE_LOCK_MS) {
      rmSync(lockDir, { recursive: true, force: true });
    }
  } catch {
    // lock vanished concurrently — next acquire attempt will settle it
  }
}

function withMigrationLock(action: () => void): void {
  const lockDir = getMigrationLockDir();
  const startedAt = Date.now();

  while (!tryAcquireLock(lockDir)) {
    removeLockIfStale(lockDir);
    if (Date.now() - startedAt > LOCK_WAIT_TIMEOUT_MS) {
      throw new Error(`Timed out waiting for Prisma test migration lock: ${lockDir}`);
    }
    sleepSync(250);
  }

  try {
    action();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

function ensureTestSchemaMigrated(): void {
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    withMigrationLock(() => {
      execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
        stdio: 'pipe',
        env: process.env as NodeJS.ProcessEnv,
        timeout: MIGRATE_TIMEOUT_MS, // never let a hung migrate block the whole suite
      });
    });
  } catch (error) {
    const output = getExecErrorOutput(error);
    const looksUnavailable =
      output.includes("Can't reach database server") ||
      output.includes('P1001') ||
      output.includes('Schema engine error');

    if (looksUnavailable) {
      throw new Error(
        `Server tests aborted: PostgreSQL is unreachable (${process.env.DATABASE_URL}). Start it with \`pnpm db:test:up\`.`,
      );
    }

    throw error;
  }
}

export default function globalSetup(): void {
  configureTestDatabaseEnv();
  ensureTestSchemaMigrated();
}
