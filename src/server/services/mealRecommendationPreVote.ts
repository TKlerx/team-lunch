import type { Prisma } from '../generated/client/client.js';
import prisma from '../db.js';
import { serviceError } from '../routes/routeUtils.js';
import type {
  MealRecommendationPreVoteItem,
  MealRecommendationPreVoteResponse,
} from '../../lib/types.js';
import {
  applyColdStartFallback,
  applyPreferenceConstraints,
  buildAnticipatedLikeSeed,
  buildLearnedTasteReason,
  buildReason,
  fetchActorHistory,
  fetchOfficePopularity,
  mergeTasteProfiles,
  persistMealRecommendationImpression,
  scoreMenuItem,
  type RecommendationActor,
  type ScoredItem,
  type ScoringContext,
} from './mealRecommendation.js';
import { buildTasteProfile, hasNonMealCourseFeature, loadMenuItemFeatures } from './mealFeatures.js';
import {
  explainMealRecommendationModel,
  loadMealRecommendationModelForOffice,
  scoreMealRecommendationModel,
  type MealRecommendationModelInput,
} from './mealRecommendationModel.js';
import { normalizeMenuItemIdentityKey } from './mealItemIdentity.js';

type PreVoteCandidateItem = {
  menuId: string;
  menuName: string;
  itemId: string;
  itemName: string;
  description: string | null;
  itemIdentityKey: string | null;
};

type PreVoteCandidateScope = {
  pollId: string | null;
  items: PreVoteCandidateItem[];
};

const DEFAULT_PRE_VOTE_LIMIT = 5;
const MAX_PRE_VOTE_LIMIT = 10;

function parseLimit(limit?: number): number {
  if (limit === undefined || limit === null) {
    return DEFAULT_PRE_VOTE_LIMIT;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PRE_VOTE_LIMIT) {
    throw serviceError(`Limit must be an integer between 1 and ${MAX_PRE_VOTE_LIMIT}`, 400);
  }

  return limit;
}

async function loadCurrentOfficeMenus(officeLocationId: string): Promise<Array<{
  id: string;
  name: string;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    itemIdentityKey: string | null;
  }>;
}>> {
  return prisma.menu.findMany({
    where: {
      officeLocationId,
      items: { some: {} },
    },
    include: {
      items: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          itemIdentityKey: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });
}

async function resolvePreVoteScope(
  officeLocationId: string,
  pollId?: string,
): Promise<PreVoteCandidateScope> {
  if (pollId) {
    const poll = await prisma.poll.findFirst({
      where: {
        id: pollId,
        officeLocationId,
      },
      include: { excludedMenus: true },
    });

    if (!poll) {
      throw serviceError('Poll not found', 404);
    }
    if (!['active', 'tied'].includes(poll.status)) {
      throw serviceError('Poll is not active', 400);
    }

    const excludedMenuIds = new Set(poll.excludedMenus.map((entry) => entry.menuId));
    const menus = (await loadCurrentOfficeMenus(officeLocationId)).filter(
      (menu) => !excludedMenuIds.has(menu.id),
    );

    return {
      pollId: poll.id,
      items: menus.flatMap((menu) =>
        menu.items.map((item) => ({
          menuId: menu.id,
          menuName: menu.name,
          itemId: item.id,
          itemName: item.name,
          description: item.description,
          itemIdentityKey: item.itemIdentityKey,
        })),
      ),
    };
  }

  const activePoll = await prisma.poll.findFirst({
    where: {
      officeLocationId,
      status: { in: ['active', 'tied'] },
    },
    include: { excludedMenus: true },
    orderBy: { createdAt: 'desc' },
  });

  if (activePoll) {
    const excludedMenuIds = new Set(activePoll.excludedMenus.map((entry) => entry.menuId));
    const menus = (await loadCurrentOfficeMenus(officeLocationId)).filter(
      (menu) => !excludedMenuIds.has(menu.id),
    );

    return {
      pollId: activePoll.id,
      items: menus.flatMap((menu) =>
        menu.items.map((item) => ({
          menuId: menu.id,
          menuName: menu.name,
          itemId: item.id,
          itemName: item.name,
          description: item.description,
          itemIdentityKey: item.itemIdentityKey,
        })),
      ),
    };
  }

  const menus = await loadCurrentOfficeMenus(officeLocationId);
  return {
    pollId: null,
    items: menus.flatMap((menu) =>
      menu.items.map((item) => ({
        menuId: menu.id,
        menuName: menu.name,
        itemId: item.id,
        itemName: item.name,
        description: item.description,
        itemIdentityKey: item.itemIdentityKey,
      })),
    ),
  };
}

async function filterSideDishPreVoteCandidates(
  items: PreVoteCandidateItem[],
  officeLocationId: string,
): Promise<PreVoteCandidateItem[]> {
  const filteredItems: PreVoteCandidateItem[] = [];

  for (const item of items) {
    const features = await loadMenuItemFeatures({
      menuItemId: item.itemId,
      officeLocationId,
      itemIdentityKey: item.itemIdentityKey,
      name: item.itemName,
      description: item.description,
    });
    if (!hasNonMealCourseFeature(features)) {
      filteredItems.push(item);
    }
  }

  return filteredItems.length > 0 ? filteredItems : items;
}

function buildDefaultItemIdsByMenuId(
  defaults: Array<{ menuId: string; itemId: string | null }>,
): Map<string, string | null> {
  return new Map(defaults.map((entry) => [entry.menuId, entry.itemId]));
}

function rankPreVoteItems(scoredItems: Array<{ item: PreVoteCandidateItem; scored: ScoredItem }>): MealRecommendationPreVoteItem[] {
  const sorted = [...scoredItems].sort((left, right) => {
    if (right.scored.score !== left.scored.score) {
      return right.scored.score - left.scored.score;
    }
    if (left.item.menuName !== right.item.menuName) {
      return left.item.menuName.localeCompare(right.item.menuName);
    }
    return left.item.itemName.localeCompare(right.item.itemName);
  });

  return sorted.map((entry, index) => ({
    menuId: entry.item.menuId,
    menuName: entry.item.menuName,
    itemId: entry.item.itemId,
    itemName: entry.item.itemName,
    rank: index + 1,
    score: Math.max(0, Math.min(100, Math.round(entry.scored.score))),
    reason: buildReason(entry.scored),
    sourceSignals: [...entry.scored.signals],
    aiAssisted: false,
  }));
}

export async function generatePreVoteRecommendations(
  officeLocationId: string,
  actor: RecommendationActor,
  options: { pollId?: string; limit?: number } = {},
): Promise<MealRecommendationPreVoteResponse> {
  const limit = parseLimit(options.limit);
  const resolvedScope = await resolvePreVoteScope(officeLocationId, options.pollId);
  const scope = {
    ...resolvedScope,
    items: await filterSideDishPreVoteCandidates(resolvedScope.items, officeLocationId),
  };

  if (scope.items.length === 0) {
    return {
      source: 'pre_vote',
      pollId: scope.pollId ?? undefined,
      items: [],
      warnings: ['No candidate menus were available for pre-vote recommendations.'],
    };
  }

  const [history, popularityByItemName, userPreference, learnedModel, defaults] = await Promise.all([
    fetchActorHistory(actor.actorKey, officeLocationId),
    fetchOfficePopularity(officeLocationId),
    prisma.userPreference.findUnique({ where: { userKey: actor.actorKey } }),
    loadMealRecommendationModelForOffice(officeLocationId),
    prisma.userMenuDefaultPreference.findMany({
      where: {
        userKey: actor.actorKey,
        menuId: { in: [...new Set(scope.items.map((item) => item.menuId))] },
      },
      select: { menuId: true, itemId: true },
    }),
  ]);

  const anticipatedLikeProfile = await buildAnticipatedLikeSeed(officeLocationId, actor.actorKey, history);
  const defaultItemIdsByMenuId = buildDefaultItemIdsByMenuId(defaults);
  const ratingsByItemIdentityKey = new Map<string, { sum: number; count: number }>();
  const lastOrderedByItemIdentityKey = new Map<string, Date>();

  for (const order of history) {
    const identityKey = order.itemIdentityKey?.trim().length
      ? order.itemIdentityKey.trim()
      : normalizeMenuItemIdentityKey(order.itemName);
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

  const tasteProfile = buildTasteProfile(history);
  const resolvedTasteProfile = mergeTasteProfiles(tasteProfile, anticipatedLikeProfile);
  const tasteProfileReady =
    tasteProfile.ratedCount >= 2 || tasteProfile.orderCount >= 4 || anticipatedLikeProfile !== null;

  const baseContext: ScoringContext = {
    ratingsByItemName: ratingsByItemIdentityKey,
    lastOrderedByItemName: lastOrderedByItemIdentityKey,
    popularityByItemName,
    defaultItemId: null,
    allergies,
    dislikes,
    tasteProfile: resolvedTasteProfile,
    tasteProfileReady,
  };

  const candidateScored = scope.items.map((item) => {
    const context = {
      ...baseContext,
      defaultItemId: defaultItemIdsByMenuId.get(item.menuId) ?? null,
    };
    return {
      item,
      scored: scoreMenuItem(
        { id: item.itemId, name: item.itemName, description: item.description },
        context,
      ),
    };
  });

  const learnedFeatureSets = learnedModel && tasteProfileReady
    ? await Promise.all(
        scope.items.map((item) =>
          loadMenuItemFeatures({
            menuItemId: item.itemId,
            officeLocationId,
            itemIdentityKey: item.itemIdentityKey,
            name: item.itemName,
            description: item.description,
          }),
        ),
      )
    : null;

  let recommenderModelId: string | null = null;
  if (learnedModel && tasteProfileReady && learnedFeatureSets) {
    for (let index = 0; index < candidateScored.length; index += 1) {
      const learnedInput: MealRecommendationModelInput = {
        features: [`user:${actor.actorKey}`, `office:${officeLocationId}`, ...learnedFeatureSets[index]],
      };
      candidateScored[index].scored.score =
        scoreMealRecommendationModel(learnedModel, learnedInput) * 100;
      candidateScored[index].scored.signals.add('taste_match');
      candidateScored[index].scored.reasonTexts.set(
        'taste_match',
        buildLearnedTasteReason(explainMealRecommendationModel(learnedModel, learnedInput)),
      );
    }
    recommenderModelId = learnedModel.id;
  }

  applyColdStartFallback(candidateScored.map((entry) => entry.scored));
  const constrainedScored = applyPreferenceConstraints(
    candidateScored.map((entry) => entry.scored),
    scope.items.map((item) => ({ name: item.itemName, description: item.description })),
    { allergies, dislikes },
  );

  const constrainedEntries = candidateScored.filter((entry) =>
    constrainedScored.includes(entry.scored),
  );

  let warnings: string[] = [];
  if (!tasteProfileReady) {
    warnings = ['There is not enough history yet, so these suggestions use the deterministic baseline.'];
  }

  const items = rankPreVoteItems(constrainedEntries).slice(0, limit).map((item, index) => ({
    ...item,
    rank: index + 1,
  }));

  const inputSummaryJson: Prisma.InputJsonValue = {
    pollId: scope.pollId ?? null,
    historicalOrderCount: history.length,
    ratedItemCount: ratingsByItemIdentityKey.size,
    anticipatedLikeCount: anticipatedLikeProfile?.ratedCount ?? 0,
    allergyCount: allergies.length,
    dislikeCount: dislikes.length,
    candidateMenuCount: new Set(scope.items.map((item) => item.menuId)).size,
    candidateItemCount: scope.items.length,
    tasteProfileFeatureCount: tasteProfile.weights.size,
    tasteProfileRatedCount: tasteProfile.ratedCount,
    seedTasteProfileFeatureCount: anticipatedLikeProfile?.weights.size ?? 0,
    usedLearnedModel: recommenderModelId !== null,
    limit,
  } as Prisma.InputJsonValue;

  await persistMealRecommendationImpression({
    foodSelectionId: null,
    pollId: scope.pollId,
    officeLocationId,
    actor,
    source: 'pre_vote',
    provider: null,
    recommenderModelId,
    items: items as unknown as Prisma.InputJsonValue,
    warnings,
    inputSummaryJson,
    recommendedAt: new Date(),
  });

  return {
    source: 'pre_vote',
    pollId: scope.pollId ?? undefined,
    items,
    warnings,
  };
}
