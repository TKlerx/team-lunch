/**
 * Seeds the first admin local-auth user from env vars.
 *
 * Required env:  AUTH_ADMIN_EMAIL
 * Optional env:  AUTH_ADMIN_PASSWORD  (a random password is generated when absent)
 *
 * Usage:
 *   npm run auth:seed
 */

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // .env not present — continue with process.env as-is
  }
}

const email = process.env.AUTH_ADMIN_EMAIL?.trim();
if (!email) {
  console.error('ERROR: AUTH_ADMIN_EMAIL is not set in .env or environment.');
  process.exit(1);
}

const password = process.env.AUTH_ADMIN_PASSWORD?.trim() || undefined;

if (password !== undefined && password.length < 8) {
  console.error(`ERROR: AUTH_ADMIN_PASSWORD is too short (${password.length} characters). Minimum length is 8.`);
  process.exit(1);
}

// Import after env is loaded so DATABASE_URL is available for Prisma
const { upsertLocalAuthUser } = await import('../src/server/services/localAuth.js');

console.log(`Seeding local auth user: ${email} …`);
const result = await upsertLocalAuthUser(email, password);

if (result.generated) {
  console.log(`\nAdmin account created:`);
  console.log(`  Email:    ${result.email}`);
  console.log(`  Password: ${result.password}  ← store this securely, it will not be shown again\n`);
} else {
  console.log(`\nAdmin account upserted for: ${result.email}\n`);
}

process.exit(0);
