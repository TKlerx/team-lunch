import prisma from '../db.js';
import { broadcast } from '../sse.js';
import type { Prisma } from '../generated/client/client.js';
import { ensureDefaultOfficeLocation, validateOfficeLocationId } from './officeLocation.js';
import { ensureMenuItemIdentity, normalizeMenuItemIdentityKey } from './mealItemIdentity.js';
import { extractFeatures } from './mealFeatures.js';
import { buildSanitizedTaggingPayload, requestAiFeatureTags } from './mealRecommendationAi.js';
import { MENU_TAG_PROVENANCE, validateMenuLabels, validateMenuTags } from '../../lib/menuItemTags.js';
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
  tags: string[];
  allergens: string[];
  additives: string[];
};

type ParsedMenuImport = {
  name: string;
  location: string | null;
  phone: string | null;
  url: string | null;
  orderUrl: string | null;
  sourceDateCreated: Date;
  items: ImportItem[];
};

type ExistingItemLite = {
  itemNumber: string | null;
  name: string;
  description: string | null;
  price: { toString(): string } | null;
};

type MenuItemLabelsInput = {
  tags?: unknown;
  allergens?: unknown;
  additives?: unknown;
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

function menuNameEqualsFilter(name: string): { equals: string; mode: 'insensitive' } {
  return { equals: name, mode: 'insensitive' };
}

function itemNameEqualsFilter(name: string): { equals: string; mode: 'insensitive' } {
  return menuNameEqualsFilter(name);
}

async function findMenuByName(
  delegate: Pick<Prisma.TransactionClient['menu'], 'findFirst'>,
  officeLocationId: string,
  name: string,
  excludedId?: string,
) {
  return delegate.findFirst({
    where: {
      officeLocationId,
      name: menuNameEqualsFilter(name),
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
  });
}

async function findMenuItemByName(
  menuId: string,
  name: string,
  excludedId?: string,
) {
  return prisma.menuItem.findFirst({
    where: {
      menuId,
      name: itemNameEqualsFilter(name),
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
  });
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

function validateMenuUrl(url?: string | null, fieldLabel = 'URL'): string | null {
  if (url === undefined || url === null) {
    return null;
  }

  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return null;
  }
  if (trimmedUrl.length > 255) {
    throw Object.assign(new Error(`${fieldLabel} must be at most 255 characters`), { statusCode: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    throw Object.assign(new Error(`${fieldLabel} must be a valid absolute URL`), { statusCode: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw Object.assign(new Error(`${fieldLabel} must use http or https`), { statusCode: 400 });
  }

  return trimmedUrl;
}

function parseImportItemTags(rawTags: unknown, itemPath: string, violations: ImportMenuViolation[]): string[] {
  const validatedTags = validateMenuTags(rawTags, `${itemPath}.tags`);
  if (validatedTags.error) {
    violations.push({ path: `${itemPath}.tags`, message: validatedTags.error });
  }
  return validatedTags.tags;
}

function parseImportItemLabels(
  rawLabels: unknown,
  labelType: 'allergens' | 'additives',
  itemPath: string,
  violations: ImportMenuViolation[],
): string[] {
  const path = `${itemPath}.${labelType}`;
  const validated = validateMenuLabels(rawLabels, path);
  if (validated.error) {
    violations.push({ path, message: validated.error });
  }
  return validated.labels;
}

function validateItemLabels(labels: unknown, labelType: 'allergens' | 'additives'): string[] {
  const validated = validateMenuLabels(labels, labelType);
  if (validated.error) {
    throw Object.assign(new Error(validated.error), { statusCode: 400 });
  }
  return validated.labels;
}

function parseMenuItemLabels(labels?: MenuItemLabelsInput | unknown[]): MenuItemLabelsInput {
  return Array.isArray(labels) ? { tags: labels } : labels ?? {};
}

// ─── Formatters ────────────────────────────────────────────

function formatMenu(m: {
  id: string;
  name: string;
  location: string | null;
  phone: string | null;
  url: string | null;
  orderUrl: string | null;
  sourceDateCreated: Date | null;
  createdAt: Date;
  items: Array<{
    id: string;
    menuId: string;
    itemNumber: string | null;
    name: string;
    description: string | null;
    price: { toString(): string } | null;
    allergens?: string[];
    additives?: string[];
    createdAt: Date;
    menuItemFeatures?: Array<{ tag: string }>;
  }>;
}): Menu {
  return {
    id: m.id,
    name: m.name,
    location: m.location,
    phone: m.phone,
    url: m.url,
    orderUrl: m.orderUrl,
    sourceDateCreated: m.sourceDateCreated?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    items: [...m.items].sort(compareMenuItems).map(formatMenuItem),
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
  allergens?: string[];
  additives?: string[];
  createdAt: Date;
  menuItemFeatures?: Array<{ tag: string }>;
}): MenuItem {
  return {
    id: i.id,
    menuId: i.menuId,
    itemNumber: i.itemNumber,
    name: i.name,
    description: i.description,
    price: i.price === null ? null : Number(i.price.toString()),
    tags: i.menuItemFeatures?.map((feature) => feature.tag) ?? [],
    allergens: i.allergens ?? [],
    additives: i.additives ?? [],
    createdAt: i.createdAt.toISOString(),
  };
}

const itemOrderBy = [{ itemNumber: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }];

// itemNumber is a VarChar, so the DB orderBy above sorts "1","10","100","2" lexicographically.
// Re-sort in app code with a numeric-aware collator so "2" comes before "10".
const itemNumberCollator = new Intl.Collator('en', { numeric: true });
function compareMenuItems(
  a: { itemNumber: string | null; createdAt: Date; id: string },
  b: { itemNumber: string | null; createdAt: Date; id: string },
): number {
  if (a.itemNumber !== b.itemNumber) {
    if (a.itemNumber === null) return 1;
    if (b.itemNumber === null) return -1;
    const byNumber = itemNumberCollator.compare(a.itemNumber, b.itemNumber);
    if (byNumber !== 0) return byNumber;
  }
  const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
  return byCreated !== 0 ? byCreated : a.id.localeCompare(b.id);
}
const menuTagInclude = {
  where: { provenance: MENU_TAG_PROVENANCE },
  select: { tag: true },
  orderBy: { tag: 'asc' as const },
};

async function replaceMenuTags(
  db: MenuItemDerivedDataDb,
  menuItem: { id: string; name: string },
  officeLocationId: string,
  tags: unknown,
): Promise<void> {
  const validated = validateMenuTags(tags);
  if (validated.error) {
    throw Object.assign(new Error(validated.error), { statusCode: 400 });
  }

  const identity = await ensureMenuItemIdentity(menuItem.id, officeLocationId, db);
  await db.menuItemFeature.deleteMany({
    where: { menuItemId: menuItem.id, provenance: MENU_TAG_PROVENANCE },
  });
  if (validated.tags.length === 0) return;

  await db.menuItemFeature.createMany({
    data: validated.tags.map((tag) => ({
      menuItemId: menuItem.id,
      itemIdentityKey: identity.itemIdentityKey,
      officeLocationId,
      tag,
      provenance: MENU_TAG_PROVENANCE,
    })),
  });
}

async function findFormattedMenuItem(id: string): Promise<MenuItem> {
  const item = await prisma.menuItem.findUniqueOrThrow({
    where: { id },
    include: { menuItemFeatures: menuTagInclude },
  });
  return formatMenuItem(item);
}

type MenuItemDerivedDataDb = Pick<Prisma.TransactionClient, 'menuItem' | 'menuItemIdentity' | 'menuItemFeature'>;

type MenuItemGapFillTarget = {
  menuItemId: string;
  itemName: string;
  description: string | null;
};

async function syncMenuItemDerivedData(
  db: MenuItemDerivedDataDb,
  menuItem: { id: string; name: string; description: string | null },
  officeLocationId: string,
): Promise<MenuItemGapFillTarget | null> {
  const identity = await ensureMenuItemIdentity(menuItem.id, officeLocationId, db);
  const tags = extractFeatures(menuItem.name, menuItem.description);

  await db.menuItemFeature.deleteMany({
    where: { menuItemId: menuItem.id, provenance: { in: ['keyword', 'ai'] } },
  });

  if (tags.length === 0) {
    return {
      menuItemId: menuItem.id,
      itemName: menuItem.name,
      description: menuItem.description,
    };
  }

  await db.menuItemFeature.createMany({
    data: tags.map((tag) => ({
      menuItemId: menuItem.id,
      itemIdentityKey: identity.itemIdentityKey,
      officeLocationId,
      tag,
      provenance: 'keyword',
    })),
  });

  return null;
}

async function syncMenuItemsDerivedData(
  db: MenuItemDerivedDataDb,
  menuId: string,
  officeLocationId: string,
): Promise<MenuItemGapFillTarget[]> {
  const items = await db.menuItem.findMany({
    where: { menuId },
    select: { id: true, name: true, description: true },
    orderBy: itemOrderBy,
  });

  const gapFillTargets: MenuItemGapFillTarget[] = [];
  for (const item of items) {
    const gapFillTarget = await syncMenuItemDerivedData(db, item, officeLocationId);
    if (gapFillTarget) {
      gapFillTargets.push(gapFillTarget);
    }
  }

  return gapFillTargets;
}

async function syncImportedMenuTags(
  db: MenuItemDerivedDataDb,
  menuId: string,
  officeLocationId: string,
  importedItems: ImportItem[],
): Promise<void> {
  const importedByName = new Map(importedItems.map((item) => [item.name.toLocaleLowerCase(), item]));
  const items = await db.menuItem.findMany({
    where: { menuId },
    select: { id: true, name: true },
  });

  for (const item of items) {
    await replaceMenuTags(
      db,
      item,
      officeLocationId,
      importedByName.get(item.name.toLocaleLowerCase())?.tags ?? [],
    );
  }
}

async function createImportedMenuItems(
  db: Pick<Prisma.TransactionClient, 'menuItem'>,
  menuId: string,
  items: ImportItem[],
): Promise<void> {
  await db.menuItem.createMany({
    data: items.map((item) => ({
      menuId,
      itemNumber: item.itemNumber,
      name: item.name,
      description: item.description,
      price: item.price,
      allergens: item.allergens,
      additives: item.additives,
    })),
  });
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
  const rawOrderUrl = metadata['order-url'];
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
          const parsed = new URL(trimmedUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            violations.push({ path: 'menu[0].url', message: 'url must use http or https' });
          } else {
            url = trimmedUrl;
          }
        } catch {
          violations.push({ path: 'menu[0].url', message: 'url must be a valid absolute URL' });
        }
      }
    }
  }

  let orderUrl: string | null = null;
  if (typeof rawOrderUrl === 'string') {
    const trimmedOrderUrl = rawOrderUrl.trim();
    if (trimmedOrderUrl) {
      if (trimmedOrderUrl.length > 255) {
        violations.push({ path: 'menu[0].order-url', message: 'order-url must be at most 255 characters' });
      } else {
        try {
          const parsed = new URL(trimmedOrderUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            violations.push({ path: 'menu[0].order-url', message: 'order-url must use http or https' });
          } else {
            orderUrl = trimmedOrderUrl;
          }
        } catch {
          violations.push({ path: 'menu[0].order-url', message: 'order-url must be a valid absolute URL' });
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
      const rawTags = item.tags;
      const rawAllergens = item.allergens;
      const rawAdditives = item.additives;

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

      const itemTags = parseImportItemTags(rawTags, itemPath, violations);
      const allergens = parseImportItemLabels(rawAllergens, 'allergens', itemPath, violations);
      const additives = parseImportItemLabels(rawAdditives, 'additives', itemPath, violations);

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
          tags: itemTags,
          allergens,
          additives,
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
      orderUrl,
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

  const existingMenu = await findMenuByName(prisma.menu, officeLocationId, parsed.name);
  const existingMenuWithItems = existingMenu
    ? await prisma.menu.findUnique({
        where: { id: existingMenu.id },
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
      })
    : null;

  const itemSummary = computeItemSummary(parsed.items, existingMenuWithItems?.items ?? []);

  return {
    parsed,
    existingMenu: existingMenuWithItems ? { id: existingMenuWithItems.id, items: existingMenuWithItems.items } : null,
    itemSummary,
  };
}

// ─── Menu CRUD ─────────────────────────────────────────────

export async function listMenus(officeLocationId?: string): Promise<Menu[]> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const menus = await prisma.menu.findMany({
    where: { officeLocationId: resolvedOfficeLocationId },
    include: { items: { orderBy: itemOrderBy, include: { menuItemFeatures: menuTagInclude } } },
    orderBy: { name: 'asc' },
  });
  return menus.map(formatMenu);
}

export async function createMenu(name: string, officeLocationId?: string): Promise<Menu> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const trimmed = validateMenuName(name);

  // Case-insensitive uniqueness check
  const existing = await findMenuByName(prisma.menu, resolvedOfficeLocationId, trimmed);
  if (existing) {
    throw Object.assign(new Error(`A menu named "${existing.name}" already exists`), { statusCode: 409 });
  }

  const menu = await prisma.menu.create({
    data: { name: trimmed, officeLocationId: resolvedOfficeLocationId },
    include: { items: { include: { menuItemFeatures: menuTagInclude } } },
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
  orderUrl?: string | null;
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
  const existing = await findMenuByName(prisma.menu, resolvedOfficeLocationId, trimmed, id);
  if (existing) {
    throw Object.assign(new Error(`A menu named "${existing.name}" already exists`), { statusCode: 409 });
  }

  const updates: {
    name: string;
    location?: string | null;
    phone?: string | null;
    url?: string | null;
    orderUrl?: string | null;
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
  if ('orderUrl' in updatePayload) {
    updates.orderUrl = validateMenuUrl(updatePayload.orderUrl, 'Order URL');
  }

  const menu = await prisma.menu.update({
    where: { id },
    data: updates,
    include: { items: { orderBy: itemOrderBy, include: { menuItemFeatures: menuTagInclude } } },
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
    orderBy: itemOrderBy,
    include: { menuItemFeatures: menuTagInclude },
  });
  return items.sort(compareMenuItems).map(formatMenuItem);
}

export async function createItem(
  menuId: string,
  name: string,
  description?: string,
  itemNumber?: string | null,
  price?: number | null,
  officeLocationId?: string,
  labels?: MenuItemLabelsInput | unknown[],
): Promise<MenuItem> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const trimmedName = validateItemName(name);
  const trimmedDesc = validateItemDescription(description);
  const trimmedItemNumber = validateItemNumber(itemNumber);
  const validatedPrice = validateItemPrice(price);
  const labelInput = parseMenuItemLabels(labels);
  const validatedAllergens = validateItemLabels(labelInput.allergens, 'allergens');
  const validatedAdditives = validateItemLabels(labelInput.additives, 'additives');

  // Check menu exists
  const menu = await prisma.menu.findFirst({ where: { id: menuId, officeLocationId: resolvedOfficeLocationId } });
  if (!menu) {
    throw Object.assign(new Error('Menu not found'), { statusCode: 404 });
  }

  // Case-insensitive uniqueness within menu
  const existing = await findMenuItemByName(menuId, trimmedName);
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
      allergens: validatedAllergens,
      additives: validatedAdditives,
    },
  });

  await syncMenuItemDerivedData(prisma, item, resolvedOfficeLocationId);
  await replaceMenuTags(prisma, item, resolvedOfficeLocationId, labelInput.tags);
  const formatted = await findFormattedMenuItem(item.id);
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
  labels?: MenuItemLabelsInput | unknown[],
): Promise<MenuItem> {
  const resolvedOfficeLocationId = await resolveMenuOfficeLocationId(officeLocationId);
  const trimmedName = validateItemName(name);
  const trimmedDesc = validateItemDescription(description);
  const trimmedItemNumber = validateItemNumber(itemNumber);
  const validatedPrice = validateItemPrice(price);
  const labelInput = parseMenuItemLabels(labels);
  const validatedAllergens = labelInput.allergens === undefined ? undefined : validateItemLabels(labelInput.allergens, 'allergens');
  const validatedAdditives = labelInput.additives === undefined ? undefined : validateItemLabels(labelInput.additives, 'additives');

  const current = await prisma.menuItem.findFirst({
    where: { id, menu: { officeLocationId: resolvedOfficeLocationId } },
  });
  if (!current) {
    throw Object.assign(new Error('Item not found'), { statusCode: 404 });
  }

  // Case-insensitive uniqueness within same menu (excluding self)
  const existing = await findMenuItemByName(current.menuId, trimmedName, id);
  if (existing) {
    throw Object.assign(new Error(`An item named "${existing.name}" already exists in this menu`), {
      statusCode: 409,
    });
  }

  const shouldSyncDerivedData = current.name !== trimmedName || current.description !== trimmedDesc;
  const item = await prisma.menuItem.update({
    where: { id },
    data: {
      itemNumber: trimmedItemNumber,
      name: trimmedName,
      description: trimmedDesc,
      price: validatedPrice,
      ...(validatedAllergens === undefined ? {} : { allergens: validatedAllergens }),
      ...(validatedAdditives === undefined ? {} : { additives: validatedAdditives }),
    },
  });

  if (shouldSyncDerivedData) {
    await syncMenuItemDerivedData(prisma, item, resolvedOfficeLocationId);
  }
  if (labelInput.tags !== undefined) {
    await replaceMenuTags(prisma, item, resolvedOfficeLocationId, labelInput.tags);
  }
  const formatted = await findFormattedMenuItem(item.id);
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

  const { menu, created, gapFillTargets } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await findMenuByName(tx.menu, resolvedOfficeLocationId, parsed.name);

    if (existing) {
      await tx.menu.update({
        where: { id: existing.id },
        data: {
          name: parsed.name,
          location: parsed.location,
          phone: parsed.phone,
          url: parsed.url,
          orderUrl: parsed.orderUrl,
          sourceDateCreated: parsed.sourceDateCreated,
        },
      });

      await tx.menuItem.deleteMany({ where: { menuId: existing.id } });

      await createImportedMenuItems(tx, existing.id, parsed.items);

      const gapFillTargets = await syncMenuItemsDerivedData(tx, existing.id, resolvedOfficeLocationId);
      await syncImportedMenuTags(tx, existing.id, resolvedOfficeLocationId, parsed.items);

      const updated = await tx.menu.findUniqueOrThrow({
        where: { id: existing.id },
        include: { items: { orderBy: itemOrderBy, include: { menuItemFeatures: menuTagInclude } } },
      });

      return { menu: formatMenu(updated), created: false, gapFillTargets };
    }

    const createdMenu = await tx.menu.create({
      data: {
        name: parsed.name,
        officeLocationId: resolvedOfficeLocationId,
        location: parsed.location,
        phone: parsed.phone,
        url: parsed.url,
        orderUrl: parsed.orderUrl,
        sourceDateCreated: parsed.sourceDateCreated,
      },
    });

    await createImportedMenuItems(tx, createdMenu.id, parsed.items);

    const gapFillTargets = await syncMenuItemsDerivedData(tx, createdMenu.id, resolvedOfficeLocationId);
    await syncImportedMenuTags(tx, createdMenu.id, resolvedOfficeLocationId, parsed.items);

    const createdWithItems = await tx.menu.findUniqueOrThrow({
      where: { id: createdMenu.id },
      include: { items: { orderBy: itemOrderBy, include: { menuItemFeatures: menuTagInclude } } },
    });

    return { menu: formatMenu(createdWithItems), created: true, gapFillTargets };
  });

  if (gapFillTargets.length > 0) {
    const aiFeatureTags = await requestAiFeatureTags(
      buildSanitizedTaggingPayload(
        gapFillTargets.map((item) => ({
          itemName: item.itemName,
          description: item.description,
        })),
      ),
    );

    if (aiFeatureTags) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const target of gapFillTargets) {
          const tags = aiFeatureTags.get(target.itemName) ?? [];
          if (tags.length === 0) {
            continue;
          }

          await tx.menuItemFeature.createMany({
            data: tags.map((tag) => ({
              menuItemId: target.menuItemId,
              itemIdentityKey: normalizeMenuItemIdentityKey(target.itemName),
              officeLocationId: resolvedOfficeLocationId,
              tag,
              provenance: 'ai',
            })),
          });
        }
      });
    }
  }

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
