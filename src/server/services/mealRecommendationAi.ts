import type { MealRecommendationSignal } from '../../lib/types.js';

export interface AiRecommendationPayloadItem {
  itemName: string;
  menuName: string;
  rank: number;
  score: number;
  sourceSignals: MealRecommendationSignal[];
}

export interface AiRecommendationPayload {
  items: AiRecommendationPayloadItem[];
  preferences: {
    allergies: string[];
    dislikes: string[];
  };
}

export interface AiFeatureTaggingPayloadItem {
  itemName: string;
  description: string | null;
}

export interface AiFeatureTaggingPayload {
  items: AiFeatureTaggingPayloadItem[];
}

type AiRecommendationConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
  provider: string;
};

const AI_TIMEOUT_MS = 2000;
const MAX_REASON_LENGTH = 200;
const MAX_TAGS_PER_ITEM = 6;
const AZURE_OPENAI_PROVIDER = 'azure-openai';

const AZURE_SYSTEM_PROMPT =
  'You suggest short, friendly reasons (max 200 characters each) why each ranked food item ' +
  'might suit someone, based only on the provided items, scores, signal categories, and ' +
  'preferences. Do not invent items that are not in the list or reference any other data. ' +
  'Respond with strict JSON in this exact shape: ' +
  '{"explanations":[{"itemName":"...","reason":"..."}]}';

const AZURE_TAGGING_SYSTEM_PROMPT =
  'You assign canonical flavor feature tags to menu items. Use only strict JSON in this exact shape: ' +
  '{"taggings":[{"itemName":"...","tags":["ingredient:...","style:...","course:side"]}]}. ' +
  'Return ingredient:* tags for ingredients, style:* tags for cuisine/preparation, and only course:side or course:drink for obvious side dishes or drinks. ' +
  'If nothing fits, return an empty tags array.';

let cachedConfig: AiRecommendationConfig | null | undefined;

function getFetch(): typeof fetch {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable');
  }
  return fetch;
}

function getAiRecommendationConfig(): AiRecommendationConfig | null {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }

  const endpoint = process.env.AI_RECOMMENDATION_ENDPOINT?.trim() ?? '';
  const apiKey = process.env.AI_RECOMMENDATION_API_KEY?.trim() ?? '';
  const model = process.env.AI_RECOMMENDATION_MODEL?.trim() ?? '';
  const provider = process.env.AI_RECOMMENDATION_PROVIDER?.trim() ?? '';

  if (!endpoint || !apiKey || !model || !provider) {
    cachedConfig = null;
    return cachedConfig;
  }

  cachedConfig = { endpoint, apiKey, model, provider };
  return cachedConfig;
}

export function isAiRecommendationConfigured(): boolean {
  return getAiRecommendationConfig() !== null;
}

export function getAiRecommendationProvider(): string | null {
  return getAiRecommendationConfig()?.provider ?? null;
}

function isAzureOpenAiConfig(config: AiRecommendationConfig): boolean {
  return config.provider.toLowerCase() === AZURE_OPENAI_PROVIDER;
}

async function parseAzureChatExplanations(response: Response): Promise<{ explanations?: unknown } | null> {
  const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return null;
  }
  try {
    return JSON.parse(content) as { explanations?: unknown };
  } catch {
    return null;
  }
}

async function parseAzureChatTaggings(response: Response): Promise<{ taggings?: unknown } | null> {
  const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return null;
  }
  try {
    return JSON.parse(content) as { taggings?: unknown };
  } catch {
    return null;
  }
}

function buildAiHeaders(config: AiRecommendationConfig, isAzure: boolean): Record<string, string> {
  return isAzure
    ? { 'Content-Type': 'application/json', 'api-key': config.apiKey }
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` };
}

function buildExplanationRequestBody(
  config: AiRecommendationConfig,
  payload: AiRecommendationPayload,
  isAzure: boolean,
): string {
  return JSON.stringify(isAzure
    ? {
        messages: [
          { role: 'system', content: AZURE_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: { type: 'json_object' },
      }
    : {
        model: config.model,
        items: payload.items,
        preferences: payload.preferences,
      });
}

function normalizeFeatureTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function isConstrainedFeatureTag(tag: string): boolean {
  return /^(ingredient|style):[a-z0-9][a-z0-9_-]*$/.test(tag) ||
    tag === 'course:side' ||
    tag === 'course:drink';
}

/**
 * Builds the privacy-minimized payload sent to the AI provider. Only
 * item/menu names, ranks, scores, signal categories, and ingredient
 * preferences are included - never names, emails, actor keys, feedback
 * remarks, or order notes.
 */
export function buildSanitizedPayload(
  items: AiRecommendationPayloadItem[],
  preferences: { allergies: string[]; dislikes: string[] },
): AiRecommendationPayload {
  return {
    items: items.map((item) => ({
      itemName: item.itemName,
      menuName: item.menuName,
      rank: item.rank,
      score: item.score,
      sourceSignals: [...item.sourceSignals],
    })),
    preferences: {
      allergies: [...preferences.allergies],
      dislikes: [...preferences.dislikes],
    },
  };
}

/**
 * Builds the privacy-minimized payload for import-time tag gap filling.
 * Only item names and descriptions are included, never IDs or user context.
 */
export function buildSanitizedTaggingPayload(items: AiFeatureTaggingPayloadItem[]): AiFeatureTaggingPayload {
  return {
    items: items.map((item) => ({
      itemName: item.itemName,
      description: item.description,
    })),
  };
}

function parseFeatureTaggings(data: { taggings?: unknown } | null): Map<string, string[]> | null {
  if (!data || !Array.isArray(data.taggings)) {
    return null;
  }

  const result = new Map<string, string[]>();
  for (const entry of data.taggings) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const typedEntry = entry as { itemName?: unknown; tags?: unknown };
    if (typeof typedEntry.itemName !== 'string' || !Array.isArray(typedEntry.tags)) {
      continue;
    }

    const itemName = typedEntry.itemName;
    const rawTags = typedEntry.tags as unknown[];
    const tags = Array.from(
      new Set(
        rawTags
          .filter((tag): tag is string => typeof tag === 'string')
          .map(normalizeFeatureTag)
          .filter(isConstrainedFeatureTag),
      ),
    ).slice(0, MAX_TAGS_PER_ITEM);

    if (tags.length === 0) {
      continue;
    }

    const existing = result.get(itemName) ?? [];
    result.set(itemName, Array.from(new Set([...existing, ...tags])).slice(0, MAX_TAGS_PER_ITEM));
  }

  return result.size > 0 ? result : null;
}

/**
 * Requests short explanations for each item from the configured AI
 * provider. Returns null on missing config, timeout, provider error, or
 * malformed output so callers can fall back to deterministic explanations.
 */
export async function requestAiExplanations(
  payload: AiRecommendationPayload,
): Promise<Map<string, string> | null> {
  const config = getAiRecommendationConfig();
  if (!config) {
    return null;
  }

  const isAzure = isAzureOpenAiConfig(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await getFetch()(config.endpoint, {
      method: 'POST',
      headers: buildAiHeaders(config, isAzure),
      body: buildExplanationRequestBody(config, payload, isAzure),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = isAzure
      ? await parseAzureChatExplanations(response)
      : ((await response.json()) as { explanations?: unknown });
    if (!data || !Array.isArray(data.explanations)) {
      return null;
    }

    const result = new Map<string, string>();
    for (const entry of data.explanations) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>).itemName === 'string' &&
        typeof (entry as Record<string, unknown>).reason === 'string'
      ) {
        const itemName = (entry as Record<string, string>).itemName;
        const reason = (entry as Record<string, string>).reason.trim();
        if (reason.length > 0) {
          result.set(itemName, reason.slice(0, MAX_REASON_LENGTH));
        }
      }
    }

    return result.size > 0 ? result : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Requests canonical flavor tags for menu items the keyword taxonomy could
 * not tag. Returns null on missing config, timeout, provider error, or
 * malformed output so import can continue without blocking.
 */
export async function requestAiFeatureTags(
  payload: AiFeatureTaggingPayload,
): Promise<Map<string, string[]> | null> {
  const config = getAiRecommendationConfig();
  if (!config || payload.items.length === 0) {
    return null;
  }

  const isAzure = isAzureOpenAiConfig(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await getFetch()(config.endpoint, {
      method: 'POST',
      headers: buildAiHeaders(config, isAzure),
      body: JSON.stringify(
        isAzure
          ? {
              messages: [
                { role: 'system', content: AZURE_TAGGING_SYSTEM_PROMPT },
                { role: 'user', content: JSON.stringify(payload) },
              ],
              response_format: { type: 'json_object' },
            }
          : {
              model: config.model,
              items: payload.items,
            },
      ),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = isAzure
      ? await parseAzureChatTaggings(response)
      : ((await response.json()) as { taggings?: unknown });
    return parseFeatureTaggings(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function resetAiRecommendationConfigForTests(): void {
  cachedConfig = undefined;
}
