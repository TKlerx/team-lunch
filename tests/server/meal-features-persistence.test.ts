import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest';
import prisma from '../../src/server/db.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import * as menuService from '../../src/server/services/menu.js';
import { extractFeatures } from '../../src/server/services/mealFeatures.js';
import { loadMenuItemFeatures } from '../../src/server/services/mealFeatures.js';

vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
}));

describe('mealFeatures persistence', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('returns persisted tags when an item has stored features', async () => {
    const office = await ensureDefaultOfficeLocation();
    const menu = await menuService.createMenu('Lunch Menu', office.id);
    const item = await menuService.createItem(
      menu.id,
      'Chicken Korma',
      'Creamy curry',
      undefined,
      undefined,
      office.id,
    );

    await prisma.menuItemFeature.deleteMany({ where: { menuItemId: item.id } });
    await prisma.menuItemFeature.createMany({
      data: [
        {
          menuItemId: item.id,
          itemIdentityKey: 'chicken-korma',
          officeLocationId: office.id,
          tag: 'ingredient:chicken',
          provenance: 'keyword',
        },
        {
          menuItemId: item.id,
          itemIdentityKey: 'chicken-korma',
          officeLocationId: office.id,
          tag: 'style:curry',
          provenance: 'keyword',
        },
      ],
    });

    const tags = await loadMenuItemFeatures({
      menuItemId: item.id,
      officeLocationId: office.id,
      itemIdentityKey: 'chicken-korma',
      name: item.name,
      description: item.description,
    });

    expect(tags).toEqual(expect.arrayContaining(['ingredient:chicken', 'style:curry']));
    expect(tags).toHaveLength(2);
  });

  it('falls back to live extraction when no persisted tags exist', async () => {
    const office = await ensureDefaultOfficeLocation();
    const menu = await menuService.createMenu('Lunch Menu', office.id);
    const item = await menuService.createItem(
      menu.id,
      'Thai Chicken Curry',
      'Coconut rice noodle bowl',
      undefined,
      undefined,
      office.id,
    );

    await prisma.menuItemFeature.deleteMany({ where: { menuItemId: item.id } });
    const tags = await loadMenuItemFeatures({
      menuItemId: item.id,
      officeLocationId: office.id,
      itemIdentityKey: 'thai-chicken-curry',
      name: item.name,
      description: item.description,
    });

    expect(tags).toEqual(extractFeatures(item.name, item.description));
    expect(tags).toEqual(expect.arrayContaining(['ingredient:chicken', 'style:thai', 'style:curry']));
  });
});
