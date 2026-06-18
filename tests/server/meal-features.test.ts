import { describe, expect, it } from 'vitest';
import {
  buildTasteProfile,
  DRINK_FEATURE_TAG,
  extractFeatures,
  featureLabel,
  hasSideDishFeature,
  hasNonMealCourseFeature,
  SIDE_DISH_FEATURE_TAG,
  scoreTasteMatch,
} from '../../src/server/services/mealFeatures.js';

describe('mealFeatures', () => {
  describe('extractFeatures', () => {
    it('extracts ingredient and style tags from name and description', () => {
      const features = extractFeatures('Green Chicken Curry', 'Spicy Thai curry with rice');
      expect(features).toContain('ingredient:chicken');
      expect(features).toContain('ingredient:rice');
      expect(features).toContain('style:thai');
      expect(features).toContain('style:curry');
      expect(features).toContain('style:spicy');
    });

    it('matches common German terms', () => {
      const features = extractFeatures('Hähnchen mit Reis');
      expect(features).toContain('ingredient:chicken');
      expect(features).toContain('ingredient:rice');
    });

    it('returns no tags for an item with no recognized terms', () => {
      expect(extractFeatures('Mystery Plate')).toEqual([]);
    });

    it('tags obvious side dishes by item name', () => {
      const features = extractFeatures('Garlic Naan');
      expect(features).toContain(SIDE_DISH_FEATURE_TAG);
      expect(hasSideDishFeature(features)).toBe(true);
      expect(hasNonMealCourseFeature(features)).toBe(true);
    });

    it('tags obvious drinks by item name', () => {
      const features = extractFeatures('Mango Lassi');
      expect(features).toContain(DRINK_FEATURE_TAG);
      expect(hasNonMealCourseFeature(features)).toBe(true);
    });

    it('does not treat a main dish as a side dish just because the description mentions rice', () => {
      const features = extractFeatures('Green Chicken Curry', 'Served with rice');
      expect(features).not.toContain(SIDE_DISH_FEATURE_TAG);
    });
  });

  describe('featureLabel', () => {
    it('strips the category prefix', () => {
      expect(featureLabel('ingredient:chicken')).toBe('chicken');
      expect(featureLabel('style:thai')).toBe('thai');
    });
  });

  describe('buildTasteProfile', () => {
    it('learns positive weight for features of highly rated items', () => {
      const profile = buildTasteProfile([
        { itemName: 'Chicken Pad Thai', rating: 5 },
        { itemName: 'Thai Green Curry', rating: 4 },
      ]);
      expect(profile.weights.get('style:thai')!).toBeGreaterThan(0);
      expect(profile.ratedCount).toBe(2);
    });

    it('learns negative weight for features of poorly rated items', () => {
      const profile = buildTasteProfile([{ itemName: 'Cilantro Salad', rating: 1 }]);
      expect(profile.weights.get('ingredient:cilantro')!).toBeLessThan(0);
    });

    it('averages so conflicting ratings cancel out', () => {
      const profile = buildTasteProfile([
        { itemName: 'Beef Burger', rating: 5 },
        { itemName: 'Beef Steak', rating: 1 },
      ]);
      expect(profile.weights.get('ingredient:beef')).toBe(0);
    });

    it('treats unrated orders as weak implicit positive signal', () => {
      const profile = buildTasteProfile([{ itemName: 'Chicken Rice', rating: null }]);
      expect(profile.ratedCount).toBe(0);
      expect(profile.orderCount).toBe(1);
      // implicit-only feature settles at the implicit order value
      expect(profile.weights.get('ingredient:chicken')).toBe(1);
    });

    it('lets an explicit low rating outweigh implicit order signal for the same feature', () => {
      const profile = buildTasteProfile([
        { itemName: 'Fish and Chips', rating: null },
        { itemName: 'Fish and Chips', rating: null },
        { itemName: 'Baked Salmon', rating: 1 },
      ]);
      // two implicit (+1, conf 0.4) vs one explicit (-2, conf 1)
      // = (1*0.4 + 1*0.4 + -2*1) / (0.4 + 0.4 + 1) = -1.2 / 1.8
      expect(profile.weights.get('ingredient:fish')!).toBeCloseTo(-1.2 / 1.8, 5);
    });
  });

  describe('scoreTasteMatch', () => {
    it('scores an unrated item highly when it shares liked features', () => {
      const profile = buildTasteProfile([
        { itemName: 'Chicken Pad Thai', rating: 5 },
        { itemName: 'Thai Green Curry', rating: 5 },
      ]);
      // never-ordered item, but it is Thai + chicken
      const match = scoreTasteMatch(extractFeatures('Thai Chicken Satay'), profile);
      expect(match.score).toBeGreaterThan(0);
      expect(match.likedLabels).toContain('thai');
      expect(match.likedLabels).toContain('chicken');
    });

    it('returns zero for features the user never rated', () => {
      const profile = buildTasteProfile([{ itemName: 'Chicken Rice', rating: 5 }]);
      const match = scoreTasteMatch(extractFeatures('Mushroom Pizza'), profile);
      expect(match.score).toBe(0);
      expect(match.likedLabels).toEqual([]);
    });
  });
});
