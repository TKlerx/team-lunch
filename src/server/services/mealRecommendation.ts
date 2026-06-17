import type { Prisma } from '../generated/client/client.js';
import prisma from '../db.js';
import { serviceError } from '../routes/routeUtils.js';
import type {
  MealRecommendationItem,
  MealRecommendationResponse,
  MealRecommendationSignal,
  MealRecommendationSource,
} from '../../lib/types.js';
import {
  buildSanitizedPayload,
  getAiRecommendationProvider,
  isAiRecommendationConfigured,
  requestAiExplanations,
} from './mealRecommendationAi.js';
import { buildTasteProfile, extractFeatures, scoreTasteMatch, type TasteProfile } from './mealFeatures.js';

export interface RecommendationActor {
  actorKey: string;
  actorEmail: string | null;
  displayNameSnapshot: string | null;
}

// ─── Scoring constants ──────────────────────────────────────

const SCORE_PERSONAL_RATING_HIGH = 40;
const SCORE_PERSONAL_RATING_NEUTRAL = 10;
const SCORE_PERSONAL_RATING_LOW = -25;
const RATING_HIGH_THRESHOLD = 4;
const RATING_LOW_THRESHOLD = 2;

const SCORE_DEFAULT_MEAL = 30;

const SCORE_POPULARITY_PER_ORDER = 2;
const SCORE_POPULARITY_MAX = 20;

const SCORE_RECENCY_BONUS = 5;
const RECENCY_THRESHOLD_DAYS = 21;

// Content-based taste match: each feature weight is in [-2, +2]; an item
// carries a handful of features, so scale per point and clamp the total
// contribution to keep it comparable to the other signals.
const SCORE_TASTE_PER_POINT = 8;
const SCORE_TASTE_MAX = 40;
// Activate the taste profile once there is enough evidence: either a couple of
// explicit ratings, or enough orders for implicit signal to be meaningful.
const TASTE_PROFILE_MIN_RATINGS = 2;
const TASTE_PROFILE_MIN_ORDERS = 4;

const ALLERGY_DEMOTION_FACTOR = 0.2;
const DISLIKE_DEMOTION_FACTOR = 0.5;

const COLD_START_SCORE = 50;
const HISTORY_LOOKBACK_LIMIT = 300;

type ScoredItem = {
  itemId: string;
  itemName: string;
  description: string | null;
  score: number;
  signals: Set<MealRecommendationSignal>;
  reasonTexts: Map<MealRecommendationSignal, string>;
};

const REASON_PRIORITY: MealRecommendationSignal[] = [
  'default_meal',
  'preference_warning',
  'taste_match',
  'personal_rating',
  'office_popularity',
  'recency',
  'preference_match',
];

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase().trim();
}

function findMatchingTerm(haystack: string, terms: string[]): string | null {
  for (const term of terms) {
    const normalized = normalizeForMatch(term);
    if (normalized.length > 0 && haystack.includes(normalized)) {
      return term;
    }
  }
  return null;
}

async function fetchActorHistory(
  actorKey: string,
  officeLocationId: string,
): Promise<{ itemName: string; rating: number | null; orderedAt: Date }[]> {
  return prisma.foodOrder.findMany({
    where: { actorKey, selection: { officeLocationId } },
    select: { itemName: true, rating: true, orderedAt: true },
    orderBy: { orderedAt: 'desc' },
    take: HISTORY_LOOKBACK_LIMIT,
  });
}

async function fetchOfficePopularity(officeLocationId: string): Promise<Map<string, number>> {
  const grouped = await prisma.foodOrder.groupBy({
    by: ['itemName'],
    where: { selection: { officeLocationId } },
    _count: { itemName: true },
  });

  return new Map(grouped.map((entry) => [entry.itemName, entry._count.itemName]));
}

function buildReason(scored: ScoredItem): string {
  const parts: string[] = [];
  for (const signal of REASON_PRIORITY) {
    if (scored.signals.has(signal)) {
      const text = scored.reasonTexts.get(signal);
      if (text) parts.push(text);
    }
    if (parts.length >= 2) break;
  }

  if (parts.length === 0) {
    return 'Recommended from the current menu.';
  }

  return `Recommended because ${parts.join(', and ')}.`;
}

interface ScoringContext {
  ratingsByItemName: Map<string, { sum: number; count: number }>;
  lastOrderedByItemName: Map<string, Date>;
  popularityByItemName: Map<string, number>;
  defaultItemId: string | null;
  allergies: string[];
  dislikes: string[];
  tasteProfile: TasteProfile;
}

function buildTasteReason(likedLabels: string[], dislikedLabels: string[]): string {
  if (likedLabels.length > 0) {
    return `it matches flavors you tend to like (${likedLabels.slice(0, 3).join(', ')})`;
  }
  return `it leans toward flavors you've rated lower (${dislikedLabels.slice(0, 3).join(', ')})`;
}

function scoreMenuItem(
  item: { id: string; name: string; description: string | null },
  context: ScoringContext,
): ScoredItem {
  const scored: ScoredItem = {
    itemId: item.id,
    itemName: item.name,
    description: item.description,
    score: 0,
    signals: new Set(),
    reasonTexts: new Map(),
  };

  const ratingInfo = context.ratingsByItemName.get(item.name);
  if (ratingInfo) {
    const avgRating = ratingInfo.sum / ratingInfo.count;
    if (avgRating >= RATING_HIGH_THRESHOLD) {
      scored.score += SCORE_PERSONAL_RATING_HIGH;
      scored.signals.add('personal_rating');
      scored.reasonTexts.set('personal_rating', 'you rated this highly before');
    } else if (avgRating <= RATING_LOW_THRESHOLD) {
      scored.score += SCORE_PERSONAL_RATING_LOW;
      scored.signals.add('personal_rating');
      scored.reasonTexts.set('personal_rating', 'you rated this poorly before');
    } else {
      scored.score += SCORE_PERSONAL_RATING_NEUTRAL;
      scored.signals.add('personal_rating');
      scored.reasonTexts.set('personal_rating', "you've ordered this before");
    }
  }

  if (
    context.tasteProfile.ratedCount >= TASTE_PROFILE_MIN_RATINGS ||
    context.tasteProfile.orderCount >= TASTE_PROFILE_MIN_ORDERS
  ) {
    const features = extractFeatures(item.name, item.description);
    const match = scoreTasteMatch(features, context.tasteProfile);
    if (match.score !== 0) {
      const contribution = Math.max(
        -SCORE_TASTE_MAX,
        Math.min(SCORE_TASTE_MAX, match.score * SCORE_TASTE_PER_POINT),
      );
      scored.score += contribution;
      scored.signals.add('taste_match');
      scored.reasonTexts.set('taste_match', buildTasteReason(match.likedLabels, match.dislikedLabels));
    }
  }

  if (context.defaultItemId === item.id) {
    scored.score += SCORE_DEFAULT_MEAL;
    scored.signals.add('default_meal');
    scored.reasonTexts.set('default_meal', 'this is your saved default meal');
  }

  const popularity = context.popularityByItemName.get(item.name) ?? 0;
  if (popularity > 0) {
    scored.score += Math.min(SCORE_POPULARITY_MAX, popularity * SCORE_POPULARITY_PER_ORDER);
    scored.signals.add('office_popularity');
    scored.reasonTexts.set('office_popularity', 'it is popular with your team');
  }

  const lastOrdered = context.lastOrderedByItemName.get(item.name);
  if (lastOrdered) {
    const daysAgo = (Date.now() - lastOrdered.getTime()) / (24 * 60 * 60 * 1000);
    const avgRating = ratingInfo ? ratingInfo.sum / ratingInfo.count : null;
    if (daysAgo > RECENCY_THRESHOLD_DAYS && (avgRating === null || avgRating >= RATING_HIGH_THRESHOLD - 1)) {
      scored.score += SCORE_RECENCY_BONUS;
      scored.signals.add('recency');
      scored.reasonTexts.set('recency', "it's been a while since you had this");
    }
  }

  const haystack = `${item.name} ${item.description ?? ''}`.toLocaleLowerCase();
  const allergyHit = findMatchingTerm(haystack, context.allergies);
  const dislikeHit = allergyHit ? null : findMatchingTerm(haystack, context.dislikes);
  if (allergyHit) {
    scored.score *= ALLERGY_DEMOTION_FACTOR;
    scored.signals.add('preference_warning');
    scored.reasonTexts.set(
      'preference_warning',
      `it may contain ${allergyHit}, which you marked as an allergy`,
    );
  } else if (dislikeHit) {
    scored.score *= DISLIKE_DEMOTION_FACTOR;
    scored.signals.add('preference_warning');
    scored.reasonTexts.set(
      'preference_warning',
      `it contains ${dislikeHit}, which you marked as a dislike`,
    );
  } else if (scored.signals.size > 0) {
    scored.signals.add('preference_match');
    scored.reasonTexts.set('preference_match', 'it does not conflict with your ingredient preferences');
  }

  return scored;
}

function rankItems(scoredItems: ScoredItem[]): MealRecommendationItem[] {
  const allZero = scoredItems.every((item) => item.score === 0);
  if (allZero && scoredItems.length > 0) {
    for (const item of scoredItems) {
      item.score = COLD_START_SCORE;
      item.signals.add('office_popularity');
      item.reasonTexts.set(
        'office_popularity',
        'there is no order history yet, so here are the current menu options',
      );
    }
  }

  const sorted = [...scoredItems].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.itemName.localeCompare(b.itemName);
  });

  return sorted.map((item, index) => ({
    itemId: item.itemId,
    itemName: item.itemName,
    rank: index + 1,
    score: Math.max(0, Math.min(100, Math.round(item.score))),
    reason: buildReason(item),
    sourceSignals: [...item.signals],
    aiAssisted: false,
  }));
}

export async function generateRecommendations(
  selectionId: string,
  officeLocationId: string,
  actor: RecommendationActor,
  useAi?: boolean,
): Promise<MealRecommendationResponse> {
  const selection = await prisma.foodSelection.findFirst({
    where: { id: selectionId, officeLocationId },
  });
  if (!selection) {
    throw serviceError('Food selection not found', 404);
  }
  if (selection.status !== 'active' || !selection.menuId) {
    throw serviceError('Food selection is not orderable', 400);
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { menuId: selection.menuId },
    orderBy: { name: 'asc' },
  });

  const [history, popularityByItemName, defaultPreference, userPreference] = await Promise.all([
    fetchActorHistory(actor.actorKey, officeLocationId),
    fetchOfficePopularity(officeLocationId),
    prisma.userMenuDefaultPreference.findUnique({
      where: { userKey_menuId: { userKey: actor.actorKey, menuId: selection.menuId } },
    }),
    prisma.userPreference.findUnique({ where: { userKey: actor.actorKey } }),
  ]);

  const ratingsByItemName = new Map<string, { sum: number; count: number }>();
  const lastOrderedByItemName = new Map<string, Date>();
  for (const order of history) {
    if (!lastOrderedByItemName.has(order.itemName)) {
      lastOrderedByItemName.set(order.itemName, order.orderedAt);
    }
    if (order.rating !== null) {
      const existing = ratingsByItemName.get(order.itemName);
      if (existing) {
        existing.sum += order.rating;
        existing.count += 1;
      } else {
        ratingsByItemName.set(order.itemName, { sum: order.rating, count: 1 });
      }
    }
  }

  const allergies = Array.isArray(userPreference?.allergiesJson)
    ? (userPreference!.allergiesJson as unknown[]).filter((entry): entry is string => typeof entry === 'string')
    : [];
  const dislikes = Array.isArray(userPreference?.dislikesJson)
    ? (userPreference!.dislikesJson as unknown[]).filter((entry): entry is string => typeof entry === 'string')
    : [];

  const tasteProfile = buildTasteProfile(history);

  const context: ScoringContext = {
    ratingsByItemName,
    lastOrderedByItemName,
    popularityByItemName,
    defaultItemId: defaultPreference?.itemId ?? null,
    allergies,
    dislikes,
    tasteProfile,
  };

  const scoredItems = menuItems.map((item) => scoreMenuItem(item, context));
  const items = rankItems(scoredItems);

  let source: MealRecommendationSource = 'deterministic';
  let provider: string | null = null;
  const warnings: string[] = [];

  if (useAi) {
    if (!isAiRecommendationConfigured()) {
      source = 'deterministic_fallback';
      warnings.push('AI assistance is not configured; showing standard recommendations.');
    } else {
      const payload = buildSanitizedPayload(
        items.map((item) => ({
          itemName: item.itemName,
          menuName: selection.menuName,
          rank: item.rank,
          score: item.score,
          sourceSignals: item.sourceSignals,
        })),
        { allergies, dislikes },
      );

      const explanations = await requestAiExplanations(payload);
      if (explanations) {
        source = 'ai_assisted';
        provider = getAiRecommendationProvider();
        for (const item of items) {
          const explanation = explanations.get(item.itemName);
          if (explanation) {
            item.reason = explanation;
            item.aiAssisted = true;
          }
        }
      } else {
        source = 'deterministic_fallback';
        warnings.push('AI assistance was unavailable; showing standard recommendations.');
      }
    }
  }

  const recommendedAt = new Date();
  const inputSummaryJson = {
    useAi: Boolean(useAi),
    historicalOrderCount: history.length,
    ratedItemCount: ratingsByItemName.size,
    hasDefaultMeal: context.defaultItemId !== null,
    allergyCount: allergies.length,
    dislikeCount: dislikes.length,
    officePopularityItemCount: popularityByItemName.size,
    tasteProfileFeatureCount: tasteProfile.weights.size,
    tasteProfileRatedCount: tasteProfile.ratedCount,
  };

  const impression = await prisma.mealRecommendationImpression.create({
    data: {
      foodSelectionId: selection.id,
      officeLocationId,
      actorKey: actor.actorKey,
      actorEmail: actor.actorEmail,
      displayNameSnapshot: actor.displayNameSnapshot,
      source,
      provider,
      recommendedAt,
      inputSummaryJson,
      itemsJson: items as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    impressionId: impression.id,
    foodSelectionId: selection.id,
    source,
    generatedAt: recommendedAt.toISOString(),
    items,
    warnings,
  };
}
