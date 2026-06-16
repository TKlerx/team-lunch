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

type AiRecommendationConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
  provider: string;
};

const AI_TIMEOUT_MS = 2000;
const MAX_REASON_LENGTH = 200;
const AZURE_OPENAI_PROVIDER = 'azure-openai';

const AZURE_SYSTEM_PROMPT =
  'You suggest short, friendly reasons (max 200 characters each) why each ranked food item ' +
  'might suit someone, based only on the provided items, scores, signal categories, and ' +
  'preferences. Do not invent items that are not in the list or reference any other data. ' +
  'Respond with strict JSON in this exact shape: ' +
  '{"explanations":[{"itemName":"...","reason":"..."}]}';

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
      headers: isAzure
        ? { 'Content-Type': 'application/json', 'api-key': config.apiKey }
        : { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(
        isAzure
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
            },
      ),
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

export function resetAiRecommendationConfigForTests(): void {
  cachedConfig = undefined;
}
