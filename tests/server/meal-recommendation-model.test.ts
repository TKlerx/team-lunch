import { describe, expect, it } from 'vitest';
import {
  deserializeMealRecommendationModel,
  scoreMealRecommendationModel,
  serializeMealRecommendationModel,
  trainMealRecommendationModel,
  type MealRecommendationModelExample,
  type MealRecommendationModelInput,
} from '../../src/server/services/mealRecommendationModel.js';

function example(
  features: string[],
  label: 0 | 1,
  weight = 1,
): MealRecommendationModelExample {
  return { features, label, weight };
}

function scoreInput(features: string[]): MealRecommendationModelInput {
  return { features };
}

describe('mealRecommendationModel', () => {
  it('trains deterministically and round-trips through serialization', () => {
    const seed = 12345;
    const examples = [
      example(['user:alice', 'office:munich', 'ingredient:chicken', 'style:thai'], 1),
      example(['user:alice', 'office:munich', 'ingredient:fish', 'style:sushi'], 0),
      example(['user:bob', 'office:london', 'ingredient:chicken', 'style:thai'], 1),
      example(['user:bob', 'office:london', 'ingredient:fish', 'style:sushi'], 0),
    ];

    const modelA = trainMealRecommendationModel(examples, { seed, factorDim: 4 });
    const modelB = trainMealRecommendationModel(examples, { seed, factorDim: 4 });

    const serializedA = serializeMealRecommendationModel(modelA);
    const serializedB = serializeMealRecommendationModel(modelB);

    expect(serializedA).toEqual(serializedB);

    const restored = deserializeMealRecommendationModel(serializedA);
    const probe = scoreInput(['user:alice', 'office:munich', 'ingredient:chicken', 'style:thai']);
    expect(scoreMealRecommendationModel(restored, probe)).toBeCloseTo(
      scoreMealRecommendationModel(modelA, probe),
      10,
    );
  });

  it('treats office as a feature and lets sparse offices borrow flavor signal from other offices', () => {
    const officeNorth = 'north';
    const officeSouth = 'south';
    const sparseOffice = 'sparse';

    const examples: MealRecommendationModelExample[] = [
      example(['user:alice', `office:${officeNorth}`, 'ingredient:chicken', 'style:thai'], 1),
      example(['user:bob', `office:${officeNorth}`, 'ingredient:chicken', 'style:thai'], 1),
      example(['user:carol', `office:${officeNorth}`, 'ingredient:fish', 'style:sushi'], 0),
      example(['user:dave', `office:${officeSouth}`, 'ingredient:chicken', 'style:thai'], 1),
      example(['user:erin', `office:${officeSouth}`, 'ingredient:fish', 'style:sushi'], 0),
      example(['user:frank', `office:${officeSouth}`, 'ingredient:fish', 'style:sushi'], 0),
    ];

    const model = trainMealRecommendationModel(examples, { seed: 7, factorDim: 6 });
    const serialized = serializeMealRecommendationModel(model);

    expect(Object.keys(serialized.featureIndex)).toEqual(
      expect.arrayContaining([`office:${officeNorth}`, `office:${officeSouth}`]),
    );

    const sparseChicken = scoreMealRecommendationModel(
      model,
      scoreInput([`office:${sparseOffice}`, 'user:grace', 'ingredient:chicken', 'style:thai']),
    );
    const sparseFish = scoreMealRecommendationModel(
      model,
      scoreInput([`office:${sparseOffice}`, 'user:grace', 'ingredient:fish', 'style:sushi']),
    );

    expect(sparseChicken).toBeGreaterThan(sparseFish);
    expect(sparseChicken).toBeGreaterThan(0);
  });
});
