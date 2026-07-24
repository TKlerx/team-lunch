import { describe, expect, it } from 'vitest';
import {
  BEVERAGE_TAG,
  getFoodSelectionVisibleTags,
  isBeverageMenuItem,
  matchesAnySelectedTag,
  normalizeMenuLabels,
  normalizeMenuTags,
  validateMenuLabels,
  validateMenuTags,
} from '../../src/lib/menuItemTags.js';

describe('menu item tags', () => {
  it('normalizes tags to lowercase unique values', () => {
    expect(normalizeMenuTags([' Vegan ', 'vegan', 'COLD'])).toEqual(['vegan', 'cold']);
  });

  it('normalizes reusable safety-label lists to lowercase unique values', () => {
    expect(normalizeMenuLabels([' Milk ', 'milk', 'E250'])).toEqual(['milk', 'e250']);
  });

  it('classifies only beverage-tagged items as beverages', () => {
    expect(isBeverageMenuItem({ tags: [BEVERAGE_TAG, 'cold'] })).toBe(true);
    expect(isBeverageMenuItem({ tags: ['vegan'] })).toBe(false);
    expect(isBeverageMenuItem({ tags: [] })).toBe(false);
  });

  it('hides beverage in food-selection visible tags', () => {
    expect(getFoodSelectionVisibleTags({ tags: ['beverage', 'cold'] })).toEqual(['cold']);
  });

  it('matches selected tags with OR semantics', () => {
    expect(matchesAnySelectedTag({ tags: ['vegan'] }, new Set(['spicy', 'vegan']))).toBe(true);
    expect(matchesAnySelectedTag({ tags: ['cold'] }, new Set(['spicy', 'vegan']))).toBe(false);
  });

  it('rejects non-string tags', () => {
    expect(validateMenuTags(['ok', 1], 'item.tags').error).toBe('item.tags[1] must be a string');
  });

  it('validates safety labels with the supplied field path', () => {
    expect(validateMenuLabels(['milk', 1], 'item.allergens')).toEqual({
      labels: [],
      error: 'item.allergens[1] must be a string',
    });
  });
});
