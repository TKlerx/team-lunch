// Server test setup
// Shared setup for server-side Vitest tests.
import { execSync } from 'node:child_process';
import net from 'node:net';

if (typeof process.loadEnvFile === 'function') {
	try {
		process.loadEnvFile();
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

if (process.env.DATABASE_URL) {
	process.env.DATABASE_URL = withTestDbTimeouts(process.env.DATABASE_URL);
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

function getDatabaseReachabilityTarget(databaseUrl: string): { host: string; port: number } | null {
	if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
		return null;
	}

	try {
		const parsed = new URL(databaseUrl);
		const host = parsed.hostname.trim();
		const port = parsed.port.trim() ? Number(parsed.port) : 5432;
		if (!host || !Number.isInteger(port) || port <= 0) {
			return null;
		}
		return { host, port };
	} catch {
		return null;
	}
}

async function canReachPostgres(databaseUrl: string): Promise<boolean> {
	const target = getDatabaseReachabilityTarget(databaseUrl);
	if (!target) {
		return true;
	}

	return await new Promise<boolean>((resolve) => {
		const socket = net.createConnection(target);
		const finish = (reachable: boolean): void => {
			socket.removeAllListeners();
			socket.destroy();
			resolve(reachable);
		};

		socket.setTimeout(2_000);
		socket.once('connect', () => finish(true));
		socket.once('timeout', () => finish(false));
		socket.once('error', () => finish(false));
	});
}

function switchToSqliteServerTests(): void {
	process.env.DB_PROVIDER = 'sqlite';
	process.env.DATABASE_URL = 'file:./prisma/test.sqlite';
	process.env.TEST_DATABASE_URL_EFFECTIVE = process.env.DATABASE_URL;

	execSync('npx prisma generate --schema prisma/schema.sqlite.prisma', {
		stdio: 'pipe',
		env: process.env as NodeJS.ProcessEnv,
	});
	execSync('npx prisma db push --schema prisma/schema.sqlite.prisma --skip-generate', {
		stdio: 'pipe',
		env: process.env as NodeJS.ProcessEnv,
	});
}

function getExecErrorOutput(error: unknown): string {
	if (!error || typeof error !== 'object') {
		return '';
	}

	const execError = error as {
		stdout?: Buffer | string;
		stderr?: Buffer | string;
		message?: string;
	};

	const parts = [execError.stdout, execError.stderr, execError.message]
		.filter((value): value is Buffer | string => typeof value === 'string' || value instanceof Buffer)
		.map((value) => value.toString())
		.filter((value) => value.trim().length > 0);

	return parts.join('\n');
}

function ensureTestSchemaMigrated(): void {
	const provider = process.env.DB_PROVIDER?.toLowerCase() ?? 'postgresql';
	if (provider !== 'postgresql') {
		return;
	}
	if (!process.env.DATABASE_URL) {
		return;
	}

	try {
		execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
			stdio: 'pipe',
			env: process.env as NodeJS.ProcessEnv,
		});
	} catch (error) {
		const output = getExecErrorOutput(error);
		const allowFallback = process.env.FORCE_POSTGRES_TESTS !== 'true';
		const looksUnavailable =
			output.includes("Can't reach database server") ||
			output.includes('P1001') ||
			output.includes('Schema engine error');

		if (allowFallback && looksUnavailable) {
			switchToSqliteServerTests();
			return;
		}

		throw error;
	}
}

function assertSafeTestDatabaseTarget(): void {
	const provider = process.env.DB_PROVIDER?.toLowerCase() ?? 'postgresql';
	const url = process.env.DATABASE_URL;
	if (!url) {
		return;
	}

	if (provider === 'postgresql') {
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
}

if (process.env.DATABASE_URL) {
	process.env.DATABASE_URL = withTestSchema(process.env.DATABASE_URL);
	process.env.TEST_DATABASE_URL_EFFECTIVE = process.env.DATABASE_URL;
}
if ((process.env.DB_PROVIDER?.toLowerCase() ?? 'postgresql') === 'postgresql' && process.env.DATABASE_URL) {
	const postgresReachable = await canReachPostgres(process.env.DATABASE_URL);
	if (!postgresReachable) {
		switchToSqliteServerTests();
	}
}
assertSafeTestDatabaseTarget();
ensureTestSchemaMigrated();
process.env.SERVER_TEST_RUNTIME = 'true';

// Disable approval workflow by default in server tests.
// Tests that verify authz behavior set AUTH_ADMIN_EMAIL explicitly.
delete process.env.AUTH_ADMIN_EMAIL;
process.env.DEFAULT_FOOD_SELECTION_DURATION_MINUTES = '0';

export {};
