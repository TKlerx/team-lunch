export const MENU_TAG_PROVENANCE = 'menu';
export const BEVERAGE_TAG = 'beverage';
export const MAX_MENU_TAG_LENGTH = 60;

export type MenuItemWithTags = { tags: string[] };

export function normalizeMenuTags(tags: readonly string[]): string[] {
  const normalized = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export function validateMenuTags(tags: unknown, path = 'tags'): { tags: string[]; error: string | null } {
  if (tags === undefined) return { tags: [], error: null };
  if (!Array.isArray(tags)) return { tags: [], error: `${path} must be an array of strings` };

  const strings: string[] = [];
  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    if (typeof tag !== 'string') return { tags: [], error: `${path}[${index}] must be a string` };
    const normalized = tag.trim().toLowerCase();
    if (normalized.length > MAX_MENU_TAG_LENGTH) {
      return { tags: [], error: `${path}[${index}] must be at most ${MAX_MENU_TAG_LENGTH} characters` };
    }
    strings.push(tag);
  }

  return { tags: normalizeMenuTags(strings), error: null };
}

export function isBeverageMenuItem(item: MenuItemWithTags): boolean {
  return item.tags.includes(BEVERAGE_TAG);
}

export function getFoodSelectionVisibleTags(item: MenuItemWithTags): string[] {
  return item.tags.filter((tag) => tag !== BEVERAGE_TAG);
}

export function matchesAnySelectedTag(item: MenuItemWithTags, selectedTags: ReadonlySet<string>): boolean {
  if (selectedTags.size === 0) return true;
  return getFoodSelectionVisibleTags(item).some((tag) => selectedTags.has(tag));
}
