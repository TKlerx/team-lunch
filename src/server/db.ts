import type { PrismaClient as PostgresPrismaClient } from './generated/client/client.js';

const databaseUrl = process.env.DATABASE_URL;
export const databaseSchema = databaseUrl
  ? (() => {
      try {
        return new URL(databaseUrl).searchParams.get('schema') ?? undefined;
      } catch {
        return undefined;
      }
    })()
  : undefined;

async function createPrismaClient(): Promise<PostgresPrismaClient> {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set; cannot create the Prisma driver adapter.');
  }

  const postgresClientModule = await import('./generated/client/client.js');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  // The `?schema=` URL parameter is a Prisma-engine concept; the node-postgres
  // driver adapter ignores it, so we parse it out and pass it explicitly. This
  // qualifies Prisma model queries to match where migrations ran.
  const adapter = new PrismaPg(
    { connectionString: databaseUrl },
    databaseSchema ? { schema: databaseSchema } : undefined,
  );
  return new postgresClientModule.PrismaClient({ adapter });
}

// Singleton Prisma client — all DB access goes through this instance
const prisma = await createPrismaClient();

export default prisma;
