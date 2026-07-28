// Server test setup — runs once per test file.
//
// Keep this cheap: vitest re-executes it for every test file. Anything that only
// needs doing once per run (schema migration) belongs in globalSetup.ts.
import { configureTestDatabaseEnv } from './testEnv.js';

configureTestDatabaseEnv();

process.env.SERVER_TEST_RUNTIME = 'true';

// Disable approval workflow by default in server tests.
// Tests that verify authz behavior set AUTH_ADMIN_EMAIL explicitly.
delete process.env.AUTH_ADMIN_EMAIL;
process.env.DEFAULT_FOOD_SELECTION_DURATION_MINUTES = '0';

export {};
