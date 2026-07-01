// Prisma v7 configuration. Replaces the deprecated `package.json#prisma` block
// and the implicit `.env` auto-loading that Prisma <7 performed. We import
// `dotenv/config` so DATABASE_URL (and friends) are populated on process.env
// before the CLI / schema engine read the schema's `datasource` block.
//
// We intentionally do NOT set a top-level `datasource`/`adapter` here: the
// schema engine falls back to the `datasource db { url = env("DATABASE_URL") }`
// block in schema.prisma (classic schema engine). The runtime Prisma Client
// uses a driver adapter wired in src/server/db.ts instead.
//
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// v7 removed `url` from the schema `datasource` block. The Schema Engine
// (migrate/db push/diff) gets the connection URL from here instead. Runtime
// Prisma Client connects via a driver adapter in src/server/db.ts — not this.

// We read via `process.env` (empty fallback) rather than prisma's `env()`
// helper: `env()` throws on a missing variable, which breaks `prisma generate`
// in environments that don't set DATABASE_URL (e.g. the Docker build stage).
// `generate` never needs the URL; migrate/db push run with DATABASE_URL set.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
