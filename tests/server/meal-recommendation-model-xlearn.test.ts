import { describe, it, expect } from 'vitest';
import { trainMealRecommendationModel, scoreMealRecommendationModel } from '../../src/server/services/mealRecommendationModel.js';
import {
  disposeMealRecommendationModelWithXlearn,
  loadMealRecommendationModelWithXlearn,
  saveMealRecommendationModelWithXlearn,
  scoreMealRecommendationModelWithXlearn,
  trainMealRecommendationModelWithXlearn,
} from '../../src/server/services/mealRecommendationModelXlearn.js';

describe('Meal recommendation model xlearn spike', () => {
  it('trains and scores the same synthetic fixture as the in-repo FM', async () => {
    const examples = [
      {
        features: ['user:alice', 'office:berlin', 'ingredient:chicken', 'style:thai'],
        label: 1 as const,
        weight: 2,
      },
      {
        features: ['user:alice', 'office:berlin', 'ingredient:fish', 'style:fried'],
        label: 0 as const,
        weight: 2,
      },
      {
        features: ['user:alice', 'office:berlin', 'ingredient:beef', 'style:burger'],
        label: 0 as const,
        weight: 1,
      },
    ];

    const queryPositive = {
      features: ['user:alice', 'office:berlin', 'ingredient:chicken', 'style:thai'],
    };
    const queryNegative = {
      features: ['user:alice', 'office:berlin', 'ingredient:fish', 'style:fried'],
    };

    const tsModel = trainMealRecommendationModel(examples, { seed: 13, factorDim: 4, epochs: 20 });
    const tsPositive = scoreMealRecommendationModel(tsModel, queryPositive);
    const tsNegative = scoreMealRecommendationModel(tsModel, queryNegative);

    const xlearn = await trainMealRecommendationModelWithXlearn(examples, {
      seed: 13,
      factorDim: 4,
      epochs: 20,
    });

    try {
      const xlearnPositive = await scoreMealRecommendationModelWithXlearn(xlearn.model, queryPositive);
      const xlearnNegative = await scoreMealRecommendationModelWithXlearn(xlearn.model, queryNegative);

      expect(tsPositive).toBeGreaterThan(tsNegative);
      expect(xlearnPositive).toBeGreaterThan(xlearnNegative);

      const savedBytes = await saveMealRecommendationModelWithXlearn(xlearn.model);
      const loaded = await loadMealRecommendationModelWithXlearn(
        savedBytes,
        xlearn.model.featureIndex,
        xlearn.model.factorDim,
      );

      try {
        const loadedPositive = await scoreMealRecommendationModelWithXlearn(loaded, queryPositive);
        const loadedNegative = await scoreMealRecommendationModelWithXlearn(loaded, queryNegative);
        expect(loadedPositive).toBeGreaterThan(loadedNegative);
      } finally {
        disposeMealRecommendationModelWithXlearn(loaded);
      }
    } finally {
      disposeMealRecommendationModelWithXlearn(xlearn.model);
    }
  });
});
