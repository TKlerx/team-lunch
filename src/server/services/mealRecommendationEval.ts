import prisma from '../db.js';
import { serviceError } from '../routes/routeUtils.js';
import { extractFeatures, loadMenuItemFeatures } from './mealFeatures.js';
import { loadLatestMealRecommendationModel, loadMealRecommendationModelByVersion, scoreMealRecommendationModel } from './mealRecommendationModel.js';
import type {
  RecommenderEvaluationOfficeResult,
  RecommenderEvaluationRequest,
  RecommenderEvaluationResponse,
} from '../../lib/types.js';

type RecommendationSnapshotItem = {
  itemId?: string | null;
  itemName?: string | null;
};

type EvaluationImpression = {
  id: string;
  officeLocationId: string;
  actorKey: string;
  source: string;
  recommendedAt: Date;
  itemsJson: unknown;
  foodSelection: {
    menuId: string | null;
    orders: Array<{
      actorKey: string | null;
      itemId: string | null;
      itemName: string;
      orderedAt: Date;
    }>;
  } | null;
};

type RankedCandidate = {
  itemId: string | null;
  itemName: string;
  score: number;
};

const HOLDOUT_FRACTION = 0.2;
const BASELINE_LIKE_SOURCES = new Set(['deterministic', 'deterministic_fallback', 'ai_assisted']);

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function parseSnapshotItems(itemsJson: unknown): RecommendationSnapshotItem[] {
  if (!Array.isArray(itemsJson)) {
    return [];
  }

  const parsed = itemsJson
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const record = item as { itemId?: unknown; itemName?: unknown };
      if (typeof record.itemName !== 'string' || record.itemName.trim().length === 0) {
        return null;
      }
      return {
        itemId: typeof record.itemId === 'string' && record.itemId.trim().length > 0 ? record.itemId : null,
        itemName: record.itemName,
      };
    })
    .filter((item): item is { itemId: string | null; itemName: string } => item !== null);

  return parsed;
}

function computeHeldOutCount(totalCount: number): number {
  return Math.max(1, Math.floor(totalCount * HOLDOUT_FRACTION));
}

function getTop3IdentityKeys(items: RecommendationSnapshotItem[]): Set<string> {
  return new Set(
    items.slice(0, 3).map((item) => (item.itemId && item.itemId.trim().length > 0 ? item.itemId.trim() : normalizeKey(item.itemName ?? ''))),
  );
}

function getSnapshotIdentityKey(item: RecommendationSnapshotItem): string {
  if (item.itemId?.trim().length) {
    return item.itemId.trim();
  }
  return normalizeKey(item.itemName ?? '');
}

function getOrderedIdentityKey(item: { itemId: string | null; itemName: string }): string {
  return item.itemId?.trim().length ? item.itemId.trim() : normalizeKey(item.itemName);
}

async function rankModelCandidates(input: {
  modelVersion: number;
  officeLocationId: string;
  actorKey: string;
  menuId: string;
  snapshots: RecommendationSnapshotItem[];
}): Promise<RankedCandidate[]> {
  const model = await loadMealRecommendationModelByVersion(input.modelVersion);
  if (!model) {
    throw serviceError('Model not found', 404);
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { menuId: input.menuId },
    select: { id: true, name: true, description: true, itemIdentityKey: true },
  });

  const byId = new Map(menuItems.map((item) => [item.id, item]));
  const byName = new Map(menuItems.map((item) => [normalizeKey(item.name), item]));

  const ranked = await Promise.all(
    input.snapshots.map(async (snapshot) => {
      const currentItem =
        (snapshot.itemId ? byId.get(snapshot.itemId) : undefined) ??
        byName.get(normalizeKey(snapshot.itemName ?? ''));

      const itemName = currentItem?.name ?? snapshot.itemName ?? '';
      const itemId = currentItem?.id ?? snapshot.itemId ?? null;
      const features = currentItem
        ? await loadMenuItemFeatures({
            menuItemId: currentItem.id,
            officeLocationId: input.officeLocationId,
            itemIdentityKey: currentItem.itemIdentityKey,
            name: currentItem.name,
            description: currentItem.description,
          })
        : extractFeatures(itemName);

      const score = scoreMealRecommendationModel(model, {
        features: [`user:${input.actorKey}`, `office:${input.officeLocationId}`, ...features],
      });

      return {
        itemId,
        itemName,
        score,
      };
    }),
  );

  return ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.itemName.localeCompare(b.itemName);
  });
}

function computeHitRate(hitCount: number, sampleCount: number): number {
  if (sampleCount === 0) {
    return 0;
  }
  return Number((hitCount / sampleCount).toFixed(4));
}

function computeMarginPoints(baselineTop3HitRate: number, modelTop3HitRate: number): number {
  const raw = (modelTop3HitRate - baselineTop3HitRate) * 100;
  return Number(Math.max(-99.9999, Math.min(99.9999, raw)).toFixed(4));
}

async function evaluateOffice(
  officeLocationId: string,
  modelId: string,
  modelVersion: number,
  impressions: EvaluationImpression[],
): Promise<RecommenderEvaluationOfficeResult | null> {
  const eligible = impressions.filter((impression) => BASELINE_LIKE_SOURCES.has(impression.source));
  if (eligible.length === 0) {
    return null;
  }

  const heldOutCount = computeHeldOutCount(eligible.length);
  const heldOut = eligible.slice(-heldOutCount);

  let baselineHits = 0;
  let modelHits = 0;
  let sampleCount = 0;

  for (const impression of heldOut) {
    const snapshots = parseSnapshotItems(impression.itemsJson);
    const foodSelection = impression.foodSelection;
    if (snapshots.length === 0 || !foodSelection?.menuId) {
      continue;
    }

    const actualOrder = foodSelection.orders
      .filter((order) => order.actorKey === impression.actorKey && order.orderedAt >= impression.recommendedAt)
      .sort((a, b) => a.orderedAt.getTime() - b.orderedAt.getTime())[0]
      ?? foodSelection.orders.filter((order) => order.actorKey === impression.actorKey)[0]
      ?? null;

    if (!actualOrder) {
      continue;
    }

    sampleCount += 1;
    const actualKey = getOrderedIdentityKey(actualOrder);
    const baselineTop3 = getTop3IdentityKeys(snapshots);
    if (baselineTop3.has(actualKey)) {
      baselineHits += 1;
    }

    const modelRanking = await rankModelCandidates({
      modelVersion,
      officeLocationId,
      actorKey: impression.actorKey,
      menuId: foodSelection.menuId,
      snapshots,
    });
    const modelTop3 = new Set(modelRanking.slice(0, 3).map((candidate) => candidate.itemId?.trim().length ? candidate.itemId.trim() : normalizeKey(candidate.itemName)));
    if (modelTop3.has(actualKey)) {
      modelHits += 1;
    }
  }

  if (sampleCount === 0) {
    return null;
  }

  const baselineTop3HitRate = computeHitRate(baselineHits, sampleCount);
  const modelTop3HitRate = computeHitRate(modelHits, sampleCount);
  const marginPoints = computeMarginPoints(baselineTop3HitRate, modelTop3HitRate);

  await prisma.modelEvaluationResult.create({
    data: {
      recommenderModelId: modelId,
      officeLocationId,
      baselineTop3HitRate,
      modelTop3HitRate,
      marginPoints,
      sampleCount,
    },
  });

  return {
    officeLocationId,
    baselineTop3HitRate,
    modelTop3HitRate,
    marginPoints,
    sampleCount,
  };
}

export async function evaluateMealRecommendationModel(
  request: RecommenderEvaluationRequest = {},
): Promise<RecommenderEvaluationResponse> {
  const loadedModel =
    typeof request.modelVersion === 'number'
      ? await loadMealRecommendationModelByVersion(request.modelVersion)
      : await loadLatestMealRecommendationModel();

  if (!loadedModel) {
    throw serviceError('No trained recommender model is available', 404);
  }

  const impressions = (await prisma.mealRecommendationImpression.findMany({
    where: {
      source: { in: [...BASELINE_LIKE_SOURCES] },
      foodSelectionId: { not: null },
    },
    orderBy: [{ officeLocationId: 'asc' }, { recommendedAt: 'asc' }],
    include: {
      foodSelection: {
        select: {
          menuId: true,
          orders: {
            select: {
              actorKey: true,
              itemId: true,
              itemName: true,
              orderedAt: true,
            },
          },
        },
      },
    },
  })) as unknown as EvaluationImpression[];

  const impressionsByOffice = new Map<string, EvaluationImpression[]>();
  for (const impression of impressions) {
    const list = impressionsByOffice.get(impression.officeLocationId) ?? [];
    list.push(impression);
    impressionsByOffice.set(impression.officeLocationId, list);
  }

  const results: RecommenderEvaluationOfficeResult[] = [];
  for (const [officeLocationId, officeImpressions] of impressionsByOffice) {
    const result = await evaluateOffice(officeLocationId, loadedModel.id, loadedModel.version, officeImpressions);
    if (result) {
      results.push(result);
    }
  }

  return { results };
}
