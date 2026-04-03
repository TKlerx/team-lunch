import { serviceError } from '../routes/routeUtils.js';

type AttemptRecord = {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
};

type LocalLoginAttempt = {
  ipAddress: string;
  username: string;
};

const PER_IP_FAILURE_LIMIT = 10;
const PER_USERNAME_IP_FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const LOCKOUT_MS = 10 * 60 * 1000;

const attemptsByIp = new Map<string, AttemptRecord>();
const attemptsByIdentity = new Map<string, AttemptRecord>();

function normalizeIpAddress(ipAddress: string): string {
  const normalized = ipAddress.trim();
  return normalized.length > 0 ? normalized : 'unknown';
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function identityKey(attempt: LocalLoginAttempt): string {
  return `${normalizeIpAddress(attempt.ipAddress)}::${normalizeUsername(attempt.username)}`;
}

function readRecord(store: Map<string, AttemptRecord>, key: string, now: number): AttemptRecord | null {
  const record = store.get(key);
  if (!record) {
    return null;
  }

  const stale =
    record.lockedUntil <= now &&
    now - record.lastFailureAt > FAILURE_WINDOW_MS;
  if (stale) {
    store.delete(key);
    return null;
  }

  return record;
}

function getRetryAfterSeconds(lockedUntil: number, now: number): number {
  return Math.max(1, Math.ceil((lockedUntil - now) / 1000));
}

function checkLocked(record: AttemptRecord | null, now: number): void {
  if (!record || record.lockedUntil <= now) {
    return;
  }

  const retryAfterSeconds = getRetryAfterSeconds(record.lockedUntil, now);
  throw Object.assign(
    serviceError(`Too many failed login attempts. Try again in ${retryAfterSeconds} seconds.`, 429),
    { retryAfterSeconds },
  );
}

function updateRecord(
  store: Map<string, AttemptRecord>,
  key: string,
  limit: number,
  now: number,
): AttemptRecord {
  const previous = readRecord(store, key, now);
  const withinWindow = previous && now - previous.lastFailureAt <= FAILURE_WINDOW_MS;
  const failures = withinWindow ? previous.failures + 1 : 1;
  const lockedUntil = failures >= limit ? now + LOCKOUT_MS : 0;
  const next = {
    failures,
    lastFailureAt: now,
    lockedUntil,
  };
  store.set(key, next);
  return next;
}

export function assertLocalLoginAllowed(attempt: LocalLoginAttempt, now = Date.now()): void {
  checkLocked(readRecord(attemptsByIp, normalizeIpAddress(attempt.ipAddress), now), now);
  checkLocked(readRecord(attemptsByIdentity, identityKey(attempt), now), now);
}

export function recordLocalLoginFailure(attempt: LocalLoginAttempt, now = Date.now()): void {
  updateRecord(attemptsByIp, normalizeIpAddress(attempt.ipAddress), PER_IP_FAILURE_LIMIT, now);
  updateRecord(attemptsByIdentity, identityKey(attempt), PER_USERNAME_IP_FAILURE_LIMIT, now);
}

export function clearLocalLoginPenalty(attempt: LocalLoginAttempt): void {
  attemptsByIdentity.delete(identityKey(attempt));
  attemptsByIp.delete(normalizeIpAddress(attempt.ipAddress));
}

export function resetLocalLoginProtectionForTests(): void {
  attemptsByIp.clear();
  attemptsByIdentity.clear();
}
