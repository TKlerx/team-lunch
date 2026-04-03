import type { FastifyReply } from 'fastify';

/**
 * Standard service error shape used by all services.
 * Extensions (e.g. `violations`) are preserved automatically.
 */
interface ServiceError extends Error {
  statusCode?: number;
  retryAfterSeconds?: number;
  violations?: unknown;
}

/**
 * Sends a standardised error response from a caught service error.
 * Preserves extra fields like `violations` for import validation errors.
 */
export function sendServiceError(reply: FastifyReply, err: unknown): FastifyReply {
  const e = err as ServiceError;
  const statusCode = e.statusCode || 500;
  const logger = (reply as unknown as { log?: { warn?: (meta: unknown, message: string) => void; error?: (meta: unknown, message: string) => void } }).log;
  if (statusCode >= 500) {
    logger?.error?.({ err: e, statusCode }, 'Request failed with server error');
  } else {
    logger?.warn?.({ error: e.message, statusCode }, 'Request failed with client error');
  }

  const body: Record<string, unknown> = { error: e.message };
  if (typeof e.retryAfterSeconds === 'number' && Number.isFinite(e.retryAfterSeconds)) {
    reply.header('Retry-After', Math.max(1, Math.ceil(e.retryAfterSeconds)).toString());
  }
  if (e.violations) {
    body.violations = e.violations;
  }
  return reply.status(statusCode).send(body);
}

/**
 * Create an Error with a `statusCode` property — the standard pattern
 * used by all service-layer validations to map to HTTP responses.
 */
export function serviceError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
