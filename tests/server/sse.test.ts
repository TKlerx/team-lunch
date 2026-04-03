import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import type { ServerResponse } from 'node:http';

// We need to test the SSE module in isolation. Import after mocking Prisma.
vi.mock('../../src/server/db.js', () => ({
  default: {
    poll: { findFirst: vi.fn().mockResolvedValue(null) },
    foodSelection: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

import { register, broadcast, getClientCount } from '../../src/server/sse.js';

function createMockResponse(): ServerResponse {
  const stream = new PassThrough();
  const res = stream as unknown as ServerResponse;
  res.writeHead = vi.fn().mockReturnValue(res);
  Object.defineProperty(res, 'writableEnded', { value: false, writable: true });
  // Expose a buffer for reading written data
  (res as unknown as { _chunks: string[] })._chunks = [];
  const originalWrite = stream.write.bind(stream);
  res.write = vi.fn((...args: unknown[]) => {
    (res as unknown as { _chunks: string[] })._chunks.push(args[0] as string);
    return originalWrite(args[0] as string);
  }) as unknown as typeof res.write;
  return res;
}

describe('SSE Manager', () => {
  beforeEach(() => {
    // Reset client count between tests by removing all clients
    // We can't directly clear the set, but we can create fresh mocks
  });

  it('register adds client and sets SSE headers', () => {
    const res = createMockResponse();
    register(res, 'office-1');

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    expect(getClientCount()).toBeGreaterThanOrEqual(1);
  });

  it('broadcast delivers named event + JSON payload to all registered responses', () => {
    const res1 = createMockResponse();
    const res2 = createMockResponse();
    register(res1, 'office-1');
    register(res2, 'office-1');

    const payload = { pollId: 'abc123', menuId: 'm1', voteCounts: { m1: 3, m2: 1 } };
    broadcast('vote_cast', payload);

    const expectedMessage = `event: vote_cast\ndata: ${JSON.stringify(payload)}\n\n`;
    const chunks1 = (res1 as unknown as { _chunks: string[] })._chunks;
    const chunks2 = (res2 as unknown as { _chunks: string[] })._chunks;

    expect(chunks1).toContain(expectedMessage);
    expect(chunks2).toContain(expectedMessage);
  });

  it('disconnected clients are removed from the registry', () => {
    const res = createMockResponse();
    register(res, 'office-1');

    const initialCount = getClientCount();

    // Simulate disconnect
    res.emit('close');

    expect(getClientCount()).toBe(initialCount - 1);
  });

  it('broadcast removes ended clients', () => {
    const res = createMockResponse();
    register(res, 'office-1');

    // Simulate a client whose stream has ended
    Object.defineProperty(res, 'writableEnded', { value: true, writable: true });

    const countBefore = getClientCount();
    broadcast('test_event', { data: 'test' });

    expect(getClientCount()).toBeLessThan(countBefore);
  });

  it('broadcast only delivers office-scoped events to matching clients', () => {
    const berlin = createMockResponse();
    const munich = createMockResponse();
    register(berlin, 'office-berlin');
    register(munich, 'office-munich');

    const payload = { item: 'Coffee beans' };
    broadcast('shopping_list_item_added', payload, 'office-berlin');

    const expectedMessage = `event: shopping_list_item_added\ndata: ${JSON.stringify(payload)}\n\n`;
    const berlinChunks = (berlin as unknown as { _chunks: string[] })._chunks;
    const munichChunks = (munich as unknown as { _chunks: string[] })._chunks;

    expect(berlinChunks).toContain(expectedMessage);
    expect(munichChunks).not.toContain(expectedMessage);
  });
});

