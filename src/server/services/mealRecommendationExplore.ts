import type { Prisma } from '../generated/client/client.js';
import prisma from '../db.js';
import type {
  MealRecommendationItem,
  MealRecommendationResponse,
  MealRecommendationSignal,
} from '../../lib/types.js';
import { createSeededRng, type SeededRngSeed } from './seededRng.js';
import { extractFeatures, featureLabel, loadMenuItemFeatures } from './mealFeatures.js';
import {
  loadRecommendationMenuItems,
  persistMealRecommendationImpression,
  type RecommendationActor,
} from './mealRecommendation.js';
import { DEFAULT_RECOMMENDATION_COUNT } from './userPreferences.js';

type FeatureCounts = {
  positive: number;
  negative: number;
};

type ExploreMenuItem = {
  itemId: string;
  itemName: string;
  description: string | null;
  score: number;
  signals: Set<MealRecommendationSignal>;
  reason: string;
};

const HISTORY_LOOKBACK_LIMIT = 300;
const EPSILON_NO_HISTORY = 1;
const EPSILON_SPARSE_HISTORY = 0.3;
const EPSILON_ESTABLISHED_HISTORY = 0.12;
const DEFAULT_EXPLORATION_RATE = 0.5;
const NOVELTY_BONUS_PER_UNSEEN_FEATURE = 18;
const SAMPLING_SCALE = 40;
const UNCERTAINTY_SCALE = 8;

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase().trim();
}

function normalizePreferenceTerm(term: string): string {
  const normalized = normalizeForMatch(term);
  return normalized.startsWith('ingredient:') ? normalized.slice('ingredient:'.length) : normalized;
}

function normalizeExplorationRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_EXPLORATION_RATE;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeRecommendationCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_RECOMMENDATION_COUNT;
  }

  return Math.max(1, Math.min(10, Math.round(value)));
}

function scaleForExplorationRate(explorationRate: number): number {
  return 0.5 + explorationRate;
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

function findStructuredIngredientMatch(itemFeatures: string[], terms: string[]): string | null {
  const featureSet = new Set(itemFeatures);
  for (const term of terms) {
    const normalized = normalizePreferenceTerm(term);
    if (!normalized) {
      continue;
    }
    if (featureSet.has(`ingredient:${normalized}`)) {
      return term;
    }
  }
  return null;
}

function addFeatureCount(
  counts: Map<string, FeatureCounts>,
  features: string[],
  sentiment: 'positive' | 'negative',
  weight: number,
): void {
  for (const feature of new Set(features)) {
    const current = counts.get(feature) ?? { positive: 0, negative: 0 };
    if (sentiment === 'positive') {
      current.positive += weight;
    } else {
      current.negative += weight;
    }
    counts.set(feature, current);
  }
}

function sampleStandardNormal(rng: ReturnType<typeof createSeededRng>): number {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) {
    u1 = rng.next();
  }
  while (u2 === 0) {
    u2 = rng.next();
  }

  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleGamma(shape: number, rng: ReturnType<typeof createSeededRng>): number {
  if (shape <= 0) {
    throw new RangeError('shape must be greater than 0');
  }

  if (shape < 1) {
    const u = Math.max(rng.next(), Number.EPSILON);
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (;;) {
    const x = sampleStandardNormal(rng);
    let v = 1 + c * x;
    if (v <= 0) {
      continue;
    }
    v *= v * v;

    const u = rng.next();
    if (u < 1 - 0.0331 * Math.pow(x, 4)) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

function sampleBeta(alpha: number, beta: number, rng: ReturnType<typeof createSeededRng>): number {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  const total = x + y;
  if (total <= 0) {
    return 0.5;
  }
  return x / total;
}

function buildExploreReason(
  positiveLabels: string[],
  negativeLabels: string[],
  unseenCount: number,
  observedFeatureCount: number,
): string {
  if (observedFeatureCount === 0) {
    return 'Exploratory pick: there is no history yet, so this is a fresh menu sample.';
  }

  const novelPart =
    unseenCount > 0 ? `newer flavors like ${positiveLabels.slice(0, 2).join(', ') || 'these'}` : '';
  const cautiousPart =
    negativeLabels.length > 0 ? `while avoiding ${negativeLabels.slice(0, 2).join(', ')}` : '';

  if (novelPart && cautiousPart) {
    return `Exploratory pick: it tries ${novelPart} ${cautiousPart}.`;
  }

  if (novelPart) {
    return `Exploratory pick: it leans into ${novelPart}.`;
  }

  if (cautiousPart) {
    return `Exploratory pick: it keeps clear of ${negativeLabels.slice(0, 2).join(', ')}.`;
  }

  return 'Exploratory pick: it samples uncertainty in flavors you have not seen much yet.';
}

function rankExploreItems(scoredItems: ExploreMenuItem[]): MealRecommendationItem[] {
  const sorted = [...scoredItems].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.itemName.localeCompare(right.itemName);
  });

  return sorted.map((item, index) => ({
    itemId: item.itemId,
    itemName: item.itemName,
    rank: index + 1,
    score: Math.max(0, Math.min(100, Math.round(item.score))),
    reason: item.reason,
    sourceSignals: [...item.signals],
    aiAssisted: false,
  }));
}

function applyPreferenceConstraints(
  scoredItems: ExploreMenuItem[],
  items: Array<{ name: string; description: string | null }>,
  preferences: { allergies: string[]; dislikes: string[] },
): ExploreMenuItem[] {
  const constrainedItems: ExploreMenuItem[] = [];

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
      item.score *= 0.5;
      item.signals.add('preference_warning');
      item.reason = `Exploratory pick: it contains ${dislikeHit}, which you marked as a dislike`;
    } else if (item.signals.size > 0) {
      item.signals.add('preference_match');
    }

    constrainedItems.push(item);
  }

  return constrainedItems;
}

async function fetchActorHistory(
  actorKey: string,
  officeLocationId: string,
): Promise<{ itemName: string; rating: number | null }[]> {
  return prisma.foodOrder.findMany({
    where: { actorKey, selection: { officeLocationId } },
    select: { itemName: true, rating: true },
    orderBy: { orderedAt: 'desc' },
    take: HISTORY_LOOKBACK_LIMIT,
  });
}

async function fetchAnticipatedLikes(
  actorKey: string,
  officeLocationId: string,
): Promise<Array<{ itemNameSnapshot: string; sentiment: string; itemIdentityKey: string }>> {
  return prisma.userAnticipatedLike.findMany({
    where: { actorKey, officeLocationId },
    orderBy: { createdAt: 'asc' },
    select: {
      itemNameSnapshot: true,
      sentiment: true,
      itemIdentityKey: true,
    },
  });
}

function buildFeatureCounts(
  history: { itemName: string; rating: number | null }[],
  anticipatedLikes: Array<{ itemNameSnapshot: string; sentiment: string; itemIdentityKey: string }>,
): Map<string, FeatureCounts> {
  const counts = new Map<string, FeatureCounts>();

  for (const order of history) {
    const features = extractFeatures(order.itemName);
    if (order.rating === null) {
      addFeatureCount(counts, features, 'positive', 0.4);
      continue;
    }

    if (order.rating >= 4) {
      addFeatureCount(counts, features, 'positive', 1);
    } else if (order.rating <= 2) {
      addFeatureCount(counts, features, 'negative', 1);
    }
  }

  for (const mark of anticipatedLikes) {
    const features = extractFeatures(mark.itemNameSnapshot);
    addFeatureCount(counts, features, mark.sentiment === 'like' ? 'positive' : 'negative', 0.8);
  }

  return counts;
}

function countObservedFeatures(counts: Map<string, FeatureCounts>): number {
  let observed = 0;
  for (const value of counts.values()) {
    if (value.positive > 0 || value.negative > 0) {
      observed += 1;
    }
  }
  return observed;
}

function scoreExploreItem(
  item: { id: string; name: string; description: string | null },
  features: string[],
  counts: Map<string, FeatureCounts>,
  explorationRate: number,
  rngSeed: SeededRngSeed,
): ExploreMenuItem {
  const rng = createSeededRng(rngSeed);
  const featureEvaluations = features.length > 0 ? features : [item.name];

  let sampledTotal = 0;
  let uncertaintyTotal = 0;
  let unseenCount = 0;
  const positiveLabels: string[] = [];
  const negativeLabels: string[] = [];

  for (const feature of featureEvaluations) {
    const stats = counts.get(feature) ?? { positive: 0, negative: 0 };
    const observed = stats.positive + stats.negative;
    const alpha = 1 + stats.positive;
    const beta = 1 + stats.negative;
    const sample = sampleBeta(alpha, beta, rng.fork(feature));

    sampledTotal += sample;
    uncertaintyTotal += 1 / Math.sqrt(observed + 1);
    if (observed === 0) {
      unseenCount += 1;
    }

    if (sample >= 0.7) {
      positiveLabels.push(featureLabel(feature));
    } else if (sample <= 0.3) {
      negativeLabels.push(featureLabel(feature));
    }
  }

  const sampledAverage = sampledTotal / featureEvaluations.length;
  const uncertaintyAverage = uncertaintyTotal / featureEvaluations.length;
  const noveltyBonus = NOVELTY_BONUS_PER_UNSEEN_FEATURE * scaleForExplorationRate(explorationRate);
  const score =
    50 +
    (sampledAverage - 0.5) * SAMPLING_SCALE +
    unseenCount * noveltyBonus +
    uncertaintyAverage * UNCERTAINTY_SCALE;

  return {
    itemId: item.id,
    itemName: item.name,
    description: item.description,
    score,
    signals: new Set(),
    reason: buildExploreReason(positiveLabels, negativeLabels, unseenCount, countObservedFeatures(counts)),
  };
}

export async function generateExploreRecommendations(
  selectionId: string,
  officeLocationId: string,
  actor: RecommendationActor,
  seed: SeededRngSeed = `${selectionId}:${actor.actorKey}:explore`,
): Promise<MealRecommendationResponse> {
  const { selection, menuItems } = await loadRecommendationMenuItems(selectionId, officeLocationId);

  const [history, anticipatedLikes, userPreference] = await Promise.all([
    fetchActorHistory(actor.actorKey, officeLocationId),
    fetchAnticipatedLikes(actor.actorKey, officeLocationId),
    prisma.userPreference.findUnique({ where: { userKey: actor.actorKey } }),
  ]);

  const allergies = Array.isArray(userPreference?.allergiesJson)
    ? (userPreference!.allergiesJson as unknown[]).filter((entry): entry is string => typeof entry === 'string')
    : [];
  const dislikes = Array.isArray(userPreference?.dislikesJson)
    ? (userPreference!.dislikesJson as unknown[]).filter((entry): entry is string => typeof entry === 'string')
    : [];
  const explorationRate = normalizeExplorationRate(userPreference?.explorationRate);
  const recommendationCount = normalizeRecommendationCount(userPreference?.recommendationCount);

  const featureCounts = buildFeatureCounts(history, anticipatedLikes);
  const observedFeatureCount = countObservedFeatures(featureCounts);
  const exploreRng = createSeededRng(seed);
  const baseEpsilon =
    observedFeatureCount === 0
      ? EPSILON_NO_HISTORY
      : observedFeatureCount < 5
        ? EPSILON_SPARSE_HISTORY
        : EPSILON_ESTABLISHED_HISTORY;
  const epsilon =
    observedFeatureCount === 0
      ? baseEpsilon
      : Math.max(0.02, Math.min(0.95, baseEpsilon * scaleForExplorationRate(explorationRate)));
  const useFallback = observedFeatureCount === 0 || exploreRng.next() < epsilon;

  const menuItemFeatures = await Promise.all(
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

  let scoredItems: ExploreMenuItem[];
  const warnings = ['Exploratory suggestions are intentionally less certain than safe recommendations.'];

  if (useFallback) {
    const shuffled = exploreRng.shuffle(
      menuItems.map((item, index) => ({
        item,
        features: menuItemFeatures[index] ?? [],
      })),
    );

    warnings.push(
      observedFeatureCount === 0
        ? 'There is no history yet, so this is a diverse fallback order.'
        : 'History is still sparse, so this uses a lightweight exploratory fallback.',
    );

    scoredItems = shuffled.map(({ item, features }) => {
      const unseenCount = features.filter((feature) => !featureCounts.has(feature)).length;
      return {
        itemId: item.id,
        itemName: item.name,
        description: item.description,
        score:
          50
          + unseenCount * NOVELTY_BONUS_PER_UNSEEN_FEATURE * scaleForExplorationRate(explorationRate)
          + exploreRng.nextBetween(0, 5),
        signals: new Set(),
        reason: buildExploreReason([], [], unseenCount, observedFeatureCount),
      };
    });
  } else {
    scoredItems = menuItems.map((item, index) =>
      scoreExploreItem(item, menuItemFeatures[index] ?? [], featureCounts, explorationRate, `${seed}:${item.id}`),
    );
  }

  const constrainedItems = applyPreferenceConstraints(scoredItems, menuItems, {
    allergies,
    dislikes,
  });
  const items = rankExploreItems(constrainedItems).slice(0, recommendationCount);

  const recommendedAt = new Date();
  const inputSummaryJson: Prisma.InputJsonValue = {
    seed: String(seed),
    historicalOrderCount: history.length,
    anticipatedLikeCount: anticipatedLikes.length,
    observedFeatureCount,
    epsilon,
    explorationRate,
    recommendationCount,
    fallbackUsed: useFallback,
    allergyCount: allergies.length,
    dislikeCount: dislikes.length,
    candidateCount: menuItems.length,
  } as Prisma.InputJsonValue;

  const impression = await persistMealRecommendationImpression({
    foodSelectionId: selection.id,
    officeLocationId,
    actor,
    source: 'explore',
    provider: null,
    recommenderModelId: null,
    items: items as unknown as Prisma.InputJsonValue,
    warnings,
    inputSummaryJson,
    recommendedAt,
  });

  return {
    impressionId: impression.impressionId,
    foodSelectionId: selection.id,
    source: 'explore',
    generatedAt: impression.recommendedAt,
    items,
    warnings,
  };
}
