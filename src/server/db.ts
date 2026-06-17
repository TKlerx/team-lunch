import type { PrismaClient as PostgresPrismaClient } from './generated/client/client.js';

// Prisma 7 has no built-in query engine: every connection goes through a driver
// adapter passed to the client constructor. We pick the adapter (and matching
// generated client) by DB_PROVIDER, defaulting to PostgreSQL. SQLite remains a
// local-testing-only path (see Priority 26).
async function createPrismaClient(): Promise<PostgresPrismaClient> {
  const provider = process.env.DB_PROVIDER?.toLowerCase() ?? 'postgresql';
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set; cannot create the Prisma driver adapter.');
  }

  if (provider === 'sqlite') {
    try {
      const sqliteClientModule = await import('./generated/sqlite-client/client.js');
      const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
      const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
      // The SQLite client is structurally identical to the Postgres one (same
      // models) but generated under a different path, so cast to the shared type.
      return new sqliteClientModule.PrismaClient({ adapter }) as unknown as PostgresPrismaClient;
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown SQLite client load error';
      throw new Error(
        `Failed to load SQLite Prisma client. Run "npm run prisma:generate:sqlite" first. Details: ${details}`,
      );
    }
  }

  const postgresClientModule = await import('./generated/client/client.js');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  // The `?schema=` URL parameter is a Prisma-engine concept; the node-postgres
  // driver adapter ignores it, so we parse it out and pass it explicitly. This
  // sets the search_path for runtime queries to match where migrations ran.
  let schema: string | undefined;
  try {
    schema = new URL(databaseUrl).searchParams.get('schema') ?? undefined;
  } catch {
    schema = undefined;
  }
  const adapter = new PrismaPg({ connectionString: databaseUrl }, schema ? { schema } : undefined);
  return new postgresClientModule.PrismaClient({ adapter });
}

// Singleton Prisma client — all DB access goes through this instance
const prisma = await createPrismaClient();

export default prisma;
