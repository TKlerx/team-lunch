#!/usr/bin/env node
// Boots the built app for Playwright e2e against the dedicated test database.
// Requires TEST_DATABASE_URL (see .env.test / .env.test.example) and a prior
// `pnpm build` (the production server serves the SPA from dist/client only when
// NODE_ENV=production). The app does NOT migrate on start, so we migrate the
// test DB here first.
import { spawnSync, spawn } from 'node:child_process';

function loadEnv(file) {
  if (typeof process.loadEnvFile !== 'function') return;
  try {
    file ? process.loadEnvFile(file) : process.loadEnvFile();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

// Test overrides first so TEST_DATABASE_URL wins over .env.
loadEnv('.env.test');
loadEnv();

const testDbUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDbUrl) {
  console.error(
    'e2e-server: TEST_DATABASE_URL is not set. Copy .env.test.example to .env.test ' +
      'and run `pnpm db:test:up` first.',
  );
  process.exit(1);
}

const port = process.env.E2E_PORT || '4173';
const env = {
  ...process.env,
  DATABASE_URL: testDbUrl,
  NODE_ENV: 'production',
  PORT: port,
  // Keep e2e output focused; the connectivity monitor/scheduler add noise.
  DISABLE_DB_CONNECTIVITY_MONITOR: 'true',
  LOG_LEVEL: process.env.LOG_LEVEL || 'warn',
};

// Apply pending migrations to the dedicated test database before serving.
const migrate = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  { stdio: 'inherit', env },
);
if (migrate.status !== 0) {
  console.error('e2e-server: prisma migrate deploy failed against the test database.');
  process.exit(migrate.status ?? 1);
}

// Start the built production server; Playwright waits on /api/health.
const server = spawn(process.execPath, ['dist/server/index.js'], { stdio: 'inherit', env });
server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
