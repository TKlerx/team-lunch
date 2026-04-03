import prisma from '../../../src/server/db.js';

let availabilityChecked = false;
let availabilityError: Error | null = null;
let cleanupTargetChecked = false;

async function ensureDatabaseAvailable(): Promise<void> {
  if (availabilityChecked) {
    if (availabilityError) {
      throw availabilityError;
    }
    return;
  }

  availabilityChecked = true;

  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : 'Database unavailable during server test setup';
    const provider = process.env.DB_PROVIDER?.toLowerCase() ?? 'postgresql';
    const startupHint =
      provider === 'sqlite'
        ? 'Run "npm run test:server:sqlite" or ensure DATABASE_URL points to a writable sqlite file.'
        : 'Start PostgreSQL and retry.';
    availabilityError = new Error(
      `Server test database is unavailable. ${startupHint} Original error: ${message}`,
    );
    throw availabilityError;
  }
}

async function assertSafeCleanupTarget(): Promise<void> {
  if (cleanupTargetChecked) {
    return;
  }

  if (process.env.SERVER_TEST_RUNTIME !== 'true') {
    throw new Error(
      'Server test cleanup aborted: deleteMany cleanup is only allowed in server test runtime.',
    );
  }

  const provider = (process.env.DB_PROVIDER?.toLowerCase() ?? 'postgresql').trim();
  const databaseUrl = (
    process.env.TEST_DATABASE_URL_EFFECTIVE ??
    process.env.DATABASE_URL ??
    ''
  ).trim();

  if (databaseUrl.length === 0) {
    throw new Error('Server test cleanup aborted: DATABASE_URL is missing.');
  }

  if (provider === 'postgresql' || provider === 'postgres') {
    // PostgreSQL schema safety is asserted centrally in tests/server/setup.ts.
    // Cleanup helper enforces test runtime guard and relies on setup precondition.
    cleanupTargetChecked = true;
    return;
  }

  if (provider === 'sqlite') {
    const normalizedUrl = databaseUrl.toLowerCase();
    const isInMemory = normalizedUrl.includes(':memory:');
    const looksLikeTestDb = normalizedUrl.includes('test');

    if (!isInMemory && !looksLikeTestDb) {
      throw new Error(
        `Server test cleanup aborted: SQLite DATABASE_URL must target a test DB (current: "${databaseUrl}").`,
      );
    }
  }

  cleanupTargetChecked = true;
}

/**
 * Clean all tables in the test database.
 * Call in beforeEach to ensure test isolation.
 */
export async function cleanDatabase(): Promise<void> {
  await ensureDatabaseAvailable();
  await assertSafeCleanupTarget();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // Delete in dependency order (children first)
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
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/**
 * Disconnect Prisma after all tests complete.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
