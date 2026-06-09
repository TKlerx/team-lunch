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
const e2eLoginEmail = process.env.E2E_LOGIN_EMAIL || 'e2e-user@team-lunch.test';
const e2eLoginPassword = process.env.E2E_LOGIN_PASSWORD || 'E2ePassword!123';
const env = {
  ...process.env,
  DATABASE_URL: testDbUrl,
  NODE_ENV: 'production',
  PORT: port,
  AUTH_SESSION_SECRET:
    process.env.AUTH_SESSION_SECRET || 'e2e-session-secret-12345678901234567890',
  // Keep e2e output focused; the connectivity monitor/scheduler add noise.
  DISABLE_DB_CONNECTIVITY_MONITOR: 'true',
  LOG_LEVEL: process.env.LOG_LEVEL || 'warn',
};
Object.assign(process.env, env);

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

async function seedE2eLocalUser() {
  const [{ upsertLocalAuthUser }, { ensureDefaultOfficeLocation }, dbModule] = await Promise.all([
    import('../dist/server/services/localAuth.js'),
    import('../dist/server/services/officeLocation.js'),
    import('../dist/server/db.js'),
  ]);
  const prisma = dbModule.default;
  await prisma.shoppingListItem.deleteMany();
  await prisma.foodOrder.deleteMany();
  await prisma.foodSelection.deleteMany();
  await prisma.pollExcludedMenu.deleteMany();
  await prisma.pollVote.deleteMany();
  await prisma.poll.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.userMenuDefaultPreference.deleteMany();
  await prisma.authAccessUserOffice.deleteMany();
  await prisma.authAccessUser.deleteMany();
  await prisma.officeLocation.deleteMany();
  await prisma.localAuthUser.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.auditLog.deleteMany();

  const office = await ensureDefaultOfficeLocation();
  const localUser = await upsertLocalAuthUser(e2eLoginEmail, e2eLoginPassword);
  const accessUser = await prisma.authAccessUser.upsert({
    where: { email: localUser.email },
    create: {
      email: localUser.email,
      approved: true,
      isAdmin: true,
      blocked: false,
      officeLocationId: office.id,
      approvedAt: new Date(),
    },
    update: {
      approved: true,
      isAdmin: true,
      blocked: false,
      officeLocationId: office.id,
      approvedAt: new Date(),
      blockedAt: null,
      updatedAt: new Date(),
    },
    select: { id: true },
  });
  await prisma.authAccessUserOffice.createMany({
    data: [{ authAccessUserId: accessUser.id, officeLocationId: office.id }],
    skipDuplicates: true,
  });
  await prisma.$disconnect();
}

try {
  await seedE2eLocalUser();
} catch (error) {
  console.error('e2e-server: failed to seed local e2e user.');
  console.error(error);
  process.exit(1);
}

// Start the built production server; Playwright waits on /api/health.
const server = spawn(process.execPath, ['dist/server/index.js'], { stdio: 'inherit', env });
server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
