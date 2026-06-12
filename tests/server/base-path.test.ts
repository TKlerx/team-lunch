import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/server/index.js';

describe('Server base path rewrite', () => {
  const originalBasePath = process.env.BASE_PATH;
  const originalViteBasePath = process.env.VITE_BASE_PATH;
  const originalAppVersion = process.env.APP_VERSION;
  const originalGitSha = process.env.GIT_SHA;
  const originalGitBranch = process.env.GIT_BRANCH;
  const originalGitDirty = process.env.GIT_DIRTY;
  const originalBuildTime = process.env.BUILD_TIME;

  beforeEach(() => {
    process.env.BASE_PATH = '/team-lunch';
    process.env.APP_VERSION = '20260611.1';
    process.env.GIT_SHA = 'abc123def456';
    process.env.GIT_BRANCH = 'main';
    process.env.GIT_DIRTY = 'false';
    process.env.BUILD_TIME = '2026-06-11T08:30:00Z';
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

    if (originalAppVersion === undefined) {
      delete process.env.APP_VERSION;
    } else {
      process.env.APP_VERSION = originalAppVersion;
    }

    if (originalGitSha === undefined) {
      delete process.env.GIT_SHA;
    } else {
      process.env.GIT_SHA = originalGitSha;
    }

    if (originalGitBranch === undefined) {
      delete process.env.GIT_BRANCH;
    } else {
      process.env.GIT_BRANCH = originalGitBranch;
    }

    if (originalGitDirty === undefined) {
      delete process.env.GIT_DIRTY;
    } else {
      process.env.GIT_DIRTY = originalGitDirty;
    }

    if (originalBuildTime === undefined) {
      delete process.env.BUILD_TIME;
    } else {
      process.env.BUILD_TIME = originalBuildTime;
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

  it('serves version metadata via the configured base path prefix', async () => {
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/team-lunch/api/version',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({
      version: '20260611.1',
      gitSha: 'abc123def456',
      gitBranch: 'main',
      buildTime: '2026-06-11T08:30:00Z',
      dirty: false,
      environment: 'test',
      nodeVersion: expect.stringMatching(/^v/),
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

