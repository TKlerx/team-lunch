import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSanitizedPayload,
  getAiRecommendationProvider,
  isAiRecommendationConfigured,
  requestAiExplanations,
  resetAiRecommendationConfigForTests,
} from '../../src/server/services/mealRecommendationAi.js';

const SAMPLE_PAYLOAD = buildSanitizedPayload(
  [
    {
      itemName: 'Pad Thai',
      menuName: 'Thai Food',
      rank: 1,
      score: 80,
      sourceSignals: ['personal_rating'],
    },
  ],
  { allergies: [], dislikes: [] },
);

describe('mealRecommendationAi', () => {
  const originalEnv = { ...process.env };

  function clearConfigEnv() {
    delete process.env.AI_RECOMMENDATION_ENDPOINT;
    delete process.env.AI_RECOMMENDATION_API_KEY;
    delete process.env.AI_RECOMMENDATION_MODEL;
    delete process.env.AI_RECOMMENDATION_PROVIDER;
  }

  function setConfigEnv() {
    process.env.AI_RECOMMENDATION_ENDPOINT = 'https://ai.example.com/recommend';
    process.env.AI_RECOMMENDATION_API_KEY = 'secret-key';
    process.env.AI_RECOMMENDATION_MODEL = 'gpt-test';
    process.env.AI_RECOMMENDATION_PROVIDER = 'test-provider';
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetAiRecommendationConfigForTests();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetAiRecommendationConfigForTests();
    vi.unstubAllGlobals();
  });

  // ─── Configuration ────────────────────────────────────────

  it('is disabled when any required env var is missing', () => {
    clearConfigEnv();
    process.env.AI_RECOMMENDATION_ENDPOINT = 'https://ai.example.com/recommend';
    process.env.AI_RECOMMENDATION_API_KEY = 'secret-key';
    resetAiRecommendationConfigForTests();

    expect(isAiRecommendationConfigured()).toBe(false);
    expect(getAiRecommendationProvider()).toBeNull();
  });

  it('is enabled when all required env vars are present', () => {
    setConfigEnv();
    resetAiRecommendationConfigForTests();

    expect(isAiRecommendationConfigured()).toBe(true);
    expect(getAiRecommendationProvider()).toBe('test-provider');
  });

  // ─── Sanitized payload (privacy) ─────────────────────────

  it('builds a payload that excludes names, emails, actor keys, notes, and feedback remarks', () => {
    const payload = buildSanitizedPayload(
      [
        {
          itemName: 'Pad Thai',
          menuName: 'Thai Food',
          rank: 1,
          score: 80,
          sourceSignals: ['personal_rating', 'preference_match'],
        },
      ],
      { allergies: ['peanut'], dislikes: ['cilantro'] },
    );

    expect(payload).toEqual({
      items: [
        {
          itemName: 'Pad Thai',
          menuName: 'Thai Food',
          rank: 1,
          score: 80,
          sourceSignals: ['personal_rating', 'preference_match'],
        },
      ],
      preferences: { allergies: ['peanut'], dislikes: ['cilantro'] },
    });

    const serialized = JSON.stringify(payload).toLowerCase();
    expect(serialized).not.toContain('@');
    expect(serialized).not.toContain('actorkey');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('feedback');
    expect(serialized).not.toContain('notes');
    expect(serialized).not.toContain('displayname');
  });

  // ─── requestAiExplanations ────────────────────────────────

  it('returns null when AI is not configured', async () => {
    clearConfigEnv();
    resetAiRecommendationConfigForTests();

    const result = await requestAiExplanations(SAMPLE_PAYLOAD);
    expect(result).toBeNull();
  });

  it('returns explanations from a successful provider response', async () => {
    setConfigEnv();
    resetAiRecommendationConfigForTests();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        explanations: [{ itemName: 'Pad Thai', reason: 'You loved this last time.' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestAiExplanations(SAMPLE_PAYLOAD);

    expect(result?.get('Pad Thai')).toBe('You loved this last time.');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai.example.com/recommend',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret-key' }),
      }),
    );
  });

  it('returns null when the provider responds with an error status', async () => {
    setConfigEnv();
    resetAiRecommendationConfigForTests();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const result = await requestAiExplanations(SAMPLE_PAYLOAD);
    expect(result).toBeNull();
  });

  it('returns null when the provider returns a malformed payload', async () => {
    setConfigEnv();
    resetAiRecommendationConfigForTests();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ explanations: 'not-an-array' }) }),
    );

    const result = await requestAiExplanations(SAMPLE_PAYLOAD);
    expect(result).toBeNull();
  });

  it('truncates overly long explanations to 200 characters', async () => {
    setConfigEnv();
    resetAiRecommendationConfigForTests();
    const longReason = 'x'.repeat(300);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ explanations: [{ itemName: 'Pad Thai', reason: longReason }] }),
      }),
    );

    const result = await requestAiExplanations(SAMPLE_PAYLOAD);
    expect(result?.get('Pad Thai')?.length).toBe(200);
  });

  // ─── Azure OpenAI provider ────────────────────────────────

  it('sends a chat-completions request with api-key header for the azure-openai provider', async () => {
    setConfigEnv();
    process.env.AI_RECOMMENDATION_PROVIDER = 'azure-openai';
    resetAiRecommendationConfigForTests();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                explanations: [{ itemName: 'Pad Thai', reason: 'You loved this last time.' }],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestAiExplanations(SAMPLE_PAYLOAD);

    expect(result?.get('Pad Thai')).toBe('You loved this last time.');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai.example.com/recommend',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'api-key': 'secret-key' }),
        body: expect.stringContaining('response_format'),
      }),
    );
  });

  it('returns null when the azure-openai response content is not valid JSON', async () => {
    setConfigEnv();
    process.env.AI_RECOMMENDATION_PROVIDER = 'azure-openai';
    resetAiRecommendationConfigForTests();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'not json' } }] }),
      }),
    );

    const result = await requestAiExplanations(SAMPLE_PAYLOAD);
    expect(result).toBeNull();
  });

  it('returns null when the provider request times out', async () => {
    setConfigEnv();
    resetAiRecommendationConfigForTests();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }),
    );

    const result = await requestAiExplanations(SAMPLE_PAYLOAD);
    expect(result).toBeNull();
  }, 5000);
});
