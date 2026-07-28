// Server test environment resolution.
//
// Pure env derivation, no side effects beyond process.env: works out which
// database the suite targets and refuses unsafe targets. Imported by both
// globalSetup.ts (once per run, before migrating) and setup.ts (once per test
// file, since each file gets a fresh module registry).

function loadEnvFileIfPresent(file?: string): void {
  if (typeof process.loadEnvFile !== 'function') {
    return;
  }
  try {
    if (file) {
      process.loadEnvFile(file);
    } else {
      process.loadEnvFile();
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      throw error;
    }
  }
}

function withTestDbTimeouts(databaseUrl: string): string {
  if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
    return databaseUrl;
  }

  try {
    const parsed = new URL(databaseUrl);
    parsed.searchParams.set('connect_timeout', '2');
    parsed.searchParams.set('pool_timeout', '2');
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

function withTestSchema(databaseUrl: string): string {
  if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
    return databaseUrl;
  }

  const testSchema = process.env.TEST_DATABASE_SCHEMA?.trim() || 'team_lunch_test';

  try {
    const parsed = new URL(databaseUrl);
    parsed.searchParams.set('schema', testSchema);
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

function assertSafeTestDatabaseTarget(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return;
  }

  let schema = 'public';
  try {
    const parsed = new URL(url);
    schema = (parsed.searchParams.get('schema') ?? 'public').trim() || 'public';
  } catch {
    throw new Error(
      'Server tests aborted: DATABASE_URL is not parseable, so test schema safety cannot be verified.',
    );
  }

  const allowDangerous = process.env.ALLOW_DANGEROUS_TEST_SCHEMA === 'true';
  if (!allowDangerous && schema.toLowerCase() === 'public') {
    throw new Error(
      'Server tests aborted: refusing to run against schema "public". Configure TEST_DATABASE_SCHEMA (for example "team_lunch_test").',
    );
  }
}

/**
 * Point DATABASE_URL at the dedicated test database/schema and assert the target
 * is safe to wipe. Idempotent, so running it per file as well as once per run is free.
 */
export function configureTestDatabaseEnv(): void {
  // Optional test-only env overrides (e.g. TEST_DATABASE_URL) take precedence
  // over .env so the suite can target a dedicated test database.
  loadEnvFileIfPresent('.env.test');
  loadEnvFileIfPresent();

  // When a dedicated test database is configured (see docker-compose `db-test`),
  // route the whole suite at it instead of the dev/app DATABASE_URL. This keeps
  // tests fully isolated from real data. Falls back to DATABASE_URL when unset.
  // A dedicated test DB is authoritative: if it is unreachable, fail loud so the
  // misconfiguration is visible instead of poisoning the run.
  if (process.env.TEST_DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL.trim();
  }

  if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = withTestSchema(withTestDbTimeouts(process.env.DATABASE_URL));
    process.env.TEST_DATABASE_URL_EFFECTIVE = process.env.DATABASE_URL;
  }

  assertSafeTestDatabaseTarget();
}
