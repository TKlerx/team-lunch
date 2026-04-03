import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import prisma from '../db.js';
import { serviceError } from '../routes/routeUtils.js';

const scrypt = promisify(scryptCallback);
const SCRYPT_KEYLEN = 64;
const DB_PROBE_TIMEOUT_MS = 500;
const localAuthUserModel = (prisma as any).localAuthUser as {
  count: () => Promise<number>;
  findUnique: (args: { where: { email: string } }) => Promise<{ email: string; passwordHash: string } | null>;
  upsert: (args: {
    where: { email: string };
    update: { passwordHash: string };
    create: { email: string; passwordHash: string };
  }) => Promise<unknown>;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validateEmailOrThrow(value: string): string {
  const normalized = normalizeEmail(value);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized) || normalized.length > 255) {
    throw serviceError('Invalid email format', 400);
  }
  return normalized;
}

export async function createPasswordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, hashHex] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !hashHex) {
    return false;
  }

  const actual = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function generateRandomPassword(length = 18): string {
  const safeLength = Number.isInteger(length) ? Math.min(Math.max(length, 12), 64) : 18;
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = randomBytes(safeLength);
  let result = '';
  for (let i = 0; i < safeLength; i += 1) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

export async function hasAnyLocalAuthUsers(): Promise<boolean> {
  try {
    const dbCountOrTimeout = await Promise.race([
      localAuthUserModel.count(),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), DB_PROBE_TIMEOUT_MS);
      }),
    ]);
    if (dbCountOrTimeout === 'timeout') {
      return false;
    }
    const dbCount = dbCountOrTimeout;
    return dbCount > 0;
  } catch {
    return false;
  }
}

export async function authenticateLocalUser(
  usernameInput: string,
  password: string,
): Promise<string | null> {
  const username = normalizeEmail(usernameInput);

  let dbUser: { email: string; passwordHash: string } | null = null;
  try {
    dbUser = await localAuthUserModel.findUnique({ where: { email: username } });
  } catch {
    dbUser = null;
  }
  if (!dbUser) {
    return null;
  }

  const isValid = await verifyPassword(password, dbUser.passwordHash);
  return isValid ? dbUser.email : null;
}

export async function upsertLocalAuthUser(
  email: string,
  providedPassword: string | undefined,
): Promise<{ email: string; password: string; generated: boolean }> {
  const normalizedEmail = validateEmailOrThrow(email);
  const generated = !providedPassword;
  const password = providedPassword && providedPassword.trim().length > 0 ? providedPassword : generateRandomPassword();
  if (password.length < 8 || password.length > 200) {
    throw serviceError('Password must be between 8 and 200 characters', 400);
  }

  const passwordHash = await createPasswordHash(password);
  await localAuthUserModel.upsert({
    where: { email: normalizedEmail },
    update: { passwordHash },
    create: { email: normalizedEmail, passwordHash },
  });

  return { email: normalizedEmail, password, generated };
}
