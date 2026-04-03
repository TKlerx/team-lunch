import prisma from '../db.js';
import { broadcast } from '../sse.js';
import type { Prisma } from '@prisma/client';
import { ensureDefaultOfficeLocation, validateOfficeLocationId } from './officeLocation.js';
import type {
  Menu,
  MenuItem,
  ImportMenuViolation,
  ImportMenuItemSummary,
  ImportMenuPreviewResponse,
} from '../../lib/types.js';

type ImportItem = {
  itemNumber: string | null;
  name: string;
  description: string;
  price: number;
};

type ParsedMenuImport = {
  name: string;
  location: string | null;
  phone: string | null;
  url: string | null;
  sourceDateCreated: Date;
  items: ImportItem[];
};

type ExistingItemLite = {
  itemNumber: string | null;
  name: string;
  description: string | null;
  price: { toString(): string } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decimalPlaces(value: number): number {
  const asText = value.toString();
  const idx = asText.indexOf('.');
  return idx === -1 ? 0 : asText.length - idx - 1;
}

function validateItemName(name: string): string {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 80) {
    throw Object.assign(new Error('Item name must be 1–80 characters'), { statusCode: 400 });
  }

  return trimmedName;
}

function validateItemDescription(description?: string): string | null {
  const trimmedDesc = description?.trim() || null;
  if (trimmedDesc && trimmedDesc.length > 200) {
    throw Object.assign(new Error('Description must be at most 200 characters'), { statusCode: 400 });
  }

  return trimmedDesc;
}

function validateItemNumber(itemNumber?: string | null): string | null {
  if (typeof itemNumber !== 'string') return null;

  const trimmedItemNumber = itemNumber.trim();
  if (!trimmedItemNumber) return null;
  if (trimmedItemNumber.length > 40) {
    throw Object.assign(new Error('Item number must be at most 40 characters'), { statusCode: 400 });
  }

  return trimmedItemNumber;
}

function validateItemPrice(price?: number | null): number | null {
  if (price === undefined || price === null) return null;
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw Object.assign(new Error('Price must be a finite number'), { statusCode: 400 });
  }
  if (price < 0 || price > 9999.99) {
    throw Object.assign(new Error('Price must be between 0 and 9999.99'), { statusCode: 400 });
  }
  if (decimalPlaces(price) > 2) {
    throw Object.assign(new Error('Price must have at most 2 decimal places'), { statusCode: 400 });
  }

  return price;
}

function validateMenuName(name: string): string {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 60) {
    throw Object.assign(new Error('Menu name must be 1–60 characters'), { statusCode: 400 });
  }

  return trimmedName;
}

function validateMenuLocation(location?: string | null): string | null {
  if (location === undefined || location === null) {
    return null;
  }

  const trimmedLocation = location.trim();
  if (!trimmedLocation) {
    return null;
  }
  if (trimmedLocation.length > 160) {
    throw Object.assign(new Error('Location must be at most 160 characters'), { statusCode: 400 });
  }

  return trimmedLocation;
}

function validateMenuPhone(phone?: string | null): string | null {
  if (phone === undefined || phone === null) {
    return null;
  }

  const trimmedPhone = phone.trim();
  if (!trimmedPhone) {
    return null;
  }
  if (trimmedPhone.length > 40) {
    throw Object.assign(new Error('Phone must be at most 40 characters'), { statusCode: 400 });
  }

  return trimmedPhone;
}

function validateMenuUrl(url?: string | null): string | null {
  if (url === undefined || url === null) {
    return null;
  }

  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return null;
  }
  if (trimmedUrl.length > 255) {
    throw Object.assign(new Error('URL must be at most 255 characters'), { statusCode: 400 });
  }
  try {
    new URL(trimmedUrl);
  } catch {
    throw Object.assign(new Error('URL must be a valid absolute URL'), { statusCode: 400 });
  }

  return trimmedUrl;
}

// ─── Formatters ────────────────────────────────────────────

function formatMenu(m: {
  id: string;
  name: string;
  location: string | null;
  phone: string | null;
  url: string | null;
  sourceDateCreated: Date | null;
  createdAt: Date;
  items: Array<{
    id: string;
    menuId: string;
    itemNumber: string | null;
    name: string;
    description: string | null;
    price: { toString(): string } | null;
    createdAt: Date;
  }>;
}): Menu {
  return {
    id: m.id,
    name: m.name,
    location: m.location,
    phone: m.phone,
    url: m.url,
    sourceDateCreated: m.sourceDateCreated?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    items: m.items.map(formatMenuItem),
    itemCount: m.items.length,
  };
}

function formatMenuItem(i: {
  id: string;
  menuId: string;
  itemNumber: string | null;
  name: string;
  description: string | null;
  price: { toString(): string } | null;
  createdAt: Date;
}): MenuItem {
  return {
    id: i.id,
    menuId: i.menuId,
    itemNumber: i.itemNumber,
    name: i.name,
    description: i.description,
    price: i.price === null ? null : Number(i.price.toString()),
    createdAt: i.createdAt.toISOString(),
  };
}

function parseMenuImportPayload(payload: unknown): {
  parsed: ParsedMenuImport | null;
  violations: ImportMenuViolation[];
} {
  const violations: ImportMenuViolation[] = [];
  if (!isRecord(payload)) {
    return {
      parsed: null,
      violations: [{ path: 'payload', message: 'Payload must be an object' }],
    };
  }

  const menuValue = payload.menu;
  if (!Array.isArray(menuValue)) {
    return {
      parsed: null,
      violations: [{ path: 'menu', message: 'menu must be an array' }],
    };
  }

  if (menuValue.length < 2) {
    return {
      parsed: null,
      violations: [{ path: 'menu', message: 'menu must contain metadata and at least one category block' }],
    };
  }

  const metadata = menuValue[0];
  if (!isRecord(metadata)) {
    return {
      parsed: null,
      violations: [{ path: 'menu[0]', message: 'menu[0] must be a metadata object' }],
    };
  }

  const rawName = metadata.name;
  const rawLocation = metadata.location;
  const rawPhone = metadata.phone;
  const rawUrl = metadata.url;
  const rawDateCreated = metadata['date-created'];

  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name || name.length > 60) {
    violations.push({ path: 'menu[0].name', message: 'name must be 1–60 characters' });
  }

  let location: string | null = null;
  if (typeof rawLocation === 'string') {
    const trimmedLocation = rawLocation.trim();
    if (trimmedLocation) {
      if (trimmedLocation.length > 160) {
        violations.push({ path: 'menu[0].location', message: 'location must be at most 160 characters' });
      } else {
        location = trimmedLocation;
      }
    }
  }

  let phone: string | null = null;
  if (typeof rawPhone === 'string') {
    const trimmedPhone = rawPhone.trim();
    if (trimmedPhone) {
      if (trimmedPhone.length > 40) {
        violations.push({ path: 'menu[0].phone', message: 'phone must be at most 40 characters' });
      } else {
        phone = trimmedPhone;
      }
    }
  }

  let url: string | null = null;
  if (typeof rawUrl === 'string') {
    const trimmedUrl = rawUrl.trim();
    if (trimmedUrl) {
      if (trimmedUrl.length > 255) {
        violations.push({ path: 'menu[0].url', message: 'url must be at most 255 characters' });
      } else {
        try {
          new URL(trimmedUrl);
          url = trimmedUrl;
        } catch {
          violations.push({ path: 'menu[0].url', message: 'url must be a valid absolute URL' });
        }
      }
    }
  }

  let sourceDateCreated: Date | null = null;
  if (typeof rawDateCreated !== 'string' || !rawDateCreated.trim()) {
    violations.push({ path: 'menu[0].date-created', message: 'date-created must be a non-empty ISO datetime string' });
  } else {
    const parsedDate = new Date(rawDateCreated);
    if (Number.isNaN(parsedDate.getTime())) {
      violations.push({ path: 'menu[0].date-created', message: 'date-created must be a valid ISO datetime' });
    } else {
      sourceDateCreated = parsedDate;
    }
  }

  const items: ImportItem[] = [];
  for (let sectionIndex = 1; sectionIndex < menuValue.length; sectionIndex += 1) {
    const section = menuValue[sectionIndex];
    if (!isRecord(section)) {
      violations.push({ path: `menu[${sectionIndex}]`, message: 'category block must be an object' });
      continue;
    }

    const sectionItems = section.items;
    if (!Array.isArray(sectionItems)) {
      violations.push({ path: `menu[${sectionIndex}].items`, message: 'items must be an array' });
      continue;
    }

    for (let itemIndex = 0; itemIndex < sectionItems.length; itemIndex += 1) {
      const item = sectionItems[itemIndex];
      const itemPath = `menu[${sectionIndex}].items[${itemIndex}]`;
      if (!isRecord(item)) {
        violations.push({ path: itemPath, message: 'item must be an object' });
        continue;
      }

      const rawItemName = item.name;
      const rawItemNumber = item['item-number'];
      const rawIngredients = item.ingredients;
      const rawPrice = item.price;

      const itemName = typeof rawItemName === 'string' ? rawItemName.trim() : '';
      if (!itemName || itemName.length > 80) {
        violations.push({ path: `${itemPath}.name`, message: 'name must be 1–80 characters' });
      }

      let itemNumber: string | null = null;
      if (typeof rawItemNumber === 'string') {
        const trimmedItemNumber = rawItemNumber.trim();
        if (trimmedItemNumber) {
          if (trimmedItemNumber.length > 40) {
            violations.push({ path: `${itemPath}.item-number`, message: 'item-number must be at most 40 characters' });
          } else {
            itemNumber = trimmedItemNumber;
          }
        }
      }

      const ingredients = typeof rawIngredients === 'string' ? rawIngredients.trim() : '';
      if (!ingredients) {
        violations.push({ path: `${itemPath}.ingredients`, message: 'ingredients must be a non-empty string' });
      } else if (ingredients.length > 200) {
        violations.push({ path: `${itemPath}.ingredients`, message: 'ingredients must be at most 200 characters' });
      }

      if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice)) {
        violations.push({ path: `${itemPath}.price`, message: 'price must be a finite number' });
      } else if (rawPrice < 0 || rawPrice > 9999.99) {
        violations.push({ path: `${itemPath}.price`, message: 'price must be between 0 and 9999.99' });
      } else if (decimalPlaces(rawPrice) > 2) {
        violations.push({ path: `${itemPath}.price`, message: 'price must have at most 2 decimal places' });
      }

      if (
        itemName
        && itemName.length <= 80
        && ingredients
        && ingredients.length <= 200
        && typeof rawPrice === 'number'
        && Number.isFinite(rawPrice)
        && rawPrice >= 0
        && rawPrice <= 9999.99
        && decimalPlaces(rawPrice) <= 2
      ) {
        items.push({
          itemNumber,
          name: itemName,
          description: ingredients,
          price: rawPrice,
        });
      }
    }
  }

  if (items.length === 0) {
    violations.push({ path: 'menu', message: 'import must contain at least one valid item' });
  }

  const seen = new Map<string, number>();
  items.forEach((item, index) => {
    const key = item.name.toLocaleLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined) {
      violations.push({ path: `items[${index}].name`, message: `duplicate item name "${item.name}"` });
      return;
    }
    seen.set(key, index);
  });

  if (violations.length > 0 || !sourceDateCreated) {
    return { parsed: null, violations };
  }

  return {
    parsed: {
      name,
      location,
      phone,
      url,
      sourceDateCreated,
      items,
    },
    violations,
  };
}

async function resolveMenuOfficeLocationId(officeLocationId?: string): Promise<string> {
  if (officeLocationId?.trim()) {
    return (await validateOfficeLocationId(officeLocationId)).id;
  }

  return (await ensureDefaultOfficeLocation()).id;
}

function computeItemSummary(
  importedItems: ImportItem[],
  existingItems: ExistingItemLite[],
): ImportMenuItemSummary {
  const existingByName = new Map<string, ExistingItemLite>();
  existingItems.forEach((item) => {
    existingByName.set(item.name.toLocaleLowerCase(), item);
  });

  let created = 0;
  let updated = 0;

  const importedNames = new Set<string>();
  importedItems.forEach((item) => {
    const key = item.name.toLocaleLowerCase();
    importedNames.add(key);
    const existing = existingByName.get(key);
    if (!existing) {
      created += 1;
      return;
    }

    const existingDescription = existing.description ?? '';
    const existingItemNumber = existing.itemNumber ?? null;
    const existingPrice = existing.price === null ? null : Number(existing.price.toString());
    if (
      existingDescription !== item.description
      || existingPrice !== item.price
      || existingItemNumber !== item.itemNumber
    ) {
      updated += 1;
    }
  });

  let deleted = 0;
  existingItems.forEach((item) => {
    const key = item.name.toLocaleLowerCase();
    if (!importedNames.has(key)) {
      deleted += 1;
    }
  });

  return { created, updated, deleted };
}

async function previewImport(
  payload: unknown,
  officeLocationId: string,
): Promise<{
  parsed: ParsedMenuImport;
  existingMenu: { id: string; items: ExistingItemLite[] } | null;
  itemSummary: ImportMenuItemSummary;
}> {
  const { parsed, violations } = parseMenuImportPayload(payload);
  if (!parsed || violations.length > 0) {
    throw Object.assign(new Error('Import payload validation failed'), {
      statusCode: 400,
      violations,
    });
  }

  const existingMenu = await prisma.menu.findFirst({
    where: {
      officeLocationId,
      name: { equals: parsed.name, mode: 'insensitive' },
    },
    include: {
      items: {
        select: {
          itemNumber: true,
          name: true,
          description: true,
          price: true,
        },
      },
    },
  });

  const itemSummary = computeItemSummary(parsed.items, existingMenu?.items ?? []);

  return {
    parsed,
    existingMenu: existingMenu ? { id: existingMenu.id, items: existingMenu.items } : null,
    itemSummary,
  };
}

// ─── Menu CRUD ─────────────────────────────────────────────

export async function listMenus(officeLocationId?: string): Promise<Menu[]> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const menus = await prisma.menu.findMany({
    where: { officeLocationId: resolvedOfficeLocationId },
    include: { items: { orderBy: { createdAt: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  return menus.map(formatMenu);
}

export async function createMenu(name: string, officeLocationId?: string): Promise<Menu> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const trimmed = validateMenuName(name);

  // Case-insensitive uniqueness check
  const existing = await prisma.menu.findFirst({
    where: {
      officeLocationId: resolvedOfficeLocationId,
      name: { equals: trimmed, mode: 'insensitive' },
    },
  });
  if (existing) {
    throw Object.assign(new Error(`A menu named "${existing.name}" already exists`), { statusCode: 409 });
  }

  const menu = await prisma.menu.create({
    data: { name: trimmed, officeLocationId: resolvedOfficeLocationId },
    include: { items: true },
  });

  const formatted = formatMenu(menu);
  broadcast('menu_created', { menu: formatted }, resolvedOfficeLocationId);
  return formatted;
}

type UpdateMenuPayload = {
  name: string;
  location?: string | null;
  phone?: string | null;
  url?: string | null;
};

export async function updateMenu(
  id: string,
  payload: string | UpdateMenuPayload,
  officeLocationId?: string,
): Promise<Menu> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const updatePayload = typeof payload === 'string' ? { name: payload } : payload;
  const trimmed = validateMenuName(updatePayload.name);

  // Check menu exists
  const current = await prisma.menu.findFirst({ where: { id, officeLocationId: resolvedOfficeLocationId } });
  if (!current) {
    throw Object.assign(new Error('Menu not found'), { statusCode: 404 });
  }

  // Case-insensitive uniqueness — allow keeping same name (case change)
  const existing = await prisma.menu.findFirst({
    where: {
      name: { equals: trimmed, mode: 'insensitive' },
      officeLocationId: resolvedOfficeLocationId,
      id: { not: id },
    },
  });
  if (existing) {
    throw Object.assign(new Error(`A menu named "${existing.name}" already exists`), { statusCode: 409 });
  }

  const updates: {
    name: string;
    location?: string | null;
    phone?: string | null;
    url?: string | null;
  } = { name: trimmed };

  if ('location' in updatePayload) {
    updates.location = validateMenuLocation(updatePayload.location);
  }
  if ('phone' in updatePayload) {
    updates.phone = validateMenuPhone(updatePayload.phone);
  }
  if ('url' in updatePayload) {
    updates.url = validateMenuUrl(updatePayload.url);
  }

  const menu = await prisma.menu.update({
    where: { id },
    data: updates,
    include: { items: { orderBy: { createdAt: 'asc' } } },
  });

  const formatted = formatMenu(menu);
  broadcast('menu_updated', { menu: formatted }, resolvedOfficeLocationId);
  return formatted;
}

export async function deleteMenu(id: string, officeLocationId?: string): Promise<void> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const menu = await prisma.menu.findFirst({ where: { id, officeLocationId: resolvedOfficeLocationId } });
  if (!menu) {
    throw Object.assign(new Error('Menu not found'), { statusCode: 404 });
  }

  await prisma.menu.delete({ where: { id } });
  broadcast('menu_deleted', { menuId: id }, resolvedOfficeLocationId);
}

// ─── Menu Item CRUD ────────────────────────────────────────

export async function listItems(menuId: string, officeLocationId?: string): Promise<MenuItem[]> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const menu = await prisma.menu.findFirst({ where: { id: menuId, officeLocationId: resolvedOfficeLocationId } });
  if (!menu) {
    throw Object.assign(new Error('Menu not found'), { statusCode: 404 });
  }

  const items = await prisma.menuItem.findMany({
    where: { menuId },
    orderBy: { createdAt: 'asc' },
  });
  return items.map(formatMenuItem);
}

export async function createItem(
  menuId: string,
  name: string,
  description?: string,
  itemNumber?: string | null,
  price?: number | null,
  officeLocationId?: string,
): Promise<MenuItem> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const trimmedName = validateItemName(name);
  const trimmedDesc = validateItemDescription(description);
  const trimmedItemNumber = validateItemNumber(itemNumber);
  const validatedPrice = validateItemPrice(price);

  // Check menu exists
  const menu = await prisma.menu.findFirst({ where: { id: menuId, officeLocationId: resolvedOfficeLocationId } });
  if (!menu) {
    throw Object.assign(new Error('Menu not found'), { statusCode: 404 });
  }

  // Case-insensitive uniqueness within menu
  const existing = await prisma.menuItem.findFirst({
    where: {
      menuId,
      name: { equals: trimmedName, mode: 'insensitive' },
    },
  });
  if (existing) {
    throw Object.assign(new Error(`An item named "${existing.name}" already exists in this menu`), {
      statusCode: 409,
    });
  }

  const item = await prisma.menuItem.create({
    data: {
      menuId,
      itemNumber: trimmedItemNumber,
      name: trimmedName,
      description: trimmedDesc,
      price: validatedPrice,
    },
  });

  const formatted = formatMenuItem(item);
  broadcast('item_created', { item: formatted }, resolvedOfficeLocationId);
  return formatted;
}

export async function updateItem(
  id: string,
  name: string,
  description?: string,
  itemNumber?: string | null,
  price?: number | null,
  officeLocationId?: string,
): Promise<MenuItem> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const trimmedName = validateItemName(name);
  const trimmedDesc = validateItemDescription(description);
  const trimmedItemNumber = validateItemNumber(itemNumber);
  const validatedPrice = validateItemPrice(price);

  const current = await prisma.menuItem.findFirst({
    where: { id, menu: { officeLocationId: resolvedOfficeLocationId } },
  });
  if (!current) {
    throw Object.assign(new Error('Item not found'), { statusCode: 404 });
  }

  // Case-insensitive uniqueness within same menu (excluding self)
  const existing = await prisma.menuItem.findFirst({
    where: {
      menuId: current.menuId,
      name: { equals: trimmedName, mode: 'insensitive' },
      id: { not: id },
    },
  });
  if (existing) {
    throw Object.assign(new Error(`An item named "${existing.name}" already exists in this menu`), {
      statusCode: 409,
    });
  }

  const item = await prisma.menuItem.update({
    where: { id },
    data: {
      itemNumber: trimmedItemNumber,
      name: trimmedName,
      description: trimmedDesc,
      price: validatedPrice,
    },
  });

  const formatted = formatMenuItem(item);
  broadcast('item_updated', { item: formatted }, resolvedOfficeLocationId);
  return formatted;
}

export async function deleteItem(id: string, officeLocationId?: string): Promise<{ menuId: string }> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const item = await prisma.menuItem.findFirst({
    where: { id, menu: { officeLocationId: resolvedOfficeLocationId } },
  });
  if (!item) {
    throw Object.assign(new Error('Item not found'), { statusCode: 404 });
  }

  await prisma.menuItem.delete({ where: { id } });
  broadcast('item_deleted', { itemId: id, menuId: item.menuId }, resolvedOfficeLocationId);
  return { menuId: item.menuId };
}

export async function importMenuFromJson(
  payload: unknown,
  officeLocationId?: string,
): Promise<{ menu: Menu; created: boolean }> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const { parsed } = await previewImport(payload, resolvedOfficeLocationId);

  const { menu, created } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.menu.findFirst({
      where: {
        officeLocationId: resolvedOfficeLocationId,
        name: { equals: parsed.name, mode: 'insensitive' },
      },
    });

    if (existing) {
      await tx.menu.update({
        where: { id: existing.id },
        data: {
          name: parsed.name,
          location: parsed.location,
          phone: parsed.phone,
          url: parsed.url,
          sourceDateCreated: parsed.sourceDateCreated,
        },
      });

      await tx.menuItem.deleteMany({ where: { menuId: existing.id } });

      await tx.menuItem.createMany({
        data: parsed.items.map((item) => ({
          menuId: existing.id,
          itemNumber: item.itemNumber,
          name: item.name,
          description: item.description,
          price: item.price,
        })),
      });

      const updated = await tx.menu.findUniqueOrThrow({
        where: { id: existing.id },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });

      return { menu: formatMenu(updated), created: false };
    }

    const createdMenu = await tx.menu.create({
      data: {
        name: parsed.name,
        officeLocationId: resolvedOfficeLocationId,
        location: parsed.location,
        phone: parsed.phone,
        url: parsed.url,
        sourceDateCreated: parsed.sourceDateCreated,
      },
    });

    await tx.menuItem.createMany({
      data: parsed.items.map((item) => ({
        menuId: createdMenu.id,
        itemNumber: item.itemNumber,
        name: item.name,
        description: item.description,
        price: item.price,
      })),
    });

    const createdWithItems = await tx.menu.findUniqueOrThrow({
      where: { id: createdMenu.id },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });

    return { menu: formatMenu(createdWithItems), created: true };
  });

  if (created) {
    broadcast('menu_created', { menu }, resolvedOfficeLocationId);
  } else {
    broadcast('menu_updated', { menu }, resolvedOfficeLocationId);
  }

  return { menu, created };
}

export async function previewMenuImportFromJson(
  payload: unknown,
  officeLocationId?: string,
): Promise<ImportMenuPreviewResponse> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const { parsed, existingMenu, itemSummary } = await previewImport(payload, resolvedOfficeLocationId);

  return {
    menuName: parsed.name,
    menuExists: existingMenu !== null,
    itemSummary,
  };
}

export { formatMenu, formatMenuItem };
