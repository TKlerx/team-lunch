import prisma from '../db.js';
import type { UserPreferences } from '../../lib/types.js';

const MAX_TERMS = 40;
const MAX_TERM_LENGTH = 60;
const MAX_USER_KEY_LENGTH = 255;

function normalizeUserKey(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_USER_KEY_LENGTH) {
    throw Object.assign(new Error('User key must be 1-255 characters'), { statusCode: 400 });
  }
  return trimmed;
}

function parseStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw Object.assign(new Error(`${fieldName} must be an array of strings`), { statusCode: 400 });
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, MAX_TERMS);

  const unique = new Set<string>();
  const result: string[] = [];
  for (const term of normalized) {
    if (term.length > MAX_TERM_LENGTH) {
      throw Object.assign(
        new Error(`${fieldName} terms must be at most ${MAX_TERM_LENGTH} characters`),
        { statusCode: 400 },
      );
    }
    const key = term.toLocaleLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    result.push(term);
  }

  return result;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function formatUserPreferences(record: {
  userKey: string;
  allergiesJson: unknown;
  dislikesJson: unknown;
  updatedAt: Date;
}): UserPreferences {
  return {
    userKey: record.userKey,
    allergies: toStringArray(record.allergiesJson),
    dislikes: toStringArray(record.dislikesJson),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function getUserPreferences(userKeyInput: string): Promise<UserPreferences> {
  const userKey = normalizeUserKey(userKeyInput);
  const existing = await prisma.userPreference.findUnique({
    where: { userKey },
  });

  if (!existing) {
    return {
      userKey,
      allergies: [],
      dislikes: [],
      updatedAt: new Date(0).toISOString(),
    };
  }

  return formatUserPreferences(existing);
}

export async function upsertUserPreferences(
  userKeyInput: string,
  allergiesInput: unknown,
  dislikesInput: unknown,
): Promise<UserPreferences> {
  const userKey = normalizeUserKey(userKeyInput);
  const allergies = parseStringArray(allergiesInput, 'allergies');
  const dislikes = parseStringArray(dislikesInput, 'dislikes');

  const updated = await prisma.userPreference.upsert({
    where: { userKey },
    create: {
      userKey,
      allergiesJson: allergies,
      dislikesJson: dislikes,
    },
    update: {
      allergiesJson: allergies,
      dislikesJson: dislikes,
    },
  });

  return formatUserPreferences(updated);
}
