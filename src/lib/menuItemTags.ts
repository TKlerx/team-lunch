export const MENU_TAG_PROVENANCE = 'menu';
export const BEVERAGE_TAG = 'beverage';
export const MAX_MENU_LABEL_LENGTH = 60;
export const MAX_MENU_TAG_LENGTH = MAX_MENU_LABEL_LENGTH;

export type MenuItemWithTags = { tags: string[] };

export function normalizeMenuLabels(labels: readonly string[]): string[] {
  const normalized = labels
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export function validateMenuLabels(labels: unknown, path = 'labels'): { labels: string[]; error: string | null } {
  if (labels === undefined) return { labels: [], error: null };
  if (!Array.isArray(labels)) return { labels: [], error: `${path} must be an array of strings` };

  const strings: string[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];
    if (typeof label !== 'string') return { labels: [], error: `${path}[${index}] must be a string` };
    const normalized = label.trim().toLowerCase();
    if (normalized.length > MAX_MENU_LABEL_LENGTH) {
      return { labels: [], error: `${path}[${index}] must be at most ${MAX_MENU_LABEL_LENGTH} characters` };
    }
    strings.push(label);
  }

  return { labels: normalizeMenuLabels(strings), error: null };
}

export function normalizeMenuTags(tags: readonly string[]): string[] {
  return normalizeMenuLabels(tags);
}

export function validateMenuTags(tags: unknown, path = 'tags'): { tags: string[]; error: string | null } {
  const validated = validateMenuLabels(tags, path);
  return { tags: validated.labels, error: validated.error };
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
