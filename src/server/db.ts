import type { PrismaClient as PostgresPrismaClient } from './generated/client/client.js';

async function createPrismaClient(): Promise<PostgresPrismaClient> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set; cannot create the Prisma driver adapter.');
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
