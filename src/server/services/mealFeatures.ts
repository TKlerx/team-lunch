/**
 * Content-based feature extraction and per-user taste profiling.
 *
 * Items are tagged with ingredient and style features derived from their
 * name/description via a curated keyword taxonomy (deterministic, no AI
 * needed). A per-user taste profile is learned from rating history: each
 * rated item nudges the weight of its features by `(rating - 3)`, so the
 * profile captures which flavors/cuisines a person tends to rate high or
 * low. New menu items are then scored by how well their features match
 * that learned profile - this is what makes recommendations genuinely
 * personal rather than just "popular" or "you ordered this exact dish".
 */

import prisma from '../db.js';

export type FeatureTag = string; // e.g. "ingredient:chicken", "style:thai", "course:side"

export const SIDE_DISH_FEATURE_TAG: FeatureTag = 'course:side';

// Curated synonym taxonomy. Keys are canonical feature names; values are
// substring terms (lowercased) matched against item name + description.
// English + common German terms because menus are bilingual in practice.
const INGREDIENT_TERMS: Record<string, string[]> = {
  chicken: ['chicken', 'poulet', 'haehnchen', 'hähnchen', 'hahnchen', 'huhn', 'pollo'],
  beef: ['beef', 'steak', 'rind', 'manzo', 'boeuf'],
  pork: ['pork', 'bacon', 'ham', 'schwein', 'speck'],
  lamb: ['lamb', 'lamm', 'agnello'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'fisch', 'lachs', 'thunfisch'],
  shrimp: ['shrimp', 'prawn', 'scampi', 'garnele', 'gambas'],
  tofu: ['tofu', 'soy'],
  cheese: ['cheese', 'mozzarella', 'cheddar', 'parmesan', 'feta', 'kaese', 'käse', 'kase'],
  mushroom: ['mushroom', 'champignon', 'pilz', 'funghi'],
  egg: ['egg', 'omelette', 'omelet'],
  rice: ['rice', 'reis', 'riso'],
  noodle: ['noodle', 'pasta', 'spaghetti', 'nudel', 'ramen', 'udon', 'penne'],
  potato: ['potato', 'fries', 'kartoffel', 'pommes'],
  peanut: ['peanut', 'erdnuss'],
  cilantro: ['cilantro', 'coriander', 'koriander'],
  garlic: ['garlic', 'knoblauch', 'aglio'],
  tomato: ['tomato', 'tomate', 'pomodoro'],
  bean: ['bean', 'bohne', 'lentil', 'linse'],
  spinach: ['spinach', 'spinat', 'spinaci'],
  avocado: ['avocado'],
};

const STYLE_TERMS: Record<string, string[]> = {
  thai: ['thai', 'pad thai', 'tom yum', 'tom kha'],
  indian: ['indian', 'masala', 'tikka', 'tandoori', 'biryani', 'dal', 'naan'],
  italian: ['italian', 'pizza', 'risotto', 'lasagne', 'lasagna', 'gnocchi'],
  chinese: ['chinese', 'wok', 'chow mein', 'kung pao', 'dim sum', 'szechuan'],
  japanese: ['japanese', 'sushi', 'ramen', 'teriyaki', 'tempura', 'udon', 'bento'],
  mexican: ['mexican', 'taco', 'burrito', 'quesadilla', 'nachos', 'fajita'],
  burger: ['burger', 'cheeseburger', 'hamburger'],
  salad: ['salad', 'salat', 'insalata', 'bowl'],
  soup: ['soup', 'suppe', 'broth', 'zuppa'],
  curry: ['curry', 'korma', 'vindaloo'],
  vegetarian: ['vegetarian', 'veggie', 'vegetarisch'],
  vegan: ['vegan'],
  spicy: ['spicy', 'chili', 'chilli', 'scharf', 'jalapeno', 'piri'],
  grilled: ['grilled', 'gegrillt', 'bbq', 'barbecue', 'grill'],
  fried: ['fried', 'frittiert', 'crispy', 'knusprig', 'tempura'],
  sweet: ['sweet', 'dessert', 'suess', 'süss', 'nachtisch'],
};

const NEUTRAL_RATING = 3;

const SIDE_DISH_EXACT_NAMES = new Set([
  'rice',
  'plain rice',
  'basmati rice',
  'jasmine rice',
  'reis',
  'basmatireis',
  'jasminreis',
  'pommes',
  'fries',
]);

const SIDE_DISH_NAME_PATTERNS: RegExp[] = [
  /\b(extra\s+)?(garlic\s+|butter\s+|cheese\s+)?naan\b/,
  /\b(roti|chapati|paratha|papadum?|poppadom)\b/,
  /\b(side dish|side order|beilage[n]?)\b/,
];

function normalize(value: string): string {
  return value.toLocaleLowerCase();
}

function extractFromTaxonomy(text: string, prefix: string, taxonomy: Record<string, string[]>): FeatureTag[] {
  const tags: FeatureTag[] = [];
  for (const [canonical, terms] of Object.entries(taxonomy)) {
    if (terms.some((term) => text.includes(term))) {
      tags.push(`${prefix}:${canonical}`);
    }
  }
  return tags;
}

function extractCourseFeatures(name: string): FeatureTag[] {
  const normalizedName = normalize(name).trim();
  return SIDE_DISH_EXACT_NAMES.has(normalizedName) ||
    SIDE_DISH_NAME_PATTERNS.some((pattern) => pattern.test(normalizedName))
    ? [SIDE_DISH_FEATURE_TAG]
    : [];
}

export function hasSideDishFeature(tags: FeatureTag[]): boolean {
  return tags.includes(SIDE_DISH_FEATURE_TAG);
}

/**
 * Extracts ingredient + style feature tags from an item's text. Operates on
 * `name` alone or `name + description`; historical orders only retain the
 * name snapshot, so name-derived features are the shared vocabulary between
 * the learned profile and current menu items.
 */
export function extractFeatures(name: string, description?: string | null): FeatureTag[] {
  const text = normalize(`${name} ${description ?? ''}`);
  return [
    ...extractFromTaxonomy(text, 'ingredient', INGREDIENT_TERMS),
    ...extractFromTaxonomy(text, 'style', STYLE_TERMS),
    ...extractCourseFeatures(name),
  ];
}

/** Strips the `ingredient:`/`style:` prefix for human-readable reason text. */
export function featureLabel(tag: FeatureTag): string {
  const idx = tag.indexOf(':');
  return idx >= 0 ? tag.slice(idx + 1) : tag;
}

export interface TasteProfile {
  /**
   * Confidence-weighted preference per feature: positive = liked, negative =
   * disliked. Blends explicit ratings (`rating - 3`, full confidence) with
   * implicit "you ordered it" signal (mild positive, low confidence).
   */
  weights: Map<FeatureTag, number>;
  /** Number of orders that carried an explicit rating. */
  ratedCount: number;
  /** Total orders observed (rated + unrated), i.e. implicit observations. */
  orderCount: number;
}

// Implicit feedback: choosing to order an item is a mild positive vote for
// its features, even without a star rating. Low confidence so a single
// explicit rating still dominates the implicit orders of the same feature.
const IMPLICIT_ORDER_VALUE = 1; // ~ "rating 4" worth of liking
const IMPLICIT_ORDER_CONFIDENCE = 0.4;
const EXPLICIT_RATING_CONFIDENCE = 1;

/**
 * Learns a per-user taste profile from order history. Every order is an
 * implicit positive signal for its features; rated orders additionally carry
 * the explicit `(rating - 3)` value at full confidence. Per feature the
 * profile stores the confidence-weighted mean, so explicit ratings steer the
 * estimate while plentiful unrated orders still build a usable signal in the
 * sparse, rarely-rated, weekly-ordering regime.
 */
export function buildTasteProfile(history: { itemName: string; rating: number | null; itemIdentityKey?: string | null }[]): TasteProfile {
  const weightedSum = new Map<FeatureTag, number>(); // Σ value * confidence
  const confidenceSum = new Map<FeatureTag, number>(); // Σ confidence
  let ratedCount = 0;
  let orderCount = 0;

  for (const order of history) {
    orderCount += 1;
    const rated = order.rating !== null;
    if (rated) ratedCount += 1;
    const value = rated ? order.rating! - NEUTRAL_RATING : IMPLICIT_ORDER_VALUE;
    const confidence = rated ? EXPLICIT_RATING_CONFIDENCE : IMPLICIT_ORDER_CONFIDENCE;

    for (const feature of extractFeatures(order.itemName)) {
      weightedSum.set(feature, (weightedSum.get(feature) ?? 0) + value * confidence);
      confidenceSum.set(feature, (confidenceSum.get(feature) ?? 0) + confidence);
    }
  }

  const weights = new Map<FeatureTag, number>();
  for (const [feature, total] of weightedSum) {
    weights.set(feature, total / (confidenceSum.get(feature) ?? 1));
  }
  return { weights, ratedCount, orderCount };
}

export interface TasteMatch {
  /** Raw summed profile weight across the item's features. */
  score: number;
  likedLabels: string[];
  dislikedLabels: string[];
}

const STRONG_PREFERENCE_THRESHOLD = 0.5;

/**
 * Scores how well an item's features match the user's taste profile. Sums
 * the profile weight of each feature the item carries; unknown features
 * (never rated by the user) contribute nothing.
 */
export function scoreTasteMatch(itemFeatures: FeatureTag[], profile: TasteProfile): TasteMatch {
  let score = 0;
  const likedLabels: string[] = [];
  const dislikedLabels: string[] = [];

  for (const feature of itemFeatures) {
    const weight = profile.weights.get(feature);
    if (weight === undefined || weight === 0) continue;
    score += weight;
    if (weight >= STRONG_PREFERENCE_THRESHOLD) {
      likedLabels.push(featureLabel(feature));
    } else if (weight <= -STRONG_PREFERENCE_THRESHOLD) {
      dislikedLabels.push(featureLabel(feature));
    }
  }

  return { score, likedLabels, dislikedLabels };
}

export interface MenuItemFeatureLookup {
  menuItemId: string;
  officeLocationId: string;
  itemIdentityKey: string | null;
  name: string;
  description: string | null;
}

function uniqueTags(tags: Array<{ tag: string }>): FeatureTag[] {
  const seen = new Set<string>();
  const result: FeatureTag[] = [];
  for (const entry of tags) {
    if (seen.has(entry.tag)) continue;
    seen.add(entry.tag);
    result.push(entry.tag);
  }
  return result;
}

/**
 * Loads the persisted tags for a menu item when they exist. Legacy items that
 * have not been tagged yet fall back to live keyword extraction so the
 * recommender never loses feature coverage while imports are being backfilled.
 */
export async function loadMenuItemFeatures(input: MenuItemFeatureLookup): Promise<FeatureTag[]> {
  const persisted = await prisma.menuItemFeature.findMany({
    where: {
      menuItemId: input.menuItemId,
      officeLocationId: input.officeLocationId,
    },
    orderBy: { createdAt: 'asc' },
    select: { tag: true },
  });

  if (persisted.length > 0) {
    return uniqueTags(persisted);
  }

  if (input.itemIdentityKey) {
    const identityFeatures = await prisma.menuItemFeature.findMany({
      where: {
        officeLocationId: input.officeLocationId,
        itemIdentityKey: input.itemIdentityKey,
      },
      orderBy: { createdAt: 'asc' },
      select: { tag: true },
    });

    if (identityFeatures.length > 0) {
      return uniqueTags(identityFeatures);
    }
  }

  return extractFeatures(input.name, input.description);
}
