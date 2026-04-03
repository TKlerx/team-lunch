import prisma from '../db.js';
import { broadcast } from '../sse.js';
import type { ShoppingListItem } from '../../lib/types.js';
import { ensureDefaultOfficeLocation, validateOfficeLocationId } from './officeLocation.js';

function formatShoppingListItem(item: {
  id: string;
  name: string;
  requestedBy: string;
  bought: boolean;
  boughtBy: string | null;
  boughtAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ShoppingListItem {
  return {
    id: item.id,
    name: item.name,
    requestedBy: item.requestedBy,
    bought: item.bought,
    boughtBy: item.boughtBy,
    boughtAt: item.boughtAt ? item.boughtAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function resolveShoppingOfficeLocationId(officeLocationId?: string): Promise<string> {
  if (officeLocationId?.trim()) {
    return (await validateOfficeLocationId(officeLocationId)).id;
  }

  return (await ensureDefaultOfficeLocation()).id;
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 160) {
    throw Object.assign(new Error('Shopping list item name must be 1-160 characters'), {
      statusCode: 400,
    });
  }
  return trimmed;
}

function validateActor(nickname: string): string {
  const trimmed = nickname.trim();
  if (!trimmed || trimmed.length > 255) {
    throw Object.assign(new Error('Nickname must be 1-255 characters'), {
      statusCode: 400,
    });
  }
  return trimmed;
}

export async function listShoppingListItems(officeLocationId?: string): Promise<ShoppingListItem[]> {
  const resolvedOfficeLocationId = await resolveShoppingOfficeLocationId(officeLocationId);
  const items = await prisma.shoppingListItem.findMany({
    where: { officeLocationId: resolvedOfficeLocationId },
    orderBy: [{ bought: 'asc' }, { createdAt: 'desc' }],
  });
  return items.map(formatShoppingListItem);
}

export async function addShoppingListItem(
  name: string,
  requestedBy: string,
  officeLocationId?: string,
): Promise<ShoppingListItem> {
  const resolvedOfficeLocationId = await resolveShoppingOfficeLocationId(officeLocationId);
  const item = await prisma.shoppingListItem.create({
    data: {
      officeLocationId: resolvedOfficeLocationId,
      name: validateName(name),
      requestedBy: validateActor(requestedBy),
      bought: false,
      boughtBy: null,
      boughtAt: null,
    },
  });

  const formatted = formatShoppingListItem(item);
  broadcast('shopping_list_item_added', { item: formatted }, resolvedOfficeLocationId);
  return formatted;
}

export async function markShoppingListItemBought(
  itemId: string,
  boughtBy: string,
  officeLocationId?: string,
): Promise<ShoppingListItem> {
  const resolvedOfficeLocationId = await resolveShoppingOfficeLocationId(officeLocationId);
  const existing = await prisma.shoppingListItem.findFirst({
    where: { id: itemId, officeLocationId: resolvedOfficeLocationId },
  });
  if (!existing) {
    throw Object.assign(new Error('Shopping list item not found'), { statusCode: 404 });
  }
  if (existing.bought) {
    throw Object.assign(new Error('Shopping list item is already marked as bought'), {
      statusCode: 409,
    });
  }

  const updated = await prisma.shoppingListItem.update({
    where: { id: itemId },
    data: {
      bought: true,
      boughtBy: validateActor(boughtBy),
      boughtAt: new Date(),
    },
  });

  const formatted = formatShoppingListItem(updated);
  broadcast('shopping_list_item_updated', { item: formatted }, resolvedOfficeLocationId);
  return formatted;
}
