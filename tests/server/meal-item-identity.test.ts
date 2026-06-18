import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest';
import prisma from '../../src/server/db.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import * as menuService from '../../src/server/services/menu.js';
import { ensureMenuItemIdentity, normalizeMenuItemIdentityKey } from '../../src/server/services/mealItemIdentity.js';

vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
}));

describe('mealItemIdentity', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('normalizes item names into a stable office-scoped key', () => {
    expect(normalizeMenuItemIdentityKey('  Chicken Korma!!  ')).toBe('chicken-korma');
    expect(normalizeMenuItemIdentityKey('Fish & Chips')).toBe('fish-chips');
    expect(normalizeMenuItemIdentityKey('Crème brûlée')).toBe('crème-brûlée');
  });

  it('reuses one identity row when a menu item is re-imported under the same normalized name', async () => {
    const office = await ensureDefaultOfficeLocation();
    const menu = await menuService.createMenu('Lunch Menu', office.id);

    const firstItem = await menuService.createItem(
      menu.id,
      'Chicken Korma!!',
      'Creamy curry',
      undefined,
      undefined,
      office.id,
    );
    const firstIdentity = await ensureMenuItemIdentity(firstItem.id, office.id);

    expect(firstIdentity.itemIdentityKey).toBe('chicken-korma');

    const firstItemRow = await prisma.menuItem.findUnique({ where: { id: firstItem.id } });
    expect(firstItemRow?.itemIdentityKey).toBe('chicken-korma');

    await prisma.menuItem.delete({ where: { id: firstItem.id } });

    const secondItem = await menuService.createItem(
      menu.id,
      'CHICKEN korma',
      'Creamy curry',
      undefined,
      undefined,
      office.id,
    );
    const secondIdentity = await ensureMenuItemIdentity(secondItem.id, office.id);

    expect(secondIdentity.itemIdentityKey).toBe('chicken-korma');
    expect(secondIdentity.menuItemIdentityId).toBe(firstIdentity.menuItemIdentityId);

    const identityRows = await prisma.menuItemIdentity.findMany({
      where: { officeLocationId: office.id, identityKey: 'chicken-korma' },
    });
    expect(identityRows).toHaveLength(1);
    expect(identityRows[0].displayNameSnapshot).toBe('CHICKEN korma');

    const secondItemRow = await prisma.menuItem.findUnique({ where: { id: secondItem.id } });
    expect(secondItemRow?.itemIdentityKey).toBe('chicken-korma');
  });
});
