import prisma from '../db.js';
import type { UserPreferences } from '../../lib/types.js';

const MAX_TERMS = 40;
const MAX_TERM_LENGTH = 60;
const MAX_USER_KEY_LENGTH = 255;
export const DEFAULT_EXPLORATION_RATE = 0.5;
export const DEFAULT_RECOMMENDATION_COUNT = 3;
const MIN_RECOMMENDATION_COUNT = 1;
const MAX_RECOMMENDATION_COUNT = 10;

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

function parseExplorationRate(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_EXPLORATION_RATE;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw Object.assign(new Error('explorationRate must be a number from 0 to 1'), { statusCode: 400 });
  }

  if (value < 0 || value > 1) {
    throw Object.assign(new Error('explorationRate must be a number from 0 to 1'), { statusCode: 400 });
  }

  return Number(value.toFixed(2));
}

function normalizeExplorationRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_EXPLORATION_RATE;
  }
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function parseRecommendationCount(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_RECOMMENDATION_COUNT;
  }

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw Object.assign(new Error('recommendationCount must be an integer from 1 to 10'), { statusCode: 400 });
  }

  if (value < MIN_RECOMMENDATION_COUNT || value > MAX_RECOMMENDATION_COUNT) {
    throw Object.assign(new Error('recommendationCount must be an integer from 1 to 10'), { statusCode: 400 });
  }

  return value;
}

function normalizeRecommendationCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_RECOMMENDATION_COUNT;
  }

  return Math.max(
    MIN_RECOMMENDATION_COUNT,
    Math.min(MAX_RECOMMENDATION_COUNT, Math.round(value)),
  );
}

function formatUserPreferences(record: {
  userKey: string;
  allergiesJson: unknown;
  dislikesJson: unknown;
  explorationRate: unknown;
  recommendationCount: unknown;
  updatedAt: Date;
}): UserPreferences {
  return {
    userKey: record.userKey,
    allergies: toStringArray(record.allergiesJson),
    dislikes: toStringArray(record.dislikesJson),
    explorationRate: normalizeExplorationRate(record.explorationRate),
    recommendationCount: normalizeRecommendationCount(record.recommendationCount),
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
      explorationRate: DEFAULT_EXPLORATION_RATE,
      recommendationCount: DEFAULT_RECOMMENDATION_COUNT,
      updatedAt: new Date(0).toISOString(),
    };
  }

  return formatUserPreferences(existing);
}

export async function upsertUserPreferences(
  userKeyInput: string,
  allergiesInput: unknown,
  dislikesInput: unknown,
  explorationRateInput?: unknown,
  recommendationCountInput?: unknown,
): Promise<UserPreferences> {
  const userKey = normalizeUserKey(userKeyInput);
  const allergies = parseStringArray(allergiesInput, 'allergies');
  const dislikes = parseStringArray(dislikesInput, 'dislikes');
  const explorationRate = parseExplorationRate(explorationRateInput);
  const recommendationCount = parseRecommendationCount(recommendationCountInput);

  const updated = await prisma.userPreference.upsert({
    where: { userKey },
    create: {
      userKey,
      allergiesJson: allergies,
      dislikesJson: dislikes,
      explorationRate,
      recommendationCount,
    },
    update: {
      allergiesJson: allergies,
      dislikesJson: dislikes,
      explorationRate,
      recommendationCount,
    },
  });

  return formatUserPreferences(updated);
}
