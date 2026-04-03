import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as menuService from '../../src/server/services/menu.js';
import * as userMenuDefaultsService from '../../src/server/services/userMenuDefaults.js';

describe('User menu default preference service', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('returns empty preferences for a new user', async () => {
    const preferences = await userMenuDefaultsService.listUserMenuDefaultPreferences(
      'alice@example.com',
    );

    expect(preferences).toEqual([]);
  });

  it('stores and lists a default meal per menu', async () => {
    const menu = await menuService.createMenu('Italian');
    const item = await menuService.createItem(menu.id, 'Margherita', 'Classic', '12', 9.5);

    const saved = await userMenuDefaultsService.upsertUserMenuDefaultPreference(
      'alice@example.com',
      menu.id,
      item.id,
      'No olives',
      true,
    );

    expect(saved.userKey).toBe('alice@example.com');
    expect(saved.menuId).toBe(menu.id);
    expect(saved.itemId).toBe(item.id);
    expect(saved.defaultComment).toBe('No olives');
    expect(saved.allowOrganizerFallback).toBe(true);

    const listed = await userMenuDefaultsService.listUserMenuDefaultPreferences('alice@example.com');
    expect(listed).toHaveLength(1);
    expect(listed[0].itemId).toBe(item.id);
    expect(listed[0].defaultComment).toBe('No olives');
    expect(listed[0].allowOrganizerFallback).toBe(true);
  });

  it('rejects enabling organizer fallback without a default meal', async () => {
    const menu = await menuService.createMenu('Italian');

    await expect(
      userMenuDefaultsService.upsertUserMenuDefaultPreference(
        'alice@example.com',
        menu.id,
        null,
        null,
        true,
      ),
    ).rejects.toThrow('Default meal is required before organizer fallback can be enabled');
  });

  it('rejects an item from a different menu', async () => {
    const menuA = await menuService.createMenu('Italian');
    const menuB = await menuService.createMenu('Thai');
    const item = await menuService.createItem(menuB.id, 'Pad Thai', 'Noodles', '7', 10.5);

    await expect(
      userMenuDefaultsService.upsertUserMenuDefaultPreference(
        'alice@example.com',
        menuA.id,
        item.id,
        null,
        false,
      ),
    ).rejects.toThrow('Menu item does not belong to the selected menu');
  });

  it('rejects a default comment longer than 200 characters', async () => {
    const menu = await menuService.createMenu('Italian');
    const item = await menuService.createItem(menu.id, 'Margherita', 'Classic', '12', 9.5);

    await expect(
      userMenuDefaultsService.upsertUserMenuDefaultPreference(
        'alice@example.com',
        menu.id,
        item.id,
        'x'.repeat(201),
        false,
      ),
    ).rejects.toThrow('Default meal comment must be 200 characters or fewer');
  });

  it('clears a saved preference when item is set to null', async () => {
    const menu = await menuService.createMenu('Italian');
    const item = await menuService.createItem(menu.id, 'Margherita', 'Classic', '12', 9.5);

    await userMenuDefaultsService.upsertUserMenuDefaultPreference(
      'alice@example.com',
      menu.id,
      item.id,
      'Extra basil',
      false,
    );

    const cleared = await userMenuDefaultsService.upsertUserMenuDefaultPreference(
      'alice@example.com',
      menu.id,
      null,
      null,
      false,
    );

    expect(cleared.itemId).toBeNull();
    expect(cleared.defaultComment).toBeNull();
    expect(cleared.allowOrganizerFallback).toBe(false);
    expect(
      await userMenuDefaultsService.listUserMenuDefaultPreferences('alice@example.com'),
    ).toEqual([]);
  });
});
