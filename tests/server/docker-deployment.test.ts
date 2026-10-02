import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync('Dockerfile', 'utf8');
const deploy = readFileSync('scripts/deploy.sh', 'utf8');
const probe = dockerfile.match(/HEALTHCHECK[^\n]*CMD node -e "([^"]+)"/)?.[1];

describe('Docker deployment assets and readiness', () => {
  it('copies public assets before building and deploys with a bounded health wait', () => {
    expect(dockerfile).toContain('COPY public ./public');
    expect(dockerfile.indexOf('COPY public ./public')).toBeLessThan(dockerfile.indexOf('RUN pnpm run build'));
    expect(dockerfile).toContain('HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6');
    expect(deploy).toContain('up -d --no-deps --wait --wait-timeout 120 app');
    expect(deploy.indexOf('--wait-timeout 120 app')).toBeLessThan(deploy.indexOf('Deploy completed successfully.'));
  });

  it.each([
    ['connected database', true, 'ok', false, 0],
    ['degraded database', true, 'degraded', false, 1],
    ['HTTP failure', false, 'ok', false, 1],
    ['request failure', true, 'ok', true, 1],
    ['unexpected payload', true, undefined, false, 1],
  ])('checks actual health command: %s', (_name, ok, status, rejects, expectedExit) => {
    expect(probe).toBeDefined();
    const mock = `globalThis.fetch = async (url, options) => {
      if (url !== 'http://127.0.0.1:3830/api/health' || !options.signal) throw new Error('Incorrect probe request');
      if (${rejects}) throw new Error('Unavailable');
      return { ok: ${ok}, json: async () => (${JSON.stringify({ status })}) };
    };`;
    const result = spawnSync(process.execPath, ['-e', mock + probe], {
      env: { ...process.env, PORT: '3830', BASE_PATH: '/team-lunch' },
      timeout: 5000,
      encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(expectedExit);
  });
});
