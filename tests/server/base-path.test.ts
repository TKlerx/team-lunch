import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/server/index.js';

describe('Server base path rewrite', () => {
  const originalBasePath = process.env.BASE_PATH;
  const originalViteBasePath = process.env.VITE_BASE_PATH;

  beforeEach(() => {
    process.env.BASE_PATH = '/team-lunch';
  });

  afterEach(() => {
    if (originalBasePath === undefined) {
      delete process.env.BASE_PATH;
    } else {
      process.env.BASE_PATH = originalBasePath;
    }

    if (originalViteBasePath === undefined) {
      delete process.env.VITE_BASE_PATH;
    } else {
      process.env.VITE_BASE_PATH = originalViteBasePath;
    }
  });

  it('serves API endpoints via the configured base path prefix', async () => {
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/team-lunch/api/health',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      db: {
        connected: expect.any(Boolean),
        attemptCount: expect.any(Number),
      },
    });

    await app.close();
  });

  it('fails fast when BASE_PATH and VITE_BASE_PATH do not match', async () => {
    process.env.BASE_PATH = '/team-lunch';
    process.env.VITE_BASE_PATH = '/other-prefix';

    await expect(buildApp()).rejects.toThrow(
      'BASE_PATH (/team-lunch) and VITE_BASE_PATH (/other-prefix) must match.',
    );
  });
});

