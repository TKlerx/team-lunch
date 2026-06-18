import prisma from '../db.js';
import { serviceError } from '../routes/routeUtils.js';
import type { Prisma } from '../generated/client/client.js';
import { createSeededRng, type SeededRng } from './seededRng.js';
import { extractFeatures, loadMenuItemFeatures } from './mealFeatures.js';
import { normalizeMenuItemIdentityKey } from './mealItemIdentity.js';
import type { RecommenderModelStatus } from '../../lib/types.js';

export interface MealRecommendationModelExample {
  features: string[];
  label: 0 | 1;
  weight?: number;
}

export interface MealRecommendationModelInput {
  features: string[];
}

export interface MealRecommendationModel {
  seed: number;
  factorDim: number;
  featureIndex: Record<string, number>;
  bias: number;
  linearWeights: number[];
  factorWeights: number[][];
}

export type MealRecommendationModelSerialized = MealRecommendationModel;

export interface MealRecommendationFeatureContribution {
  feature: string;
  contribution: number;
}

export interface MealRecommendationTrainingOptions {
  seed?: number | string | bigint;
  factorDim?: number;
  epochs?: number;
  learningRate?: number;
  l2?: number;
}

export interface MealRecommendationTrainingExample extends MealRecommendationModelExample {
  officeLocationId?: string;
  actorKey?: string;
  itemIdentityKey?: string | null;
  source?: 'order' | 'mark' | 'impression';
  sourceCreatedAt?: Date;
}

export interface MealRecommendationModelBuildOptions {
  officeLocationId?: string;
}

const DEFAULT_FACTOR_DIM = 8;
const DEFAULT_EPOCHS = 25;
const DEFAULT_LEARNING_RATE = 0.05;
const DEFAULT_L2 = 0.0005;

const MODEL_CACHE_TTL_MS = 30_000;

type ModelCacheEntry = {
  version: number;
  model: LoadedMealRecommendationModel;
  loadedAt: number;
};

export interface LoadedMealRecommendationModel extends MealRecommendationModel {
  id: string;
  version: number;
  status: RecommenderModelStatus;
  trainedAt: Date;
  trainingSampleCount: number;
}

type FoodOrderLike = {
  id: string;
  selectionId: string;
  actorKey: string | null;
  itemId: string | null;
  itemName: string;
  rating: number | null;
  orderedAt: Date;
  selection: { officeLocationId: string } | null;
  item: { id: string; itemIdentityKey: string | null; name: string; description: string | null } | null;
};

type UserAnticipatedLikeLike = {
  actorKey: string;
  officeLocationId: string;
  itemIdentityKey: string;
  sentiment: string;
  itemNameSnapshot: string;
  createdAt: Date;
  updatedAt: Date;
  itemIdentity?: { displayNameSnapshot: string; identityKey: string } | null;
};

type MealRecommendationImpressionLike = {
  id: string;
  foodSelectionId: string | null;
  pollId: string | null;
  officeLocationId: string;
  actorKey: string;
  source: string;
  recommendedAt: Date;
  itemsJson: unknown;
  foodSelection: {
    officeLocationId: string;
    orders: Array<{
      id: string;
      selectionId: string;
      actorKey: string | null;
      itemId: string | null;
      itemName: string;
      orderedAt: Date;
      item: { itemIdentityKey: string | null } | null;
    }>;
  } | null;
};

let activeModelCache: ModelCacheEntry | null = null;

function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }

  const z = Math.exp(value);
  return z / (1 + z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function uniqueFeatures(features: string[]): string[] {
  return [...new Set(features.filter((feature) => feature.trim().length > 0))];
}

function createFeatureIndex(examples: MealRecommendationModelExample[]): Record<string, number> {
  const index: Record<string, number> = {};
  for (const example of examples) {
    for (const feature of uniqueFeatures(example.features)) {
      if (index[feature] === undefined) {
        index[feature] = Object.keys(index).length;
      }
    }
  }
  return index;
}

function createMatrix(rows: number, cols: number, fill = 0): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

function createModelFromIndex(
  featureIndex: Record<string, number>,
  factorDim: number,
  seed: number,
): MealRecommendationModel {
  return {
    seed,
    factorDim,
    featureIndex,
    bias: 0,
    linearWeights: Array.from({ length: Object.keys(featureIndex).length }, () => 0),
    factorWeights: createMatrix(Object.keys(featureIndex).length, factorDim, 0),
  };
}

function getFeatureIndices(model: MealRecommendationModel, input: MealRecommendationModelInput): number[] {
  const indices: number[] = [];
  const seen = new Set<number>();
  for (const feature of uniqueFeatures(input.features)) {
    const index = model.featureIndex[feature];
    if (index === undefined || seen.has(index)) {
      continue;
    }
    seen.add(index);
    indices.push(index);
  }
  return indices;
}

function getFeatureNamesByIndex(model: MealRecommendationModel): string[] {
  const featureNamesByIndex = Array.from({ length: Object.keys(model.featureIndex).length }, () => '');
  for (const [feature, index] of Object.entries(model.featureIndex)) {
    featureNamesByIndex[index] = feature;
  }
  return featureNamesByIndex;
}

function scoreRaw(model: MealRecommendationModel, input: MealRecommendationModelInput): number {
  const featureIndices = getFeatureIndices(model, input);
  if (featureIndices.length === 0) {
    return model.bias;
  }

  let score = model.bias;

  for (const index of featureIndices) {
    score += model.linearWeights[index] ?? 0;
  }

  for (let factorIndex = 0; factorIndex < model.factorDim; factorIndex += 1) {
    let sum = 0;
    let sumSquares = 0;
    for (const index of featureIndices) {
      const value = model.factorWeights[index]?.[factorIndex] ?? 0;
      sum += value;
      sumSquares += value * value;
    }
    score += 0.5 * (sum * sum - sumSquares);
  }

  return score;
}

function initializeFactors(
  model: MealRecommendationModel,
  rng: SeededRng,
  scale = 0.01,
): void {
  for (let featureIndex = 0; featureIndex < model.linearWeights.length; featureIndex += 1) {
    model.linearWeights[featureIndex] = rng.nextBetween(-scale, scale);
    for (let factorIndex = 0; factorIndex < model.factorDim; factorIndex += 1) {
      model.factorWeights[featureIndex][factorIndex] = rng.nextBetween(-scale, scale);
    }
  }
}

function updateLinearWeights(
  model: MealRecommendationModel,
  featureIndices: number[],
  error: number,
  learningRate: number,
  l2: number,
): void {
  for (const index of featureIndices) {
    const linear = model.linearWeights[index];
    model.linearWeights[index] = linear + learningRate * (error - l2 * linear);
  }
}

function updateFactorWeights(
  model: MealRecommendationModel,
  featureIndices: number[],
  error: number,
  learningRate: number,
  l2: number,
): void {
  for (let factorIndex = 0; factorIndex < model.factorDim; factorIndex += 1) {
    let sum = 0;
    for (const index of featureIndices) {
      sum += model.factorWeights[index][factorIndex];
    }

    for (const index of featureIndices) {
      const value = model.factorWeights[index][factorIndex];
      const gradient = error * (sum - value) - l2 * value;
      model.factorWeights[index][factorIndex] = value + learningRate * gradient;
    }
  }
}

function trainEpoch(
  model: MealRecommendationModel,
  examples: MealRecommendationModelExample[],
  rng: SeededRng,
  learningRate: number,
  l2: number,
): void {
  const shuffled = rng.shuffle(examples);

  for (const example of shuffled) {
    const featureIndices = getFeatureIndices(model, example);
    if (featureIndices.length === 0) {
      continue;
    }

    const rawScore = scoreRaw(model, example);
    const prediction = sigmoid(rawScore);
    const label = example.label;
    const weight = example.weight ?? 1;
    const error = (label - prediction) * weight;

    model.bias += learningRate * error;
    updateLinearWeights(model, featureIndices, error, learningRate, l2);
    updateFactorWeights(model, featureIndices, error, learningRate, l2);
  }
}

export function trainMealRecommendationModel(
  examples: MealRecommendationModelExample[],
  options: MealRecommendationTrainingOptions = {},
): MealRecommendationModel {
  const factorDim = Math.max(1, Math.floor(options.factorDim ?? DEFAULT_FACTOR_DIM));
  const epochs = Math.max(1, Math.floor(options.epochs ?? DEFAULT_EPOCHS));
  const learningRate = options.learningRate ?? DEFAULT_LEARNING_RATE;
  const l2 = options.l2 ?? DEFAULT_L2;
  const seedValue = options.seed ?? 1;
  const seed = typeof seedValue === 'number' ? seedValue : Number(createSeededRng(seedValue).nextInt(2_000_000_000));

  const featureIndex = createFeatureIndex(examples);
  const model = createModelFromIndex(featureIndex, factorDim, seed);
  const rng = createSeededRng(seedValue);

  initializeFactors(model, rng);

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    trainEpoch(model, examples, rng.fork(`epoch:${epoch}`), learningRate, l2);
  }

  return model;
}

export function scoreMealRecommendationModel(
  model: MealRecommendationModel,
  input: MealRecommendationModelInput,
): number {
  const raw = scoreRaw(model, input);
  return clamp(sigmoid(raw), 0, 1);
}

export function explainMealRecommendationModel(
  model: MealRecommendationModel,
  input: MealRecommendationModelInput,
): MealRecommendationFeatureContribution[] {
  const featureIndices = getFeatureIndices(model, input);
  if (featureIndices.length === 0) {
    return [];
  }

  const sumByFactor = Array.from({ length: model.factorDim }, () => 0);
  for (const index of featureIndices) {
    for (let factorIndex = 0; factorIndex < model.factorDim; factorIndex += 1) {
      sumByFactor[factorIndex] += model.factorWeights[index]?.[factorIndex] ?? 0;
    }
  }

  const featureNamesByIndex = getFeatureNamesByIndex(model);
  return featureIndices.map((index) => {
    const feature = featureNamesByIndex[index] ?? `feature:${index}`;
    const linearContribution = model.linearWeights[index] ?? 0;
    let pairwiseContribution = 0;

    for (let factorIndex = 0; factorIndex < model.factorDim; factorIndex += 1) {
      const value = model.factorWeights[index]?.[factorIndex] ?? 0;
      pairwiseContribution += 0.5 * value * (sumByFactor[factorIndex] - value);
    }

    return {
      feature,
      contribution: linearContribution + pairwiseContribution,
    };
  });
}

export function serializeMealRecommendationModel(model: MealRecommendationModel): MealRecommendationModelSerialized {
  return {
    seed: model.seed,
    factorDim: model.factorDim,
    featureIndex: { ...model.featureIndex },
    bias: model.bias,
    linearWeights: [...model.linearWeights],
    factorWeights: model.factorWeights.map((row) => [...row]),
  };
}

export function deserializeMealRecommendationModel(
  payload: MealRecommendationModelSerialized,
): MealRecommendationModel {
  return {
    seed: payload.seed,
    factorDim: payload.factorDim,
    featureIndex: { ...payload.featureIndex },
    bias: payload.bias,
    linearWeights: [...payload.linearWeights],
    factorWeights: payload.factorWeights.map((row) => [...row]),
  };
}

async function loadItemFeaturesForIdentity(
  officeLocationId: string,
  itemIdentityKey: string,
  itemNameSnapshot: string,
): Promise<string[]> {
  const persisted = await prisma.menuItemFeature.findMany({
    where: {
      officeLocationId,
      itemIdentityKey,
    },
    orderBy: { createdAt: 'asc' },
    select: { tag: true },
  });

  if (persisted.length > 0) {
    return [...new Set(persisted.map((row) => row.tag))];
  }

  return extractFeatures(itemNameSnapshot);
}

function buildExample(
  features: string[],
  label: 0 | 1,
  weight: number,
  metadata: Partial<MealRecommendationTrainingExample> = {},
): MealRecommendationTrainingExample {
  return {
    features,
    label,
    weight,
    ...metadata,
  };
}

function resolveFoodOrderOfficeLocationId(
  order: FoodOrderLike,
  fallbackOfficeLocationId?: string,
): string | null {
  return order.selection?.officeLocationId ?? fallbackOfficeLocationId ?? null;
}

async function loadOrderItemFeatures(
  order: FoodOrderLike,
  officeLocationId: string,
): Promise<string[]> {
  if (!order.item) {
    return extractFeatures(order.itemName);
  }

  return loadMenuItemFeatures({
    menuItemId: order.item.id,
    officeLocationId,
    itemIdentityKey: order.item.itemIdentityKey,
    name: order.item.name,
    description: order.item.description,
  });
}

function buildOrderTrainingExamples(
  features: string[],
  officeLocationId: string,
  rating: number | null,
): MealRecommendationTrainingExample[] {
  if (rating === null) {
    return [buildExample(features, 1, 0.6, { officeLocationId, source: 'order' })];
  }

  if (rating >= 4) {
    return [buildExample(features, 1, 1, { officeLocationId, source: 'order' })];
  }

  if (rating <= 2) {
    return [buildExample(features, 0, 1, { officeLocationId, source: 'order' })];
  }

  return [];
}

async function buildExamplesFromOrders(
  officeLocationId?: string,
): Promise<MealRecommendationTrainingExample[]> {
  const orders = await prisma.foodOrder.findMany({
    where: officeLocationId ? { selection: { officeLocationId } } : {},
    include: {
      selection: { select: { officeLocationId: true } },
      item: { select: { id: true, itemIdentityKey: true, name: true, description: true } },
    },
    orderBy: { orderedAt: 'asc' },
  });

  const examples: MealRecommendationTrainingExample[] = [];

  for (const order of orders as unknown as FoodOrderLike[]) {
    const resolvedOfficeLocationId = resolveFoodOrderOfficeLocationId(order, officeLocationId);
    if (!resolvedOfficeLocationId) {
      continue;
    }

    const itemFeatures = await loadOrderItemFeatures(order, resolvedOfficeLocationId);

    const features = uniqueFeatures([
      `user:${order.actorKey ?? 'unknown'}`,
      `office:${resolvedOfficeLocationId}`,
      ...itemFeatures,
    ]);

    const orderExamples = buildOrderTrainingExamples(features, resolvedOfficeLocationId, order.rating);
    if (orderExamples.length > 0) {
      examples.push(...orderExamples);
    }
  }

  return examples;
}

function resolveRatedIdentityKey(order: {
  actorKey: string | null;
  itemIdentityKey?: string | null;
  itemName: string;
  rating: number | null;
}): string {
  return order.itemIdentityKey?.trim().length
    ? order.itemIdentityKey.trim()
    : normalizeMenuItemIdentityKey(order.itemName);
}

function buildMarkTrainingExample(
  mark: UserAnticipatedLikeLike,
  itemFeatures: string[],
): MealRecommendationTrainingExample {
  const features = uniqueFeatures([`user:${mark.actorKey}`, `office:${mark.officeLocationId}`, ...itemFeatures]);
  const label: 0 | 1 = mark.sentiment === 'like' ? 1 : 0;
  const weight = mark.sentiment === 'like' ? 0.45 : 0.35;
  return buildExample(features, label, weight, {
    officeLocationId: mark.officeLocationId,
    actorKey: mark.actorKey,
    itemIdentityKey: mark.itemIdentityKey,
    source: 'mark',
  });
}

function collectRatedIdentityKeys(
  orders: Array<{
    actorKey: string | null;
    itemName: string;
    rating: number | null;
    item?: { itemIdentityKey: string | null } | null;
  }>,
  resolvedOfficeLocationId: string,
): Set<string> {
  const ratedIdentitiesByActor = new Set<string>();
  for (const order of orders) {
    if (order.rating === null) {
      continue;
    }

    const identityKey = resolveRatedIdentityKey(order);
    ratedIdentitiesByActor.add(`${order.actorKey ?? 'unknown'}:${resolvedOfficeLocationId}:${identityKey}`);
  }

  return ratedIdentitiesByActor;
}

async function buildExamplesFromMarks(
  officeLocationId?: string,
): Promise<MealRecommendationTrainingExample[]> {
  const marks = (await prisma.userAnticipatedLike.findMany({
    where: officeLocationId ? { officeLocationId } : {},
    orderBy: { createdAt: 'asc' },
  })) as unknown as UserAnticipatedLikeLike[];

  if (marks.length === 0) {
    return [];
  }

  const orders = await prisma.foodOrder.findMany({
    where: officeLocationId ? { selection: { officeLocationId } } : {},
    include: {
      item: { select: { itemIdentityKey: true, name: true } },
    },
  });

  const resolvedOfficeLocationId = officeLocationId ?? 'unknown';
  const ratedIdentitiesByActor = collectRatedIdentityKeys(orders, resolvedOfficeLocationId);

  const examples: MealRecommendationTrainingExample[] = [];
  for (const mark of marks) {
    const identityKey = mark.itemIdentityKey;
    if (!identityKey) {
      continue;
    }

    const superseded = ratedIdentitiesByActor.has(`${mark.actorKey}:${mark.officeLocationId}:${identityKey}`);
    if (superseded) {
      continue;
    }

    const itemFeatures = await loadItemFeaturesForIdentity(
      mark.officeLocationId,
      identityKey,
      mark.itemNameSnapshot,
    );
    examples.push(buildMarkTrainingExample(mark, itemFeatures));
  }

  return examples;
}

function resolveImpressionOrderedIdentityKey(order: {
  item?: { itemIdentityKey: string | null } | null;
  itemName: string;
}): string {
  return order.item?.itemIdentityKey?.trim().length
    ? order.item.itemIdentityKey.trim()
    : normalizeMenuItemIdentityKey(order.itemName);
}

function parseImpressionPayloadItem(
  rawItem: unknown,
): { itemId?: string | null; itemName?: string | null } | null {
  if (!rawItem || typeof rawItem !== 'object') {
    return null;
  }

  return rawItem as { itemId?: string | null; itemName?: string | null };
}

function shouldSkipImpressionPayloadItem(
  parsed: { itemId?: string | null; itemName?: string | null } | null,
  orderedIdentityKeys: Set<string>,
): boolean {
  if (!parsed?.itemName) {
    return true;
  }

  const itemIdentityKey = normalizeMenuItemIdentityKey(parsed.itemName);
  return Boolean(itemIdentityKey && orderedIdentityKeys.has(itemIdentityKey));
}

async function loadImpressionPayloadItemFeatures(
  impression: MealRecommendationImpressionLike,
  parsed: { itemId?: string | null; itemName?: string | null },
): Promise<string[]> {
  if (!parsed.itemId) {
    return extractFeatures(parsed.itemName ?? '');
  }

  const persisted = await prisma.menuItem.findUnique({
    where: { id: parsed.itemId },
    select: { id: true, itemIdentityKey: true, name: true, description: true },
  });

  if (!persisted) {
    return extractFeatures(parsed.itemName ?? '');
  }

  return loadMenuItemFeatures({
    menuItemId: persisted.id,
    officeLocationId: impression.officeLocationId,
    itemIdentityKey: persisted.itemIdentityKey,
    name: persisted.name,
    description: persisted.description,
  });
}

function buildImpressionTrainingExample(
  impression: MealRecommendationImpressionLike,
  itemIdentityKey: string | null,
  itemFeatures: string[],
): MealRecommendationTrainingExample {
  const features = uniqueFeatures([
    `user:${impression.actorKey}`,
    `office:${impression.officeLocationId}`,
    ...itemFeatures,
  ]);

  return buildExample(features, 0, 0.2, {
    officeLocationId: impression.officeLocationId,
    actorKey: impression.actorKey,
    itemIdentityKey,
    source: 'impression',
  });
}

async function buildImpressionExamplesForPayload(
  impression: MealRecommendationImpressionLike,
  payload: Array<unknown>,
  orderedIdentityKeys: Set<string>,
): Promise<MealRecommendationTrainingExample[]> {
  const examples: MealRecommendationTrainingExample[] = [];

  for (const rawItem of payload) {
    const parsed = parseImpressionPayloadItem(rawItem);
    if (shouldSkipImpressionPayloadItem(parsed, orderedIdentityKeys)) {
      continue;
    }

    const itemIdentityKey = normalizeMenuItemIdentityKey(parsed?.itemName ?? '');
    const itemFeatures = await loadImpressionPayloadItemFeatures(impression, parsed!);
    examples.push(buildImpressionTrainingExample(impression, itemIdentityKey, itemFeatures));
  }

  return examples;
}

async function buildExamplesFromImpressions(
  officeLocationId?: string,
): Promise<MealRecommendationTrainingExample[]> {
  const impressions = (await prisma.mealRecommendationImpression.findMany({
    where: officeLocationId ? { officeLocationId } : {},
    orderBy: { recommendedAt: 'asc' },
    include: {
      foodSelection: {
        select: {
          officeLocationId: true,
          orders: {
            select: {
              id: true,
              selectionId: true,
              actorKey: true,
              itemId: true,
              itemName: true,
              orderedAt: true,
              item: {
                select: {
                  itemIdentityKey: true,
                },
              },
            },
          },
        },
      },
    },
  })) as unknown as MealRecommendationImpressionLike[];

  const examples: MealRecommendationTrainingExample[] = [];

  for (const impression of impressions) {
    if (impression.foodSelectionId === null || impression.source === 'pre_vote') {
      continue;
    }
    const payload = Array.isArray(impression.itemsJson) ? impression.itemsJson : [];
    if (payload.length === 0) {
      continue;
    }

    const orderedIdentityKeys = new Set<string>(
      (impression.foodSelection?.orders ?? [])
        .filter((order) => order.actorKey === impression.actorKey)
        .map((order) => resolveImpressionOrderedIdentityKey(order)),
    );

    examples.push(
      ...(await buildImpressionExamplesForPayload(
        impression,
        payload,
        orderedIdentityKeys,
      )),
    );
  }

  return examples;
}

export async function buildMealRecommendationTrainingExamples(
  options: MealRecommendationModelBuildOptions = {},
): Promise<MealRecommendationTrainingExample[]> {
  const [orders, marks, impressions] = await Promise.all([
    buildExamplesFromOrders(options.officeLocationId),
    buildExamplesFromMarks(options.officeLocationId),
    buildExamplesFromImpressions(options.officeLocationId),
  ]);

  return [...orders, ...marks, ...impressions];
}

export async function trainMealRecommendationModelFromData(
  options: MealRecommendationModelBuildOptions & MealRecommendationTrainingOptions = {},
): Promise<{ model: MealRecommendationModel; trainingSampleCount: number }> {
  const examples = await buildMealRecommendationTrainingExamples({
    officeLocationId: options.officeLocationId,
  });
  const model = trainMealRecommendationModel(examples, options);
  return { model, trainingSampleCount: examples.length };
}

function toJsonModel(model: MealRecommendationModel): Prisma.JsonObject {
  return serializeMealRecommendationModel(model) as unknown as Prisma.JsonObject;
}

function isJsonObject(payload: Prisma.JsonValue): payload is Prisma.JsonObject {
  return Boolean(payload && typeof payload === 'object' && !Array.isArray(payload));
}

function hasNumericFields(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof record[key] === 'number');
}

function hasArrayFields(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => Array.isArray(record[key]));
}

function isMealRecommendationModelRecord(payload: Prisma.JsonValue): payload is Prisma.JsonObject {
  if (!isJsonObject(payload)) {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return (
    hasNumericFields(record, ['seed', 'factorDim', 'bias'])
    && typeof record.featureIndex === 'object'
    && record.featureIndex !== null
    && !Array.isArray(record.featureIndex)
    && hasArrayFields(record, ['linearWeights', 'factorWeights'])
  );
}

function toNumericArray(values: unknown[]): number[] {
  return values.filter((value): value is number => typeof value === 'number');
}

function fromJsonModel(payload: Prisma.JsonValue): MealRecommendationModel | null {
  if (!isMealRecommendationModelRecord(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;

  const featureIndex = Object.fromEntries(
    Object.entries(record.featureIndex as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
  const linearWeights = toNumericArray(record.linearWeights as unknown[]);
  const factorWeights = (record.factorWeights as unknown[])
    .filter(Array.isArray)
    .map((row) => toNumericArray(row));

  return deserializeMealRecommendationModel({
    seed: record.seed as number,
    factorDim: record.factorDim as number,
    bias: record.bias as number,
    featureIndex,
    linearWeights,
    factorWeights,
  });
}

function isCacheValid(version: number): boolean {
  return Boolean(
    activeModelCache
    && activeModelCache.version === version
    && Date.now() - activeModelCache.loadedAt <= MODEL_CACHE_TTL_MS,
  );
}

export function clearMealRecommendationModelCache(): void {
  activeModelCache = null;
}

export async function saveMealRecommendationModel(
  model: MealRecommendationModel,
  trainingSampleCount: number,
): Promise<LoadedMealRecommendationModel> {
  const nextVersion = (await prisma.recommenderModel.aggregate({ _max: { version: true } }))._max.version ?? 0;
  const version = nextVersion + 1;
  const record = await prisma.recommenderModel.create({
    data: {
      version,
      status: 'trained',
      paramsJson: toJsonModel(model),
      factorDim: model.factorDim,
      trainedAt: new Date(),
      trainingSampleCount,
    },
  });

  const loaded = await loadMealRecommendationModelByVersion(record.version);
  if (!loaded) {
    throw serviceError('Saved recommender model could not be reloaded', 500);
  }

  return loaded;
}

export async function loadMealRecommendationModelByVersion(
  version: number,
): Promise<LoadedMealRecommendationModel | null> {
  const record = await prisma.recommenderModel.findUnique({ where: { version } });
  if (!record) {
    return null;
  }

  const model = fromJsonModel(record.paramsJson);
  if (!model) {
    return null;
  }

  return {
    id: record.id,
    version: record.version,
    status: record.status as RecommenderModelStatus,
    trainedAt: record.trainedAt,
    trainingSampleCount: record.trainingSampleCount,
    ...model,
  };
}

export async function loadLatestMealRecommendationModel(): Promise<LoadedMealRecommendationModel | null> {
  const latest = await prisma.recommenderModel.findFirst({
    orderBy: { version: 'desc' },
  });

  if (!latest) {
    return null;
  }

  return loadMealRecommendationModelByVersion(latest.version);
}

export async function loadActiveMealRecommendationModel(
  activeModelVersion?: number | null,
): Promise<LoadedMealRecommendationModel | null> {
  if (typeof activeModelVersion === 'number' && isCacheValid(activeModelVersion)) {
    return activeModelCache?.model ?? null;
  }

  if (typeof activeModelVersion === 'number') {
    const loaded = await loadMealRecommendationModelByVersion(activeModelVersion);
    if (loaded) {
      activeModelCache = { version: activeModelVersion, model: loaded, loadedAt: Date.now() };
    }
    return loaded;
  }

  const latest = await loadLatestMealRecommendationModel();
  if (latest) {
    activeModelCache = { version: latest.version, model: latest, loadedAt: Date.now() };
  }
  return latest;
}

export async function persistMealRecommendationModel(
  model: MealRecommendationModel,
  trainingSampleCount: number,
): Promise<LoadedMealRecommendationModel> {
  return saveMealRecommendationModel(model, trainingSampleCount);
}

export async function loadMealRecommendationModelForOffice(
  officeLocationId: string,
): Promise<LoadedMealRecommendationModel | null> {
  const setting = await prisma.officeRecommenderSetting.findUnique({
    where: { officeLocationId },
    select: { safeMode: true, activeModelId: true, activeModel: { select: { version: true } } },
  });

  if (!setting || setting.safeMode !== 'learned' || !setting.activeModelId || !setting.activeModel) {
    return null;
  }

  return loadActiveMealRecommendationModel(setting.activeModel.version);
}
