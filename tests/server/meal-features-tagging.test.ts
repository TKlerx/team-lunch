import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/server/db.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as menuService from '../../src/server/services/menu.js';
import { ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import { resetAiRecommendationConfigForTests } from '../../src/server/services/mealRecommendationAi.js';

vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
}));

type ImportItem = {
  name: string;
  ingredients?: string;
  price?: number;
};

function buildImportPayload(menuName: string, items: ImportItem[]) {
  return {
    menu: [
      {
        name: menuName,
        location: 'Main Street 1',
        phone: '+49 000 111',
        url: 'https://example.test/menu',
        'date-created': '2026-06-17T12:00:00Z',
      },
      {
        category: 'Lunch',
        items: items.map((item, index) => ({
          'item-number': String(index + 1),
          name: item.name,
          ingredients: item.ingredients ?? '',
          price: item.price ?? 9.5,
        })),
      },
    ],
  };
}

async function getFeatureRows(menuItemIds: string[]) {
  return prisma.menuItemFeature.findMany({
    where: { menuItemId: { in: menuItemIds } },
    orderBy: [{ menuItemId: 'asc' }, { createdAt: 'asc' }],
    select: { menuItemId: true, tag: true, provenance: true },
  });
}

describe('meal feature tagging at import', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    resetAiRecommendationConfigForTests();
    vi.unstubAllGlobals();
    await cleanDatabase();
  });

  afterAll(async () => {
    process.env = { ...originalEnv };
    resetAiRecommendationConfigForTests();
    vi.unstubAllGlobals();
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('persists keyword tags during import', async () => {
    const office = await ensureDefaultOfficeLocation();
    const result = await menuService.importMenuFromJson(buildImportPayload('Thai Lunch', [
      { name: 'Thai Chicken Curry', ingredients: 'Rice noodle bowl with coconut sauce', price: 12.5 },
    ]), office.id);

    const featureRows = await getFeatureRows([result.menu.items[0].id]);
    expect(featureRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: 'ingredient:chicken', provenance: 'keyword' }),
        expect.objectContaining({ tag: 'style:thai', provenance: 'keyword' }),
        expect.objectContaining({ tag: 'style:curry', provenance: 'keyword' }),
      ]),
    );
    expect(featureRows.length).toBeGreaterThanOrEqual(3);
  });

  it('gap-fills only untagged items and keeps the AI payload identifier-free', async () => {
    const office = await ensureDefaultOfficeLocation();
    process.env.AI_RECOMMENDATION_ENDPOINT = 'https://ai.example.com/tag';
    process.env.AI_RECOMMENDATION_API_KEY = 'secret-key';
    process.env.AI_RECOMMENDATION_MODEL = 'tagger-test';
    process.env.AI_RECOMMENDATION_PROVIDER = 'test-provider';
    resetAiRecommendationConfigForTests();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        taggings: [
          {
            itemName: 'Chef Special',
            tags: ['ingredient:tofu', 'style:japanese'],
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await menuService.importMenuFromJson(buildImportPayload('Mixed Lunch', [
      { name: 'Thai Chicken Curry', ingredients: 'Rice noodle bowl with coconut sauce', price: 12.5 },
      { name: 'Chef Special', ingredients: 'House special of the day', price: 11.5 },
    ]), office.id);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestOptions = fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined;
    expect(requestOptions?.body).toBeDefined();
    const requestBody = JSON.parse(requestOptions?.body ?? '{}') as { items?: Array<Record<string, unknown>> };
    expect(requestBody.items).toEqual([
      {
        itemName: 'Chef Special',
        description: 'House special of the day',
      },
    ]);

    const featureRows = await getFeatureRows(result.menu.items.map((item) => item.id));
    const keywordRows = featureRows.filter((row) => row.provenance === 'keyword');
    const aiRows = featureRows.filter((row) => row.provenance === 'ai');

    expect(keywordRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ menuItemId: result.menu.items[0].id, tag: 'ingredient:chicken' }),
      ]),
    );
    expect(aiRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ menuItemId: result.menu.items[1].id, tag: 'ingredient:tofu' }),
        expect.objectContaining({ menuItemId: result.menu.items[1].id, tag: 'style:japanese' }),
      ]),
    );
    expect(
      requestOptions?.body?.includes('menuId') ?? false,
    ).toBe(false);
    expect(
      requestOptions?.body?.includes('officeLocationId') ?? false,
    ).toBe(false);
    expect(
      requestOptions?.body?.includes('actorKey') ?? false,
    ).toBe(false);
    expect(
      requestOptions?.body?.includes('actorEmail') ?? false,
    ).toBe(false);
  });

  it('imports untaggable items successfully when AI tagging is unavailable', async () => {
    const office = await ensureDefaultOfficeLocation();
    const result = await menuService.importMenuFromJson(buildImportPayload('Fallback Lunch', [
      { name: 'Mystery Special', ingredients: 'House special of the day', price: 11.5 },
    ]), office.id);

    const featureRows = await getFeatureRows([result.menu.items[0].id]);
    expect(featureRows).toHaveLength(0);
  });

  it('keeps feature coverage above 85 percent on a seeded menu', async () => {
    const office = await ensureDefaultOfficeLocation();
    process.env.AI_RECOMMENDATION_ENDPOINT = 'https://ai.example.com/tag';
    process.env.AI_RECOMMENDATION_API_KEY = 'secret-key';
    process.env.AI_RECOMMENDATION_MODEL = 'tagger-test';
    process.env.AI_RECOMMENDATION_PROVIDER = 'test-provider';
    resetAiRecommendationConfigForTests();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        taggings: [
          { itemName: 'Chef Special 1', tags: ['ingredient:tofu'] },
          { itemName: 'Chef Special 2', tags: ['style:japanese'] },
          { itemName: 'Chef Special 3', tags: ['ingredient:rice', 'style:thai'] },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await menuService.importMenuFromJson(buildImportPayload('Coverage Lunch', [
      { name: 'Thai Chicken Curry', ingredients: 'Rice noodle bowl with coconut sauce', price: 12.5 },
      { name: 'Beef Burger', ingredients: 'Grilled burger with fries', price: 13.5 },
      { name: 'Greek Salad', ingredients: 'Fresh salad bowl with feta', price: 10.5 },
      { name: 'Fish Sushi', ingredients: 'Japanese rice roll', price: 14.5 },
      { name: 'Mushroom Noodle Soup', ingredients: 'Savory soup with noodles', price: 9.5 },
      { name: 'Chicken Tikka', ingredients: 'Indian curry bowl', price: 12.5 },
      { name: 'Avocado Salad', ingredients: 'Fresh salad with avocado', price: 11.5 },
      { name: 'Vegan Curry', ingredients: 'Spicy curry bowl', price: 11.5 },
      { name: 'Spicy Shrimp Noodles', ingredients: 'Wok noodles with chili', price: 13.5 },
      { name: 'Roasted Potato Bowl', ingredients: 'Grilled potatoes and greens', price: 10.5 },
      { name: 'Italian Lasagna', ingredients: 'Cheesy pasta bake', price: 12.5 },
      { name: 'Tofu Rice Bowl', ingredients: 'Rice bowl with tofu', price: 11.5 },
      { name: 'Chicken Burger', ingredients: 'Grilled chicken burger', price: 12.5 },
      { name: 'Japanese Ramen', ingredients: 'Ramen noodle soup', price: 13.5 },
      { name: 'Fried Egg Sandwich', ingredients: 'Crispy sandwich with egg', price: 8.5 },
      { name: 'Tomato Pasta', ingredients: 'Italian pasta with tomato', price: 11.5 },
      { name: 'Peanut Chicken Curry', ingredients: 'Thai curry with peanuts', price: 12.5 },
      { name: 'Chef Special 1', ingredients: 'House special of the day', price: 11.5 },
      { name: 'Chef Special 2', ingredients: 'House special of the day', price: 11.5 },
      { name: 'Chef Special 3', ingredients: 'House special of the day', price: 11.5 },
    ]), office.id);

    const featureRows = await getFeatureRows(result.menu.items.map((item) => item.id));
    const taggedItemIds = new Set(featureRows.map((row) => row.menuItemId));

    expect(taggedItemIds.size).toBeGreaterThanOrEqual(17);
    expect(taggedItemIds.size).toBeGreaterThanOrEqual(Math.ceil(result.menu.items.length * 0.85));
  });
});
