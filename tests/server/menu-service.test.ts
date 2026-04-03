import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as menuService from '../../src/server/services/menu.js';
import { createOfficeLocation } from '../../src/server/services/officeLocation.js';

// Suppress SSE broadcasts during tests
vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
}));

describe('Menu service', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  // ─── Create Menu ─────────────────────────────────────────

  it('creates a menu with a valid name', async () => {
    const menu = await menuService.createMenu('Italian');
    expect(menu.name).toBe('Italian');
    expect(menu.id).toBeDefined();

    expect(menu.items).toEqual([]);
    expect(menu.itemCount).toBe(0);
  });

  it('trims whitespace from menu name', async () => {
    const menu = await menuService.createMenu('  Asian  ');
    expect(menu.name).toBe('Asian');
  });

  it('rejects creating menu with empty name', async () => {
    await expect(menuService.createMenu('')).rejects.toThrow('Menu name must be 1–60 characters');
    await expect(menuService.createMenu('   ')).rejects.toThrow('Menu name must be 1–60 characters');
  });

  it('rejects creating menu with name over 60 characters', async () => {
    const longName = 'A'.repeat(61);
    await expect(menuService.createMenu(longName)).rejects.toThrow('Menu name must be 1–60 characters');
  });

  it('rejects creating menu with duplicate name (case-insensitive)', async () => {
    await menuService.createMenu('Italian');
    await expect(menuService.createMenu('italian')).rejects.toThrow('already exists');
    await expect(menuService.createMenu('ITALIAN')).rejects.toThrow('already exists');
  });

  it('allows the same menu name in different offices and filters list by office', async () => {
    const berlin = await createOfficeLocation('Berlin');
    const munich = await createOfficeLocation('Munich');

    await menuService.createMenu('Italian', berlin.id);
    await menuService.createMenu('Italian', munich.id);

    const berlinMenus = await menuService.listMenus(berlin.id);
    const munichMenus = await menuService.listMenus(munich.id);

    expect(berlinMenus).toHaveLength(1);
    expect(munichMenus).toHaveLength(1);
    expect(berlinMenus[0].id).not.toBe(munichMenus[0].id);
  });

  // ─── Update Menu ─────────────────────────────────────────

  it('renames a menu', async () => {
    const menu = await menuService.createMenu('Italian');
    const updated = await menuService.updateMenu(menu.id, 'Mediterranean');
    expect(updated.name).toBe('Mediterranean');
  });

  it('allows case change of same menu name', async () => {
    const menu = await menuService.createMenu('Italian');
    const updated = await menuService.updateMenu(menu.id, 'ITALIAN');
    expect(updated.name).toBe('ITALIAN');
  });

  it('rejects rename if name taken by different menu', async () => {
    await menuService.createMenu('Italian');
    const menu2 = await menuService.createMenu('Asian');
    await expect(menuService.updateMenu(menu2.id, 'italian')).rejects.toThrow('already exists');
  });

  it('rejects rename of non-existent menu', async () => {
    await expect(
      menuService.updateMenu('00000000-0000-0000-0000-000000000000', 'Test'),
    ).rejects.toThrow('Menu not found');
  });

  it('updates menu contact fields', async () => {
    const menu = await menuService.createMenu('Italian');
    const updated = await menuService.updateMenu(menu.id, {
      name: 'Italian',
      location: 'Main Street 1',
      phone: '+49 123 456',
      url: 'https://italian.example',
    });

    expect(updated.location).toBe('Main Street 1');
    expect(updated.phone).toBe('+49 123 456');
    expect(updated.url).toBe('https://italian.example');
  });

  it('rejects invalid menu contact URL update', async () => {
    const menu = await menuService.createMenu('Italian');
    await expect(
      menuService.updateMenu(menu.id, {
        name: 'Italian',
        url: 'not-a-url',
      }),
    ).rejects.toThrow('URL must be a valid absolute URL');
  });

  // ─── Delete Menu ─────────────────────────────────────────

  it('deletes a menu', async () => {
    const menu = await menuService.createMenu('Italian');
    await menuService.deleteMenu(menu.id);
    const menus = await menuService.listMenus();
    expect(menus).toHaveLength(0);
  });

  it('delete cascades items', async () => {
    const menu = await menuService.createMenu('Italian');
    await menuService.createItem(menu.id, 'Pizza');
    await menuService.createItem(menu.id, 'Pasta');
    await menuService.deleteMenu(menu.id);
    const menus = await menuService.listMenus();
    expect(menus).toHaveLength(0);
  });

  it('rejects deleting non-existent menu', async () => {
    await expect(
      menuService.deleteMenu('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow('Menu not found');
  });

  // ─── List Menus ──────────────────────────────────────────

  it('lists menus alphabetically', async () => {
    await menuService.createMenu('Zebra');
    await menuService.createMenu('Alpha');
    await menuService.createMenu('Middle');
    const menus = await menuService.listMenus();
    expect(menus.map((m) => m.name)).toEqual(['Alpha', 'Middle', 'Zebra']);
  });

  it('includes item count in listing', async () => {
    const menu = await menuService.createMenu('Italian');
    await menuService.createItem(menu.id, 'Pizza');
    await menuService.createItem(menu.id, 'Pasta');
    const menus = await menuService.listMenus();
    expect(menus[0].itemCount).toBe(2);
    expect(menus[0].items).toHaveLength(2);
  });

  // ─── Create Item ─────────────────────────────────────────

  it('creates an item with valid name', async () => {
    const menu = await menuService.createMenu('Italian');
    const item = await menuService.createItem(menu.id, 'Margherita Pizza', 'Classic', '12', 9.5);
    expect(item.name).toBe('Margherita Pizza');
    expect(item.description).toBe('Classic');
    expect(item.itemNumber).toBe('12');
    expect(item.price).toBe(9.5);
    expect(item.menuId).toBe(menu.id);
  });

  it('creates an item without description', async () => {
    const menu = await menuService.createMenu('Italian');
    const item = await menuService.createItem(menu.id, 'Pizza');
    expect(item.description).toBeNull();
  });

  it('rejects creating item with empty name', async () => {
    const menu = await menuService.createMenu('Italian');
    await expect(menuService.createItem(menu.id, '')).rejects.toThrow(
      'Item name must be 1–80 characters',
    );
  });

  it('rejects creating item with name over 80 characters', async () => {
    const menu = await menuService.createMenu('Italian');
    await expect(menuService.createItem(menu.id, 'X'.repeat(81))).rejects.toThrow(
      'Item name must be 1–80 characters',
    );
  });

  it('rejects creating item with duplicate name within same menu (case-insensitive)', async () => {
    const menu = await menuService.createMenu('Italian');
    await menuService.createItem(menu.id, 'Pizza');
    await expect(menuService.createItem(menu.id, 'pizza')).rejects.toThrow('already exists');
    await expect(menuService.createItem(menu.id, 'PIZZA')).rejects.toThrow('already exists');
  });

  it('allows same item name in different menus', async () => {
    const menu1 = await menuService.createMenu('Italian');
    const menu2 = await menuService.createMenu('Indian');
    await menuService.createItem(menu1.id, 'Bread');
    const item = await menuService.createItem(menu2.id, 'Bread');
    expect(item.name).toBe('Bread');
  });

  it('rejects creating item on non-existent menu', async () => {
    await expect(
      menuService.createItem('00000000-0000-0000-0000-000000000000', 'Pizza'),
    ).rejects.toThrow('Menu not found');
  });

  // ─── Update Item ─────────────────────────────────────────

  it('renames an item', async () => {
    const menu = await menuService.createMenu('Italian');
    const item = await menuService.createItem(menu.id, 'Pizza');
    const updated = await menuService.updateItem(item.id, 'Neapolitan Pizza', 'From Naples', '21', 10.5);
    expect(updated.name).toBe('Neapolitan Pizza');
    expect(updated.description).toBe('From Naples');
    expect(updated.itemNumber).toBe('21');
    expect(updated.price).toBe(10.5);
  });

  it('rejects invalid manual item price', async () => {
    const menu = await menuService.createMenu('Italian');
    await expect(menuService.createItem(menu.id, 'Pizza', undefined, undefined, -1)).rejects.toThrow(
      'Price must be between 0 and 9999.99',
    );
  });

  it('rejects renaming item to duplicate name in same menu', async () => {
    const menu = await menuService.createMenu('Italian');
    await menuService.createItem(menu.id, 'Pizza');
    const item2 = await menuService.createItem(menu.id, 'Pasta');
    await expect(menuService.updateItem(item2.id, 'pizza')).rejects.toThrow('already exists');
  });

  // ─── Delete Item ─────────────────────────────────────────

  it('deletes an item', async () => {
    const menu = await menuService.createMenu('Italian');
    const item = await menuService.createItem(menu.id, 'Pizza');
    await menuService.deleteItem(item.id);
    const items = await menuService.listItems(menu.id);
    expect(items).toHaveLength(0);
  });

  it('rejects deleting non-existent item', async () => {
    await expect(
      menuService.deleteItem('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow('Item not found');
  });

  // ─── List Items ──────────────────────────────────────────

  it('lists items in creation order', async () => {
    const menu = await menuService.createMenu('Italian');
    await menuService.createItem(menu.id, 'Zebra Pasta');
    await menuService.createItem(menu.id, 'Alpha Pizza');
    const items = await menuService.listItems(menu.id);
    expect(items.map((i) => i.name)).toEqual(['Zebra Pasta', 'Alpha Pizza']);
  });

  // ─── Import Menu JSON ───────────────────────────────────

  it('imports a menu with metadata, description mapping, and price persistence', async () => {
    const payload = {
      menu: [
        {
          name: 'Pizza Pronto',
          location: 'Main Street 1',
          phone: '+49 000 111',
          url: 'https://pizza-pronto.example',
          'date-created': '2026-02-06T12:00:00Z',
        },
        {
          category: 'Pizza',
          items: [
            {
              'item-number': '12',
              name: 'Margherita',
              ingredients: 'Tomato, Cheese',
              price: 7.5,
            },
          ],
        },
      ],
    };

    const result = await menuService.importMenuFromJson(payload);

    expect(result.created).toBe(true);
    expect(result.menu.name).toBe('Pizza Pronto');
    expect(result.menu.location).toBe('Main Street 1');
    expect(result.menu.phone).toBe('+49 000 111');
    expect(result.menu.url).toBe('https://pizza-pronto.example');
    expect(result.menu.sourceDateCreated).toBe('2026-02-06T12:00:00.000Z');
    expect(result.menu.items).toHaveLength(1);
    expect(result.menu.items[0].itemNumber).toBe('12');
    expect(result.menu.items[0].description).toBe('Tomato, Cheese');
    expect(result.menu.items[0].price).toBe(7.5);
  });

  it('updates existing menu by name and replaces all existing items', async () => {
    const existing = await menuService.createMenu('Pizza Pronto');
    await menuService.createItem(existing.id, 'Old Item', 'Old Desc');

    const payload = {
      menu: [
        {
          name: 'pizza pronto',
          location: 'New Address 2',
          phone: '+49 123 456',
          url: 'https://pizza-pronto-updated.example',
          'date-created': '2026-02-10T08:30:00Z',
        },
        {
          category: 'Pizza',
          items: [
            {
              'item-number': '44',
              name: 'New Item',
              ingredients: 'Fresh ingredients',
              price: 9.99,
            },
          ],
        },
      ],
    };

    const result = await menuService.importMenuFromJson(payload);

    expect(result.created).toBe(false);
    expect(result.menu.id).toBe(existing.id);
    expect(result.menu.name).toBe('pizza pronto');
    expect(result.menu.items).toHaveLength(1);
    expect(result.menu.items[0].itemNumber).toBe('44');
    expect(result.menu.items[0].name).toBe('New Item');
    expect(result.menu.items[0].price).toBe(9.99);
    expect(result.menu.location).toBe('New Address 2');
    expect(result.menu.phone).toBe('+49 123 456');
    expect(result.menu.url).toBe('https://pizza-pronto-updated.example');
  });

  it('rejects invalid import with violations and persists nothing', async () => {
    const payload = {
      menu: [
        {
          name: '',
          location: '',
          phone: '',
          url: '',
          'date-created': 'not-a-date',
        },
        {
          category: 'Pizza',
          items: [
            {
              'item-number': 'X'.repeat(41),
              name: '',
              ingredients: '',
              price: -1.234,
            },
          ],
        },
      ],
    };

    await expect(menuService.importMenuFromJson(payload)).rejects.toMatchObject({
      message: 'Import payload validation failed',
      statusCode: 400,
      violations: expect.arrayContaining([
        expect.objectContaining({ path: 'menu[0].name' }),
        expect.objectContaining({ path: 'menu[0].date-created' }),
        expect.objectContaining({ path: 'menu[1].items[0].item-number' }),
        expect.objectContaining({ path: 'menu[1].items[0].price' }),
      ]),
    });

    const menus = await menuService.listMenus();
    expect(menus).toHaveLength(0);
  });

  it('previews import with created/updated/deleted item counts', async () => {
    const existing = await menuService.createMenu('Pizza Pronto');
    await menuService.createItem(existing.id, 'Unchanged', 'Same');
    const oldItem = await menuService.createItem(existing.id, 'Will Update', 'Old Desc');
    await menuService.createItem(existing.id, 'Will Delete', 'Gone');

    const payload = {
      menu: [
        {
          name: 'pizza pronto',
          location: 'Street 2',
          phone: '+49 123',
          url: 'https://preview.example',
          'date-created': '2026-02-10T08:30:00Z',
        },
        {
          category: 'Pizza',
          items: [
            { name: 'Unchanged', ingredients: 'Same', price: 10 },
            { name: 'Will Update', ingredients: 'New Desc', price: 11 },
            { name: 'Will Create', ingredients: 'Fresh', price: 12 },
          ],
        },
      ],
    };

    await menuService.updateItem(oldItem.id, 'Will Update', 'Old Desc');

    const preview = await menuService.previewMenuImportFromJson(payload);
    expect(preview.menuExists).toBe(true);
    expect(preview.menuName).toBe('pizza pronto');
    expect(preview.itemSummary).toEqual({ created: 1, updated: 2, deleted: 1 });

    const menus = await menuService.listMenus();
    expect(menus[0].items.map((item) => item.name)).toEqual(['Unchanged', 'Will Update', 'Will Delete']);
  });

  it('previews import for new menu with created count only', async () => {
    const payload = {
      menu: [
        {
          name: 'Brand New',
          location: 'Street 1',
          phone: '+49 000',
          url: 'https://brand-new.example',
          'date-created': '2026-02-06T12:00:00Z',
        },
        {
          category: 'Pizza',
          items: [
            { name: 'A', ingredients: 'A', price: 1 },
            { name: 'B', ingredients: 'B', price: 2 },
          ],
        },
      ],
    };

    const preview = await menuService.previewMenuImportFromJson(payload);
    expect(preview.menuExists).toBe(false);
    expect(preview.itemSummary).toEqual({ created: 2, updated: 0, deleted: 0 });

    const menus = await menuService.listMenus();
    expect(menus).toHaveLength(0);
  });
});

