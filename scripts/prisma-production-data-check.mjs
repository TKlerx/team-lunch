const allowEmpty = (process.env.ALLOW_EMPTY_DATABASE_DEPLOY ?? 'false').toLowerCase() === 'true';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL must be set for production data safety verification.');
  process.exit(1);
}

if (databaseUrl.startsWith('file:')) {
  console.log('SQLite database URL detected; skipping PostgreSQL production data safety verification.');
  process.exit(0);
}

const freshInstallGuidance =
  'For a fresh install or intentional empty bootstrap, rerun deploy with ALLOW_EMPTY_DATABASE_DEPLOY=true. ' +
  'For an existing deployment, do not set that flag; check COMPOSE_PROJECT_NAME, POSTGRES_DB, and Docker volumes first.';

const describeTarget = (url) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, ''),
    schema: parsed.searchParams.get('schema') || 'public',
  };
};

const countRaw = async (prisma, table) => {
  const rows = await prisma.$queryRawUnsafe(
    'select count(*)::int as count from information_schema.tables where table_schema = current_schema() and table_name = $1',
    table,
  );
  if (Number(rows[0]?.count ?? 0) === 0) {
    return null;
  }

  const countRows = await prisma.$queryRawUnsafe(`select count(*)::int as count from "${table}"`);
  return Number(countRows[0]?.count ?? 0);
};

// Prisma 7: ESM client (entry is `client.js`, not `index.js`) constructed with
// a driver adapter. This script only runs against PostgreSQL (SQLite is skipped
// above), so the pg adapter is always the right one here.
const { PrismaClient } = await import('../dist/server/generated/client/client.js');
const { PrismaPg } = await import('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

try {
  const target = describeTarget(databaseUrl);
  const counts = {};
  for (const table of [
    '_prisma_migrations',
    'office_locations',
    'menus',
    'polls',
    'food_selections',
    'food_orders',
    'auth_access_users',
    'local_auth_users',
  ]) {
    counts[table] = await countRaw(prisma, table);
  }

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Production database safety snapshot',
      target,
      counts,
      allowEmpty,
    }),
  );

  const hasMigrations = (counts._prisma_migrations ?? 0) > 0;
  const appRowCount =
    (counts.office_locations ?? 0) +
    (counts.menus ?? 0) +
    (counts.polls ?? 0) +
    (counts.food_selections ?? 0) +
    (counts.food_orders ?? 0) +
    (counts.auth_access_users ?? 0) +
    (counts.local_auth_users ?? 0);

  if (!allowEmpty && !hasMigrations) {
    throw new Error(
      `Target database has no Prisma migration history. This looks like a fresh database/volume. ${freshInstallGuidance}`,
    );
  }

  if (!allowEmpty && hasMigrations && appRowCount === 0) {
    throw new Error(
      `Target database has migrations but no Team Lunch data/auth rows. This looks like an empty or wrong database target. ${freshInstallGuidance}`,
    );
  }
} finally {
  await prisma.$disconnect();
}
