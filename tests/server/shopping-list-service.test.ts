import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';

vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
}));

import { broadcast } from '../../src/server/sse.js';
import * as shoppingListService from '../../src/server/services/shoppingList.js';
import { createOfficeLocation } from '../../src/server/services/officeLocation.js';

describe('shopping list service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('adds a shopping list item and broadcasts it', async () => {
    const item = await shoppingListService.addShoppingListItem('Coffee beans', 'alice@example.com');

    expect(item.name).toBe('Coffee beans');
    expect(item.requestedBy).toBe('alice@example.com');
    expect(item.bought).toBe(false);
    expect(broadcast).toHaveBeenCalledWith(
      'shopping_list_item_added',
      expect.objectContaining({
        item: expect.objectContaining({
          id: item.id,
          name: 'Coffee beans',
        }),
      }),
      expect.any(String),
    );
  });

  it('marks an item as bought and broadcasts the update', async () => {
    const item = await shoppingListService.addShoppingListItem('Oat milk', 'alice@example.com');

    const updated = await shoppingListService.markShoppingListItemBought(
      item.id,
      'bob@example.com',
    );

    expect(updated.bought).toBe(true);
    expect(updated.boughtBy).toBe('bob@example.com');
    expect(updated.boughtAt).toEqual(expect.any(String));
    expect(broadcast).toHaveBeenCalledWith(
      'shopping_list_item_updated',
      expect.objectContaining({
        item: expect.objectContaining({
          id: item.id,
          bought: true,
        }),
      }),
      expect.any(String),
    );
  });

  it('lists shopping list items per office', async () => {
    const berlin = await createOfficeLocation('Berlin');
    const munich = await createOfficeLocation('Munich');

    await shoppingListService.addShoppingListItem('Coffee beans', 'alice@example.com', berlin.id);
    await shoppingListService.addShoppingListItem('Tea bags', 'bob@example.com', munich.id);

    const berlinItems = await shoppingListService.listShoppingListItems(berlin.id);
    const munichItems = await shoppingListService.listShoppingListItems(munich.id);

    expect(berlinItems).toHaveLength(1);
    expect(berlinItems[0].name).toBe('Coffee beans');
    expect(munichItems).toHaveLength(1);
    expect(munichItems[0].name).toBe('Tea bags');
  });
});
