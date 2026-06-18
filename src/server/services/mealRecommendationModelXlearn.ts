import type {
  MealRecommendationModelExample,
  MealRecommendationModelInput,
  MealRecommendationTrainingOptions,
} from './mealRecommendationModel.js';
import type { XLearnFMInstance, XLearnSparseMatrix } from '@wlearn/xlearn';

export interface XlearnMealRecommendationModel {
  featureIndex: Record<string, number>;
  factorDim: number;
  model: XLearnFMInstance;
  modelBytes: Uint8Array;
}

export interface XlearnMealRecommendationTrainingResult {
  model: XlearnMealRecommendationModel;
  trainingSampleCount: number;
}

const DEFAULT_FACTOR_DIM = 8;
const DEFAULT_EPOCHS = 25;
const DEFAULT_LEARNING_RATE = 0.05;
const DEFAULT_L2 = 0.0005;

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

function repeatCount(weight?: number): number {
  const numericWeight = Number.isFinite(weight ?? 1) ? (weight ?? 1) : 1;
  return Math.max(1, Math.min(12, Math.round(numericWeight * 4)));
}

function expandWeightedExamples(
  examples: MealRecommendationModelExample[],
): MealRecommendationModelExample[] {
  const expanded: MealRecommendationModelExample[] = [];
  for (const example of examples) {
    const copies = repeatCount(example.weight);
    for (let index = 0; index < copies; index += 1) {
      expanded.push({
        features: [...example.features],
        label: example.label,
        weight: 1,
      });
    }
  }
  return expanded;
}

function buildSparseMatrix(
  featureIndex: Record<string, number>,
  examples: MealRecommendationModelExample[],
): XLearnSparseMatrix {
  const indices: number[] = [];
  const data: number[] = [];
  const indptr: number[] = [0];
  const cols = Object.keys(featureIndex).length;

  for (const example of examples) {
    const rowIndices = uniqueFeatures(example.features)
      .map((feature) => featureIndex[feature])
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right);

    for (const index of rowIndices) {
      indices.push(index);
      data.push(1);
    }
    indptr.push(indices.length);
  }

  return {
    rows: examples.length,
    cols,
    data: new Float64Array(data),
    indices: new Int32Array(indices),
    indptr: new Int32Array(indptr),
  };
}

function buildSparseInput(
  featureIndex: Record<string, number>,
  features: string[],
): XLearnSparseMatrix {
  return buildSparseMatrix(featureIndex, [{ features, label: 0 }]);
}

async function loadXLearnFM() {
  const module = await import('@wlearn/xlearn');
  return module.default?.XLearnFM ?? module.XLearnFM;
}

export async function trainMealRecommendationModelWithXlearn(
  examples: MealRecommendationModelExample[],
  options: MealRecommendationTrainingOptions = {},
): Promise<XlearnMealRecommendationTrainingResult> {
  const factorDim = Math.max(1, Math.floor(options.factorDim ?? DEFAULT_FACTOR_DIM));
  const epochs = Math.max(1, Math.floor(options.epochs ?? DEFAULT_EPOCHS));
  const learningRate = options.learningRate ?? DEFAULT_LEARNING_RATE;
  const l2 = options.l2 ?? DEFAULT_L2;

  const expanded = expandWeightedExamples(examples);
  const featureIndex = createFeatureIndex(expanded);
  const matrix = buildSparseMatrix(featureIndex, expanded);
  const labels = new Float64Array(expanded.map((example) => example.label));

  const XLearnFM = await loadXLearnFM();
  const model = await XLearnFM.create({
    task: 'classification',
    epoch: epochs,
    k: factorDim,
    lr: learningRate,
    lambda: l2,
    normalize: false,
    opt: 'adagrad',
  });

  model.fit(matrix, labels);
  const modelBytes = model.save();

  return {
    model: {
      featureIndex,
      factorDim,
      model,
      modelBytes,
    },
    trainingSampleCount: expanded.length,
  };
}

export async function scoreMealRecommendationModelWithXlearn(
  model: XlearnMealRecommendationModel,
  input: MealRecommendationModelInput,
): Promise<number> {
  const matrix = buildSparseInput(model.featureIndex, input.features);
  const probabilities = model.model.predictProba(matrix);
  return probabilities.length >= 2 ? probabilities[1] : 0;
}

export async function saveMealRecommendationModelWithXlearn(
  model: XlearnMealRecommendationModel,
): Promise<Uint8Array> {
  model.modelBytes = model.model.save();
  return model.modelBytes;
}

export async function loadMealRecommendationModelWithXlearn(
  modelBytes: Uint8Array,
  featureIndex: Record<string, number>,
  factorDim: number,
): Promise<XlearnMealRecommendationModel> {
  const XLearnFM = await loadXLearnFM();
  const model = await XLearnFM.load(modelBytes);
  return {
    featureIndex,
    factorDim,
    model,
    modelBytes,
  };
}

export function disposeMealRecommendationModelWithXlearn(model: XlearnMealRecommendationModel): void {
  model.model.dispose();
}
