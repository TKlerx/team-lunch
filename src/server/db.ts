import type { PrismaClient as PostgresPrismaClient } from '@prisma/client';

async function loadPrismaClientConstructor(): Promise<new () => PostgresPrismaClient> {
  const provider = process.env.DB_PROVIDER?.toLowerCase() ?? 'postgresql';

  if (provider === 'sqlite') {
    try {
      const sqliteModulePath = './generated/sqlite-client/index.js';
      const sqliteClientModule = await import(sqliteModulePath);
      return sqliteClientModule.PrismaClient as new () => PostgresPrismaClient;
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown SQLite client load error';
      throw new Error(
        `Failed to load SQLite Prisma client. Run "npm run prisma:generate:sqlite" first. Details: ${details}`,
      );
    }
  }

  const postgresClientModule = await import('@prisma/client');
  return postgresClientModule.PrismaClient as new () => PostgresPrismaClient;
}

const PrismaClient = await loadPrismaClientConstructor();

// Singleton Prisma client — all DB access goes through this instance
const prisma = new PrismaClient();

export default prisma;
