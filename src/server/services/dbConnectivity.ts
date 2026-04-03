import prisma from '../db.js';

export interface DatabaseConnectivityStatus {
  connected: boolean;
  attemptCount: number;
}

let status: DatabaseConnectivityStatus = {
  connected: true,
  attemptCount: 0,
};

let monitorTimer: NodeJS.Timeout | null = null;

export async function checkDatabaseConnectivityOnce(): Promise<DatabaseConnectivityStatus> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');

    if (!status.connected || status.attemptCount !== 0) {
      status = { connected: true, attemptCount: 0 };
    }
  } catch {
    status = {
      connected: false,
      attemptCount: status.connected ? 1 : status.attemptCount + 1,
    };
  }

  return status;
}

export function getDatabaseConnectivityStatus(): DatabaseConnectivityStatus {
  return status;
}

export function startDatabaseConnectivityMonitor(intervalMs = 2000): void {
  if (monitorTimer) {
    return;
  }

  void checkDatabaseConnectivityOnce();

  monitorTimer = setInterval(() => {
    void checkDatabaseConnectivityOnce();
  }, intervalMs);

  monitorTimer.unref?.();
}

export function stopDatabaseConnectivityMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

export function resetDatabaseConnectivityStateForTests(): void {
  stopDatabaseConnectivityMonitor();
  status = { connected: true, attemptCount: 0 };
}
