import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import prisma from '../../src/server/db.js';

import {
  checkDatabaseConnectivityOnce,
  getDatabaseConnectivityStatus,
  startDatabaseConnectivityMonitor,
  stopDatabaseConnectivityMonitor,
  resetDatabaseConnectivityStateForTests,
} from '../../src/server/services/dbConnectivity.js';

describe('dbConnectivity service', () => {
  let querySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetDatabaseConnectivityStateForTests();
    querySpy = vi.spyOn(prisma as unknown as { $queryRawUnsafe: (...args: unknown[]) => unknown }, '$queryRawUnsafe');
  });

  afterEach(() => {
    querySpy.mockRestore();
    stopDatabaseConnectivityMonitor();
    vi.useRealTimers();
  });

  it('increments attemptCount while disconnected', async () => {
    querySpy.mockRejectedValue(new Error('db down'));

    await checkDatabaseConnectivityOnce();
    await checkDatabaseConnectivityOnce();
    const status = await checkDatabaseConnectivityOnce();

    expect(status.connected).toBe(false);
    expect(status.attemptCount).toBe(3);
  });

  it('resets attemptCount when connection is restored', async () => {
    querySpy
      .mockRejectedValueOnce(new Error('db down'))
      .mockRejectedValueOnce(new Error('db still down'))
      .mockResolvedValueOnce(1);

    await checkDatabaseConnectivityOnce();
    await checkDatabaseConnectivityOnce();
    const recovered = await checkDatabaseConnectivityOnce();

    expect(recovered.connected).toBe(true);
    expect(recovered.attemptCount).toBe(0);
    expect(getDatabaseConnectivityStatus()).toEqual({ connected: true, attemptCount: 0 });
  });

  it('retries in the background when monitor is running', async () => {
    vi.useFakeTimers();
    querySpy.mockRejectedValue(new Error('db down'));

    startDatabaseConnectivityMonitor(1000);
    await vi.runAllTicks();
    await Promise.resolve();

    expect(getDatabaseConnectivityStatus()).toEqual({ connected: false, attemptCount: 1 });

    await vi.advanceTimersByTimeAsync(3000);

    expect(getDatabaseConnectivityStatus()).toEqual({ connected: false, attemptCount: 4 });
  });
});

