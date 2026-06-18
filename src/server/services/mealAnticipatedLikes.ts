import prisma from '../db.js';
import { serviceError } from '../routes/routeUtils.js';
import { loadMenuItemFeatures } from './mealFeatures.js';
import { normalizeMenuItemIdentityKey } from './mealItemIdentity.js';
import type {
  MealAnticipatedLikeSentiment,
  MealRecommendationMarkDeleteResponse,
  MealRecommendationMarkListResponse,
  MealRecommendationMarkResponse,
  MealRecommendationOnboardingCandidate,
  MealRecommendationOnboardingCandidatesResponse,
} from '../../lib/types.js';

type AuthenticatedActor = {
  actorKey: string;
  actorEmail: string;
  displayNameSnapshot: string;
};

type SelectionScope = {
  id: string;
  menuId: string | null;
  menuName: string;
};

type SelectionMenuItem = {
  id: string;
  menuId: string;
  name: string;
  description: string | null;
  itemIdentityKey: string | null;
  menu: {
    id: string;
    name: string;
  };
};

type CandidateSource = MealRecommendationOnboardingCandidate & {
  menuId: string;
  menuName: string;
  baseScore: number;
};

const ONBOARDING_CANDIDATE_LIMIT = 6;

function normalizeIdentityKey(itemName: string, itemIdentityKey: string | null): string {
  const resolved = itemIdentityKey?.trim() ?? '';
  if (resolved.length > 0) {
    return resolved;
  }

  const fallback = normalizeMenuItemIdentityKey(itemName);
  if (!fallback) {
    throw serviceError('Menu item name must contain at least one alphanumeric character', 400);
  }

  return fallback;
}

async function resolveSelection(selectionId: string, officeLocationId: string): Promise<SelectionScope> {
  const selection = await prisma.foodSelection.findFirst({
    where: { id: selectionId, officeLocationId },
    select: { id: true, menuId: true, menuName: true },
  });

  if (!selection) {
    throw serviceError('Food selection not found', 404);
  }

  return selection;
}

async function resolveSelectionMenuItem(
  selectionId: string,
  itemId: string,
  officeLocationId: string,
): Promise<{ selection: SelectionScope; item: SelectionMenuItem }> {
  const selection = await resolveSelection(selectionId, officeLocationId);
  if (!selection.menuId) {
    throw serviceError('Food selection is not orderable', 400);
  }

  const item = await prisma.menuItem.findFirst({
    where: {
      id: itemId,
      menuId: selection.menuId,
      menu: { officeLocationId },
    },
    select: {
      id: true,
      menuId: true,
      name: true,
      description: true,
      itemIdentityKey: true,
      menu: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!item) {
    throw serviceError('Menu item not found', 404);
  }

  return { selection, item };
}

async function loadSelectionMenuItems(
  selectionId: string,
  officeLocationId: string,
): Promise<{ selection: SelectionScope; items: SelectionMenuItem[] }> {
  const selection = await resolveSelection(selectionId, officeLocationId);
  if (!selection.menuId) {
    throw serviceError('Food selection is not orderable', 400);
  }

  const items = await prisma.menuItem.findMany({
    where: { menuId: selection.menuId, menu: { officeLocationId } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      menuId: true,
      name: true,
      description: true,
      itemIdentityKey: true,
      menu: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return { selection, items };
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.filter((tag) => tag.trim().length > 0))];
}

function compareCandidateSources(left: CandidateSource, right: CandidateSource): number {
  const menuComparison = left.menuName.localeCompare(right.menuName);
  if (menuComparison !== 0) {
    return menuComparison;
  }

  const nameComparison = left.itemName.localeCompare(right.itemName);
  if (nameComparison !== 0) {
    return nameComparison;
  }

  return left.itemId.localeCompare(right.itemId);
}

function scoreDiversityBase(tags: string[], tagFrequency: Map<string, number>): number {
  if (tags.length === 0) {
    return 0;
  }

  return tags.reduce((sum, tag) => sum + 1 / Math.max(1, tagFrequency.get(tag) ?? 0), 0);
}

function pickDiverseCandidates(candidates: CandidateSource[], limit: number): CandidateSource[] {
  const remaining = [...candidates];
  const selected: CandidateSource[] = [];
  const selectedTags = new Set<string>();
  const selectedMenus = new Set<string>();

  while (selected.length < limit && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const overlap = candidate.tags.filter((tag) => selectedTags.has(tag)).length;
      const sameMenuPenalty = selectedMenus.has(candidate.menuId) ? 0.35 : 0;
      const adjustedScore = candidate.baseScore - overlap * 1.5 - sameMenuPenalty;

      if (
        adjustedScore > bestScore
        || (
          adjustedScore === bestScore
          && compareCandidateSources(candidate, remaining[bestIndex]) < 0
        )
      ) {
        bestIndex = index;
        bestScore = adjustedScore;
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    selectedMenus.add(chosen.menuId);
    for (const tag of chosen.tags) {
      selectedTags.add(tag);
    }
  }

  return selected;
}

export async function upsertMealAnticipatedLike(
  selectionId: string,
  itemId: string,
  sentiment: MealAnticipatedLikeSentiment,
  officeLocationId: string,
  actor: AuthenticatedActor,
): Promise<MealRecommendationMarkResponse> {
  const { item } = await resolveSelectionMenuItem(selectionId, itemId, officeLocationId);
  const itemIdentityKey = normalizeIdentityKey(item.name, item.itemIdentityKey);

  await prisma.userAnticipatedLike.upsert({
    where: {
      actorKey_officeLocationId_itemIdentityKey: {
        actorKey: actor.actorKey,
        officeLocationId,
        itemIdentityKey,
      },
    },
    create: {
      actorKey: actor.actorKey,
      actorEmail: actor.actorEmail,
      displayNameSnapshot: actor.displayNameSnapshot,
      officeLocationId,
      itemIdentityKey,
      itemNameSnapshot: item.name,
      sentiment,
    },
    update: {
      actorEmail: actor.actorEmail,
      displayNameSnapshot: actor.displayNameSnapshot,
      itemNameSnapshot: item.name,
      sentiment,
    },
  });

  return {
    itemIdentityKey,
    sentiment,
  };
}

export async function deleteMealAnticipatedLike(
  selectionId: string,
  itemId: string,
  officeLocationId: string,
  actor: AuthenticatedActor,
): Promise<MealRecommendationMarkDeleteResponse> {
  const { item } = await resolveSelectionMenuItem(selectionId, itemId, officeLocationId);
  const itemIdentityKey = normalizeIdentityKey(item.name, item.itemIdentityKey);

  await prisma.userAnticipatedLike.deleteMany({
    where: {
      actorKey: actor.actorKey,
      officeLocationId,
      itemIdentityKey,
    },
  });

  return { removed: true };
}

export async function listMealAnticipatedLikes(
  selectionId: string,
  officeLocationId: string,
  actor: AuthenticatedActor,
): Promise<MealRecommendationMarkListResponse> {
  const { items } = await loadSelectionMenuItems(selectionId, officeLocationId);
  const itemsByIdentity = new Map<string, SelectionMenuItem>();
  for (const item of items) {
    const itemIdentityKey = normalizeIdentityKey(item.name, item.itemIdentityKey);
    if (!itemsByIdentity.has(itemIdentityKey)) {
      itemsByIdentity.set(itemIdentityKey, item);
    }
  }

  const marks = await prisma.userAnticipatedLike.findMany({
    where: {
      actorKey: actor.actorKey,
      officeLocationId,
      itemIdentityKey: {
        in: [...itemsByIdentity.keys()],
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  const marksByIdentity = new Map(marks.map((mark) => [mark.itemIdentityKey, mark]));
  const result = [...itemsByIdentity.entries()]
    .map(([itemIdentityKey, item]) => {
      const mark = marksByIdentity.get(itemIdentityKey);
      if (!mark) {
        return null;
      }

      return {
        itemId: item.id,
        itemIdentityKey,
        sentiment: mark.sentiment as MealAnticipatedLikeSentiment,
      };
    })
    .filter((entry): entry is { itemId: string; itemIdentityKey: string; sentiment: MealAnticipatedLikeSentiment } => entry !== null)
    .sort((left, right) => left.itemId.localeCompare(right.itemId));

  return { marks: result };
}

export async function listMealRecommendationOnboardingCandidates(
  officeLocationId: string,
  actor?: { actorKey: string } | null,
): Promise<MealRecommendationOnboardingCandidatesResponse> {
  const markedIdentityKeys = actor
    ? new Set(
        (
          await prisma.userAnticipatedLike.findMany({
            where: {
              officeLocationId,
              actorKey: actor.actorKey,
            },
            select: { itemIdentityKey: true },
          })
        ).map((row) => row.itemIdentityKey),
      )
    : new Set<string>();

  const rawItems = await prisma.menuItem.findMany({
    where: {
      menu: {
        officeLocationId,
      },
    },
    orderBy: [{ menu: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      itemIdentityKey: true,
      menuId: true,
      menu: {
        select: {
          name: true,
        },
      },
    },
  });

  const sources = await Promise.all(
    rawItems
      .map(async (item): Promise<CandidateSource | null> => {
        const itemIdentityKey = normalizeIdentityKey(item.name, item.itemIdentityKey);
        if (markedIdentityKeys.has(itemIdentityKey)) {
          return null;
        }

        const tags = uniqueTags(
          await loadMenuItemFeatures({
            menuItemId: item.id,
            officeLocationId,
            itemIdentityKey,
            name: item.name,
            description: item.description,
          }),
        );

        return {
          itemId: item.id,
          itemName: item.name,
          itemIdentityKey,
          tags,
          menuId: item.menuId,
          menuName: item.menu.name,
          baseScore: 0,
        };
      }),
  );

  const dedupedByIdentity = new Map<string, CandidateSource>();
  for (const source of sources) {
    if (!source) {
      continue;
    }

    const existing = dedupedByIdentity.get(source.itemIdentityKey);
    if (!existing || compareCandidateSources(source, existing) < 0) {
      dedupedByIdentity.set(source.itemIdentityKey, source);
    }
  }

  const deduped = [...dedupedByIdentity.values()];
  const tagFrequency = new Map<string, number>();
  for (const item of deduped) {
    for (const tag of item.tags) {
      tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1);
    }
  }

  const scored = deduped.map((item) => ({
    ...item,
    baseScore: scoreDiversityBase(item.tags, tagFrequency),
  }));

  const selected = pickDiverseCandidates(scored, ONBOARDING_CANDIDATE_LIMIT).map<MealRecommendationOnboardingCandidate>(
    (item) => ({
      itemId: item.itemId,
      itemName: item.itemName,
      itemIdentityKey: item.itemIdentityKey,
      tags: item.tags,
    }),
  );

  return { candidates: selected };
}
