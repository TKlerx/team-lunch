import prisma from "../db.js";
import { serviceError } from "../routes/routeUtils.js";
import type { Prisma } from "../generated/client/client.js";

export interface MenuItemIdentityResult {
  menuItemId: string;
  menuItemIdentityId: string;
  itemIdentityKey: string;
  displayNameSnapshot: string;
}

type MenuItemIdentityDb = Pick<
  Prisma.TransactionClient,
  "menuItem" | "menuItemIdentity"
>;

function normalizeWhitespace(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Stable identity key used to link the same dish across re-imports.
 * Keeps letters/numbers, collapses punctuation and whitespace to hyphens.
 */
export function normalizeMenuItemIdentityKey(name: string): string {
  const normalized = normalizeWhitespace(name)
    .replace(/[\p{Z}\p{P}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return normalized;
}

async function resolveMenuItem(
  db: MenuItemIdentityDb,
  menuItemId: string,
  officeLocationId: string,
): Promise<{ id: string; name: string; itemIdentityKey: string | null }> {
  const menuItem = await db.menuItem.findFirst({
    where: { id: menuItemId, menu: { officeLocationId } },
    select: { id: true, name: true, itemIdentityKey: true },
  });

  if (!menuItem) {
    throw serviceError("Menu item not found", 404);
  }

  return menuItem;
}

export async function ensureMenuItemIdentity(
  menuItemId: string,
  officeLocationId: string,
  db: MenuItemIdentityDb = prisma,
): Promise<MenuItemIdentityResult> {
  const menuItem = await resolveMenuItem(db, menuItemId, officeLocationId);
  const itemIdentityKey = normalizeMenuItemIdentityKey(menuItem.name);

  if (!itemIdentityKey) {
    throw serviceError(
      "Menu item name must contain at least one alphanumeric character",
      400,
    );
  }

  const identity = await db.menuItemIdentity.upsert({
    where: {
      officeLocationId_identityKey: {
        officeLocationId,
        identityKey: itemIdentityKey,
      },
    },
    create: {
      officeLocationId,
      identityKey: itemIdentityKey,
      displayNameSnapshot: menuItem.name,
    },
    update: {
      displayNameSnapshot: menuItem.name,
    },
  });

  await db.menuItem.update({
    where: { id: menuItem.id },
    data: { itemIdentityKey },
  });

  return {
    menuItemId: menuItem.id,
    menuItemIdentityId: identity.id,
    itemIdentityKey,
    displayNameSnapshot: identity.displayNameSnapshot,
  };
}
