import { execFileSync } from 'node:child_process';
import type { AppVersionResponse } from '../lib/types.js';

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function readGit(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

function readGitDirty(): boolean | null {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return status.length > 0;
  } catch {
    return null;
  }
}

function parseDirty(value: string | undefined): boolean | null {
  const normalized = clean(value)?.toLowerCase();
  if (normalized == null) {
    return null;
  }
  if (['1', 'true', 'yes', 'dirty'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'clean'].includes(normalized)) {
    return false;
  }
  return null;
}

export function getAppVersion(): AppVersionResponse {
  const gitSha =
    clean(process.env.GIT_SHA) ??
    clean(process.env.COMMIT_SHA) ??
    readGit(['rev-parse', '--short=12', 'HEAD']);
  const gitBranch = clean(process.env.GIT_BRANCH) ?? readGit(['branch', '--show-current']);

  return {
    version: clean(process.env.APP_VERSION) ?? '0.0.0',
    gitSha,
    gitBranch,
    buildTime: clean(process.env.BUILD_TIME) ?? clean(process.env.APP_BUILD_TIME),
    dirty: parseDirty(process.env.GIT_DIRTY) ?? readGitDirty(),
    nodeVersion: process.version,
    environment: clean(process.env.NODE_ENV) ?? 'development',
  };
}
