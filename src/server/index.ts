import Fastify from 'fastify';
import type { RawServerDefault } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register, sendInitialState } from './sse.js';
import menuRoutes from './routes/menus.js';
import pollRoutes from './routes/polls.js';
import foodSelectionRoutes from './routes/foodSelections.js';
import authRoutes from './routes/auth.js';
import userPreferencesRoutes from './routes/userPreferences.js';
import shoppingListRoutes from './routes/shoppingList.js';
import {
  getDatabaseConnectivityStatus,
  startDatabaseConnectivityMonitor,
  stopDatabaseConnectivityMonitor,
} from './services/dbConnectivity.js';
import {
  startOfficePollScheduler,
  stopOfficePollScheduler,
} from './services/officePollSchedule.js';
import {
  readRequestedOfficeLocationId,
  resolveOfficeLocationIdFromCookie,
} from './services/officeContext.js';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      throw error;
    }
  }
}

function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') {
    return '';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, Math.max(1, withLeadingSlash.length - 1))
    : withLeadingSlash;
}

function assertBasePathAlignment(): void {
  const serverBasePath = normalizeBasePath(process.env.BASE_PATH);
  const clientBasePath = normalizeBasePath(process.env.VITE_BASE_PATH);
  const hasClientBasePath = process.env.VITE_BASE_PATH !== undefined;

  if (hasClientBasePath && serverBasePath !== clientBasePath) {
    throw new Error(
      `BASE_PATH (${serverBasePath || '/'}) and VITE_BASE_PATH (${clientBasePath || '/'}) must match.`,
    );
  }
}

export async function buildApp() {
  assertBasePathAlignment();
  const basePath = normalizeBasePath(process.env.BASE_PATH);
  const enableFastifyLogger = process.env.NODE_ENV !== 'test';
  const app = Fastify<RawServerDefault>({
    logger: enableFastifyLogger ? { level: process.env.LOG_LEVEL || 'info' } : false,
    rewriteUrl: (request) => {
      const requestUrl = request.url ?? '/';
      if (!basePath) {
        return requestUrl;
      }

      if (requestUrl === basePath) {
        return '/';
      }

      if (requestUrl.startsWith(`${basePath}/`)) {
        return requestUrl.slice(basePath.length);
      }

      return requestUrl;
    },
  });
  const isProduction = process.env.NODE_ENV === 'production';
  const shouldMonitorDatabaseConnectivity =
    process.env.NODE_ENV !== 'test' && process.env.DISABLE_DB_CONNECTIVITY_MONITOR !== 'true';
  const shouldRunOfficePollScheduler = process.env.NODE_ENV !== 'test';

  await app.register(cors, { origin: true });
  if (shouldMonitorDatabaseConnectivity) {
    startDatabaseConnectivityMonitor();
    app.addHook('onClose', async () => {
      stopDatabaseConnectivityMonitor();
    });
  }
  if (shouldRunOfficePollScheduler) {
    startOfficePollScheduler();

    app.addHook('onClose', async () => {
      stopOfficePollScheduler();
    });
  }

  // Register route modules
  await app.register(authRoutes);
  await app.register(userPreferencesRoutes);
  await app.register(shoppingListRoutes);
  await app.register(menuRoutes);
  await app.register(pollRoutes);
  await app.register(foodSelectionRoutes);

  app.setErrorHandler((err, request, reply) => {
    request.log.error(
      { err, method: request.method, url: request.url },
      'Unhandled request error',
    );

    const statusCode =
      typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;
    const message = statusCode >= 500 ? 'Internal server error' : getErrorMessage(err);

    if (!reply.sent) {
      void reply.status(statusCode).send({ error: message });
    }
  });

  // SSE endpoint
  app.get('/api/events', async (request, reply) => {
    const raw = reply.raw;
    const officeLocationId = await resolveOfficeLocationIdFromCookie(
      request.headers.cookie,
      readRequestedOfficeLocationId(request.query),
    );

    // Prevent Fastify from automatically sending a response
    reply.hijack();

    register(raw, officeLocationId);
    await sendInitialState(raw, officeLocationId);
  });

  // Health check
  app.get('/api/health', async (_request, reply) => {
    const db = getDatabaseConnectivityStatus();
    reply.header('Cache-Control', 'no-store');
    return {
      status: db.connected ? 'ok' : 'degraded',
      db,
    };
  });

  if (isProduction) {
    const serverDir = path.dirname(fileURLToPath(import.meta.url));
    const clientDistPath = path.resolve(serverDir, '../client');

    if (existsSync(clientDistPath)) {
      await app.register(fastifyStatic, {
        root: clientDistPath,
        prefix: '/',
      });

      app.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith('/api/')) {
          return reply.status(404).send({
            message: `Route ${request.method}:${request.url} not found`,
            error: 'Not Found',
            statusCode: 404,
          });
        }

        return reply.type('text/html').sendFile('index.html');
      });
    }
  }

  return app;
}

// Start server when run directly
const isMainModule = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
let processHandlersRegistered = false;

function registerProcessErrorHandlers(): void {
  if (processHandlersRegistered) {
    return;
  }
  processHandlersRegistered = true;

  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[uncaughtException]', error);
    process.exit(1);
  });
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return 'Internal server error';
}

if (isMainModule) {
  registerProcessErrorHandlers();
  const port = parseInt(process.env.PORT || '3000', 10);
  const app = await buildApp();

  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Server running on http://localhost:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
