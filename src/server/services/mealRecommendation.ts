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
import {
  buildTasteProfile,
  extractFeatures,
  featureLabel,
  loadMenuItemFeatures,
  scoreTasteMatch,
  type TasteProfile,
} from './mealFeatures.js';
import {
  loadMealRecommendationModelForOffice,
  explainMealRecommendationModel,
  scoreMealRecommendationModel,
  type MealRecommendationModelInput,
  type MealRecommendationFeatureContribution,
} from './mealRecommendationModel.js';
import { normalizeMenuItemIdentityKey } from './mealItemIdentity.js';
import { DEFAULT_RECOMMENDATION_COUNT } from './userPreferences.js';

export interface RecommendationActor {
  actorKey: string;
  actorEmail: string | null;
  displayNameSnapshot: string | null;
}

export interface RecommendationImpressionInput {
  foodSelectionId: string | null;
  pollId?: string | null;
  officeLocationId: string;
  actor: RecommendationActor;
  source: MealRecommendationSource;
  provider: string | null;
  recommenderModelId?: string | null;
  items: Prisma.InputJsonValue;
  warnings: string[];
  inputSummaryJson: Prisma.InputJsonValue;
  recommendedAt?: Date;
}

type ActorHistoryEntry = {
  itemName: string;
  itemIdentityKey: string | null;
  rating: number | null;
  orderedAt: Date;
};

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
const LEARNED_RECENCY_WINDOW_DAYS = 21;
const LEARNED_RECENCY_PENALTY_MAX = 10;
const LEARNED_REPEAT_PENALTY = 100;
const UNEVALUATED_LEARNED_MODEL_WARNING =
  'This learned recommendation model has not been evaluated for your office yet, so these suggestions may be premature.';

const DISLIKE_DEMOTION_FACTOR = 0.5;

const COLD_START_SCORE = 50;
const HISTORY_LOOKBACK_LIMIT = 300;

export type ScoredItem = {
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

function normalizePreferenceTerm(term: string): string {
  const normalized = normalizeForMatch(term);
  return normalized.startsWith('ingredient:') ? normalized.slice('ingredient:'.length) : normalized;
}

function findStructuredIngredientMatch(itemFeatures: string[], terms: string[]): string | null {
  const featureSet = new Set(itemFeatures);
  for (const term of terms) {
    const normalized = normalizePreferenceTerm(term);
    if (normalized.length === 0) {
      continue;
    }

    if (featureSet.has(`ingredient:${normalized}`)) {
      return term;
    }
  }

  return null;
}

function resolveHistoryIdentityKey(entry: { itemName: string; itemIdentityKey?: string | null }): string {
  return entry.itemIdentityKey?.trim().length
    ? entry.itemIdentityKey.trim()
    : normalizeMenuItemIdentityKey(entry.itemName);
}

export async function fetchActorHistory(
  actorKey: string,
  officeLocationId: string,
): Promise<ActorHistoryEntry[]> {
  return prisma.foodOrder.findMany({
    where: { actorKey, selection: { officeLocationId } },
    select: {
      itemName: true,
      rating: true,
      orderedAt: true,
      item: {
        select: {
          itemIdentityKey: true,
        },
      },
    },
    orderBy: { orderedAt: 'desc' },
    take: HISTORY_LOOKBACK_LIMIT,
  }).then((orders) =>
    orders.map((order) => ({
      itemName: order.itemName,
      itemIdentityKey: order.item?.itemIdentityKey ?? null,
      rating: order.rating,
      orderedAt: order.orderedAt,
    })),
  );
}

export async function fetchOfficePopularity(officeLocationId: string): Promise<Map<string, number>> {
  const grouped = await prisma.foodOrder.groupBy({
    by: ['itemName'],
    where: { selection: { officeLocationId } },
    _count: { itemName: true },
  });

  return new Map(grouped.map((entry) => [entry.itemName, entry._count.itemName]));
}

export function buildReason(scored: ScoredItem): string {
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

export interface ScoringContext {
  ratingsByItemName: Map<string, { sum: number; count: number }>;
  lastOrderedByItemName: Map<string, Date>;
  popularityByItemName: Map<string, number>;
  defaultItemId: string | null;
  allergies: string[];
  dislikes: string[];
  tasteProfile: TasteProfile;
  tasteProfileReady: boolean;
}

type AnticipatedLikeSeed = {
  itemNameSnapshot: string;
  itemIdentityKey: string;
  sentiment: 'like' | 'dislike';
};

function buildTasteReason(likedLabels: string[], dislikedLabels: string[]): string {
  if (likedLabels.length > 0) {
    return `it matches flavors you tend to like (${likedLabels.slice(0, 3).join(', ')})`;
  }
  return `it leans toward flavors you've rated lower (${dislikedLabels.slice(0, 3).join(', ')})`;
}

function joinFeatureLabels(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? '';
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function buildLearnedTasteReason(contributions: MealRecommendationFeatureContribution[]): string {
  const flavorContributions = contributions.filter(({ feature }) => {
    return !feature.startsWith('user:') && !feature.startsWith('office:');
  });

  const positiveLabels = flavorContributions
    .filter(({ contribution }) => contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .map(({ feature }) => featureLabel(feature));

  const negativeLabels = flavorContributions
    .filter(({ contribution }) => contribution < 0)
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 2)
    .map(({ feature }) => featureLabel(feature));

  if (positiveLabels.length > 0 && negativeLabels.length > 0) {
    return `it lines up with ${joinFeatureLabels(positiveLabels)}, but ${joinFeatureLabels(negativeLabels)} pulls it down`;
  }

  if (positiveLabels.length > 0) {
    return `it lines up with ${joinFeatureLabels(positiveLabels)}`;
  }

  if (negativeLabels.length > 0) {
    return `it is held back by ${joinFeatureLabels(negativeLabels)}`;
  }

  return 'it fits the learned taste profile';
}

export function mergeTasteProfiles(base: TasteProfile, seed: TasteProfile | null): TasteProfile {
  if (!seed) {
    return base;
  }

  const weights = new Map(base.weights);
  for (const [feature, seedWeight] of seed.weights) {
    const currentWeight = weights.get(feature);
    const blendedWeight = currentWeight === undefined ? seedWeight * 0.35 : currentWeight + seedWeight * 0.25;
    weights.set(feature, blendedWeight);
  }

  return {
    weights,
    ratedCount: base.ratedCount + seed.ratedCount,
    orderCount: base.orderCount + seed.orderCount,
  };
}

export async function buildAnticipatedLikeSeed(
  officeLocationId: string,
  actorKey: string,
  history: { itemName: string; itemIdentityKey?: string | null }[],
): Promise<TasteProfile | null> {
  const marks = (await prisma.userAnticipatedLike.findMany({
    where: { officeLocationId, actorKey },
    orderBy: { createdAt: 'asc' },
    select: {
      itemIdentityKey: true,
      itemNameSnapshot: true,
      sentiment: true,
    },
  })) as AnticipatedLikeSeed[];

  if (marks.length === 0) {
    return null;
  }

  const ratedIdentityKeys = new Set(history.map((order) => resolveHistoryIdentityKey(order)));
  const syntheticHistory: Array<{ itemName: string; rating: number }> = [];

  for (const mark of marks) {
    if (ratedIdentityKeys.has(mark.itemIdentityKey)) {
      continue;
    }

    syntheticHistory.push({
      itemName: mark.itemNameSnapshot,
      rating: mark.sentiment === 'like' ? 4 : 2,
    });
  }

  if (syntheticHistory.length === 0) {
    return null;
  }

  return buildTasteProfile(syntheticHistory);
}

function getLatestRecommendedTopItemName(itemsJson: unknown): string | null {
  if (!Array.isArray(itemsJson) || itemsJson.length === 0) {
    return null;
  }

  const first = itemsJson[0];
  if (!first || typeof first !== 'object') {
    return null;
  }

  const record = first as { itemName?: unknown };
  return typeof record.itemName === 'string' && record.itemName.trim().length > 0
    ? record.itemName
    : null;
}

function applyLearnedSafePathAdjustments(
  scoredItems: ScoredItem[],
  history: ActorHistoryEntry[],
  latestRecommendedTopItemName: string | null,
): void {
  const latestRecommendedTopItemIdentityKey = latestRecommendedTopItemName
    ? normalizeMenuItemIdentityKey(latestRecommendedTopItemName)
    : null;
  const orderedAtByIdentityKey = new Map<string, Date>();
  for (const order of history) {
    const identityKey = resolveHistoryIdentityKey(order);
    if (!orderedAtByIdentityKey.has(identityKey)) {
      orderedAtByIdentityKey.set(identityKey, order.orderedAt);
    }
  }

  for (const item of scoredItems) {
    const itemIdentityKey = normalizeMenuItemIdentityKey(item.itemName);
    const lastOrdered = orderedAtByIdentityKey.get(itemIdentityKey);
    if (lastOrdered) {
      const daysAgo = (Date.now() - lastOrdered.getTime()) / (24 * 60 * 60 * 1000);
      if (daysAgo < LEARNED_RECENCY_WINDOW_DAYS) {
        const recencyScale = (LEARNED_RECENCY_WINDOW_DAYS - daysAgo) / LEARNED_RECENCY_WINDOW_DAYS;
        const penalty = Math.round(LEARNED_RECENCY_PENALTY_MAX * recencyScale);
        if (penalty > 0) {
          item.score -= penalty;
          item.signals.add('recency');
          item.reasonTexts.set('recency', "it's been a while since you had this");
        }
      }
    }

    if (latestRecommendedTopItemIdentityKey && normalizeMenuItemIdentityKey(item.itemName) === latestRecommendedTopItemIdentityKey) {
      item.score -= LEARNED_REPEAT_PENALTY;
      item.signals.add('recency');
      item.reasonTexts.set('recency', 'it was your recent top pick, so this run keeps some variety');
    }
  }
}

export function scoreMenuItem(
  item: { id: string; name: string; description: string | null },
  context: ScoringContext,
): ScoredItem {
  const itemIdentityKey = normalizeMenuItemIdentityKey(item.name);
  const scored: ScoredItem = {
    itemId: item.id,
    itemName: item.name,
    description: item.description,
    score: 0,
    signals: new Set(),
    reasonTexts: new Map(),
  };

  const ratingInfo = context.ratingsByItemName.get(itemIdentityKey);
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

  if (context.tasteProfileReady) {
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

  const lastOrdered = context.lastOrderedByItemName.get(itemIdentityKey);
  if (lastOrdered) {
    const daysAgo = (Date.now() - lastOrdered.getTime()) / (24 * 60 * 60 * 1000);
    const avgRating = ratingInfo ? ratingInfo.sum / ratingInfo.count : null;
    if (daysAgo > RECENCY_THRESHOLD_DAYS && (avgRating === null || avgRating >= RATING_HIGH_THRESHOLD - 1)) {
      scored.score += SCORE_RECENCY_BONUS;
      scored.signals.add('recency');
      scored.reasonTexts.set('recency', "it's been a while since you had this");
    }
  }

  return scored;
}

export function applyPreferenceConstraints(
  scoredItems: ScoredItem[],
  items: Array<{ name: string; description: string | null }>,
  preferences: { allergies: string[]; dislikes: string[] },
): ScoredItem[] {
  const constrainedItems: ScoredItem[] = [];

  for (let index = 0; index < scoredItems.length; index += 1) {
    const item = scoredItems[index];
    const sourceItem = items[index];
    const itemFeatures = extractFeatures(sourceItem.name, sourceItem.description);
    const haystack = `${sourceItem.name} ${sourceItem.description ?? ''}`.toLocaleLowerCase();
    const allergyHit =
      findStructuredIngredientMatch(itemFeatures, preferences.allergies) ??
      findMatchingTerm(haystack, preferences.allergies);
    const dislikeHit = allergyHit
      ? null
      : findStructuredIngredientMatch(itemFeatures, preferences.dislikes) ??
        findMatchingTerm(haystack, preferences.dislikes);

    if (allergyHit) {
      continue;
    }

    if (dislikeHit) {
      item.score *= DISLIKE_DEMOTION_FACTOR;
      item.signals.add('preference_warning');
      item.reasonTexts.set(
        'preference_warning',
        `it contains ${dislikeHit}, which you marked as a dislike`,
      );
    } else if (item.signals.size > 0) {
      item.signals.add('preference_match');
      item.reasonTexts.set('preference_match', 'it does not conflict with your ingredient preferences');
    }

    constrainedItems.push(item);
  }

  return constrainedItems;
}

export function applyColdStartFallback(scoredItems: ScoredItem[]): void {
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
}

function getRecommendationCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_RECOMMENDATION_COUNT;
  }

  return Math.max(1, Math.min(10, Math.round(value)));
}

export async function loadRecommendationMenuItems(selectionId: string, officeLocationId: string) {
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
    select: {
      id: true,
      name: true,
      description: true,
      itemIdentityKey: true,
    },
  });

  return { selection, menuItems };
}

export function rankItems(scoredItems: ScoredItem[]): MealRecommendationItem[] {

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

export async function persistMealRecommendationImpression(
  input: RecommendationImpressionInput,
): Promise<{ impressionId: string; recommendedAt: string }> {
  const recommendedAt = input.recommendedAt ?? new Date();
  const impression = await prisma.mealRecommendationImpression.create({
    data: {
      foodSelectionId: input.foodSelectionId,
      pollId: input.pollId ?? null,
      officeLocationId: input.officeLocationId,
      actorKey: input.actor.actorKey,
      actorEmail: input.actor.actorEmail,
      displayNameSnapshot: input.actor.displayNameSnapshot,
      source: input.source,
      provider: input.provider,
      recommenderModelId: input.recommenderModelId ?? null,
      recommendedAt,
      inputSummaryJson: input.inputSummaryJson,
      itemsJson: input.items as unknown as Prisma.InputJsonValue,
    },
  });

  return { impressionId: impression.id, recommendedAt: recommendedAt.toISOString() };
}

async function getLearnedModelEvaluationWarning(
  officeLocationId: string,
  recommenderModelId: string | null,
): Promise<string | null> {
  if (!recommenderModelId) {
    return null;
  }

  const latestResult = await prisma.modelEvaluationResult.findFirst({
    where: { officeLocationId, recommenderModelId },
    orderBy: { evaluatedAt: 'desc' },
    select: { marginPoints: true },
  });

  if (!latestResult) {
    return UNEVALUATED_LEARNED_MODEL_WARNING;
  }

  const margin = Number(latestResult.marginPoints);
  if (!Number.isFinite(margin) || margin < 5) {
    return 'This learned recommendation model has not beaten the baseline for your office yet, so these suggestions may be experimental.';
  }

  return null;
}

export async function generateRecommendations(
  selectionId: string,
  officeLocationId: string,
  actor: RecommendationActor,
  useAi?: boolean,
): Promise<MealRecommendationResponse> {
  const { selection, menuItems } = await loadRecommendationMenuItems(selectionId, officeLocationId);
  const menuId = selection.menuId;
  if (!menuId) {
    throw serviceError('Food selection is not orderable', 400);
  }

  const [history, popularityByItemName, defaultPreference, userPreference] = await Promise.all([
    fetchActorHistory(actor.actorKey, officeLocationId),
    fetchOfficePopularity(officeLocationId),
    prisma.userMenuDefaultPreference.findUnique({
      where: { userKey_menuId: { userKey: actor.actorKey, menuId } },
    }),
    prisma.userPreference.findUnique({ where: { userKey: actor.actorKey } }),
  ]);

  const ratingsByItemIdentityKey = new Map<string, { sum: number; count: number }>();
  const lastOrderedByItemIdentityKey = new Map<string, Date>();
  for (const order of history) {
    const identityKey = resolveHistoryIdentityKey(order);
    if (!lastOrderedByItemIdentityKey.has(identityKey)) {
      lastOrderedByItemIdentityKey.set(identityKey, order.orderedAt);
    }
    if (order.rating !== null) {
      const existing = ratingsByItemIdentityKey.get(identityKey);
      if (existing) {
        existing.sum += order.rating;
        existing.count += 1;
      } else {
        ratingsByItemIdentityKey.set(identityKey, { sum: order.rating, count: 1 });
      }
    }
  }

  const allergies = Array.isArray(userPreference?.allergiesJson)
    ? (userPreference!.allergiesJson as unknown[]).filter((entry): entry is string => typeof entry === 'string')
    : [];
  const dislikes = Array.isArray(userPreference?.dislikesJson)
    ? (userPreference!.dislikesJson as unknown[]).filter((entry): entry is string => typeof entry === 'string')
    : [];
  const recommendationCount = getRecommendationCount(userPreference?.recommendationCount);

  const tasteProfile = buildTasteProfile(history);
  const anticipatedLikeProfile = await buildAnticipatedLikeSeed(officeLocationId, actor.actorKey, history);
  const resolvedTasteProfile = mergeTasteProfiles(tasteProfile, anticipatedLikeProfile);

  const context: ScoringContext = {
    ratingsByItemName: ratingsByItemIdentityKey,
    lastOrderedByItemName: lastOrderedByItemIdentityKey,
    popularityByItemName,
    defaultItemId: defaultPreference?.itemId ?? null,
    allergies,
    dislikes,
    tasteProfile: resolvedTasteProfile,
    tasteProfileReady:
      tasteProfile.ratedCount >= TASTE_PROFILE_MIN_RATINGS ||
      tasteProfile.orderCount >= TASTE_PROFILE_MIN_ORDERS ||
      anticipatedLikeProfile !== null,
  };

  const scoredItems = menuItems.map((item) => scoreMenuItem(item, context));
  const learnedModel = await loadMealRecommendationModelForOffice(officeLocationId);
  const hasEnoughData = context.tasteProfileReady;
  const latestImpression = await prisma.mealRecommendationImpression.findFirst({
    where: {
      officeLocationId,
      actorKey: actor.actorKey,
      foodSelectionId: selection.id,
    },
    orderBy: { recommendedAt: 'desc' },
    select: { itemsJson: true },
  });

  let source: MealRecommendationSource = 'deterministic';
  let provider: string | null = null;
  let learnedModelId: string | null = null;

  if (learnedModel && hasEnoughData) {
    const learnedFeatureSets = await Promise.all(
      menuItems.map((item) =>
        loadMenuItemFeatures({
          menuItemId: item.id,
          officeLocationId,
          itemIdentityKey: item.itemIdentityKey ?? null,
          name: item.name,
          description: item.description,
        }),
      ),
    );

    for (let index = 0; index < scoredItems.length; index += 1) {
      const learnedInput: MealRecommendationModelInput = {
        features: [`user:${actor.actorKey}`, `office:${officeLocationId}`, ...learnedFeatureSets[index]],
      };
      const learnedScore = scoreMealRecommendationModel(learnedModel, learnedInput);
      const learnedReason = buildLearnedTasteReason(
        explainMealRecommendationModel(learnedModel, learnedInput),
      );
      scoredItems[index].score = learnedScore * 100;
      scoredItems[index].signals.add('taste_match');
      scoredItems[index].reasonTexts.set('taste_match', learnedReason);
    }

    applyLearnedSafePathAdjustments(
      scoredItems,
      history,
      getLatestRecommendedTopItemName(latestImpression?.itemsJson ?? null),
    );

    source = 'safe_learned';
    learnedModelId = learnedModel.id;
  }

  applyColdStartFallback(scoredItems);
  const constrainedItems = applyPreferenceConstraints(scoredItems, menuItems, {
    allergies,
    dislikes,
  });
  const items = rankItems(constrainedItems).slice(0, recommendationCount);

  const warnings: string[] = [];
  if (source === 'safe_learned') {
    const learnedWarning = await getLearnedModelEvaluationWarning(officeLocationId, learnedModelId);
    if (learnedWarning) {
      warnings.push(learnedWarning);
    }
  }

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
  const inputSummaryJson: Prisma.InputJsonValue = {
    useAi: Boolean(useAi),
    historicalOrderCount: history.length,
    ratedItemCount: ratingsByItemIdentityKey.size,
    anticipatedLikeCount: anticipatedLikeProfile?.ratedCount ?? 0,
    hasDefaultMeal: context.defaultItemId !== null,
    allergyCount: allergies.length,
    dislikeCount: dislikes.length,
    officePopularityItemCount: popularityByItemName.size,
    tasteProfileFeatureCount: tasteProfile.weights.size,
    tasteProfileRatedCount: tasteProfile.ratedCount,
    seedTasteProfileFeatureCount: anticipatedLikeProfile?.weights.size ?? 0,
    recommendationCount,
  } as Prisma.InputJsonValue;

  const impression = await persistMealRecommendationImpression({
    foodSelectionId: selection.id,
    pollId: null,
    officeLocationId,
    actor,
    source,
    provider,
    recommenderModelId: learnedModelId,
    items: items as unknown as Prisma.InputJsonValue,
    warnings,
    inputSummaryJson,
    recommendedAt,
  });

  return {
    impressionId: impression.impressionId,
    foodSelectionId: selection.id,
    source,
    generatedAt: impression.recommendedAt,
    items,
    warnings,
  };
}
