import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import http from 'node:http';
import { buildApp } from '../../src/server/index.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { clearAllTimers as clearPollTimers } from '../../src/server/services/poll.js';
import { clearAllTimers as clearFoodSelectionTimers } from '../../src/server/services/foodSelection.js';
import { createOfficeLocation, ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import prisma from '../../src/server/db.js';
import type { FastifyInstance } from 'fastify';

// ─── SSE helpers ───────────────────────────────────────────

interface SSEEvent {
  event: string;
  data: unknown;
}

/**
 * Connect to the SSE endpoint and collect events.
 * Returns an events array that gets populated in real time, plus a close() to tear down.
 */
function connectSSE(
  port: number,
  headers: Record<string, string> = {},
  path = '/api/events',
): Promise<{ events: SSEEvent[]; close: () => void }> {
  return new Promise((resolve, reject) => {
    const events: SSEEvent[] = [];
    const req = http.get(`http://127.0.0.1:${port}${path}`, { headers }, (res) => {
      let buffer = '';
      res.setEncoding('utf8');

      res.on('data', (chunk: string) => {
        buffer += chunk;
        // SSE events are delimited by double newline
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split('\n');
          let eventName = '';
          let data = '';

          for (const line of lines) {
            if (line.startsWith(':')) continue; // SSE comment (e.g. :ok)
            if (line.startsWith('event: ')) eventName = line.slice(7);
            else if (line.startsWith('data: ')) data = line.slice(6);
          }

          if (eventName && data) {
            try {
              events.push({ event: eventName, data: JSON.parse(data) });
            } catch {
              events.push({ event: eventName, data });
            }
          }
        }
      });

      resolve({
        events,
        close: () => {
          req.destroy();
          res.destroy();
        },
      });
    });
    req.on('error', reject);
  });
}

/**
 * Wait until the events array has at least `count` items, or timeout.
 */
function waitForEvents(events: SSEEvent[], count: number, timeout = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (events.length >= count) {
        resolve();
      } else if (Date.now() - start > timeout) {
        reject(
          new Error(
            `Timeout waiting for ${count} SSE events, got ${events.length}: ${JSON.stringify(events.map((e) => e.event))}`,
          ),
        );
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

/**
 * Make an HTTP request and return the parsed JSON body.
 */
function httpRequest(
  method: string,
  port: number,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const requestHeaders: Record<string, string> = { ...headers };
    if (data) {
      requestHeaders['Content-Type'] = 'application/json';
      requestHeaders['Content-Length'] = String(Buffer.byteLength(data));
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: requestHeaders,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode || 0,
              body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
            });
          } catch {
            resolve({ status: res.statusCode || 0, body: {} });
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Tests ─────────────────────────────────────────────────

let app: FastifyInstance;
let port: number;
let defaultHeaders: Record<string, string>;

describe('SSE end-to-end integration', () => {
  beforeEach(async () => {
    clearPollTimers();
    clearFoodSelectionTimers();
    await cleanDatabase();
    const office = await ensureDefaultOfficeLocation();
    const user = await prisma.authAccessUser.create({
      data: {
        email: 'approved-sse@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: office.id,
      },
    });
    await prisma.authAccessUserOffice.create({
      data: {
        authAccessUserId: user.id,
        officeLocationId: office.id,
      },
    });
    defaultHeaders = {
      Cookie: `team_lunch_auth_session=${createSessionCookieValue({
        username: user.email,
        method: 'entra',
        iat: Math.floor(Date.now() / 1000),
      })}`,
    };

    // Build and listen on a random port for each test
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('Could not get server address');
    port = addr.port;
  });

  afterAll(async () => {
    clearPollTimers();
    clearFoodSelectionTimers();
    await cleanDatabase();
    await disconnectDatabase();
  });

  // Helper to close app after each test (in afterEach-like fashion within each test)
  async function teardown(sse?: { close: () => void }) {
    sse?.close();
    // Small delay to let the close propagate
    await new Promise((r) => setTimeout(r, 50));
    await app.close();
    await cleanDatabase();
  }

  it('sends initial_state on connection with empty DB', async () => {
    const sse = await connectSSE(port);
    try {
      await waitForEvents(sse.events, 1);

      expect(sse.events[0].event).toBe('initial_state');
      const payload = sse.events[0].data as Record<string, unknown>;
      expect(payload.activePoll).toBeNull();
      expect(payload.activeFoodSelection).toBeNull();
      expect(payload.latestCompletedPoll).toBeNull();
      expect(payload.latestCompletedFoodSelection).toBeNull();
      expect(payload.completedFoodSelectionsHistory).toEqual([]);
    } finally {
      await teardown(sse);
    }
  });

  it('sends initial_state with active poll on connection', async () => {
    const headers = defaultHeaders;
    // Create a menu and start a poll before connecting SSE
    const menuRes = await httpRequest('POST', port, '/api/menus', { name: 'Italian' }, headers);
    const menu = menuRes.body;
    await httpRequest(
      'POST',
      port,
      '/api/polls',
      {
        description: 'Lunch?',
        durationMinutes: 60,
      },
      headers,
    );

    const sse = await connectSSE(port);
    try {
      await waitForEvents(sse.events, 1);

      expect(sse.events[0].event).toBe('initial_state');
      const payload = sse.events[0].data as Record<string, unknown>;
      expect(payload.activePoll).not.toBeNull();
      const activePoll = payload.activePoll as Record<string, unknown>;
      expect(activePoll.description).toBe('Lunch?');
      expect(activePoll.status).toBe('active');
      expect(menu).toBeDefined(); // just to use the variable
    } finally {
      await teardown(sse);
    }
  });

  it('broadcasts menu_created when a menu is created', async () => {
    const sse = await connectSSE(port, defaultHeaders);
    try {
      await waitForEvents(sse.events, 1); // initial_state

      await httpRequest('POST', port, '/api/menus', { name: 'Thai' }, defaultHeaders);
      await waitForEvents(sse.events, 2);

      expect(sse.events[1].event).toBe('menu_created');
      const payload = sse.events[1].data as { menu: { name: string } };
      expect(payload.menu.name).toBe('Thai');
    } finally {
      await teardown(sse);
    }
  });

  it('keeps initial_state and broadcasts scoped to the connected office', async () => {
    const berlin = await createOfficeLocation('Berlin');
    const munich = await createOfficeLocation('Munich');
    const berlinUser = await prisma.authAccessUser.create({
      data: {
        email: 'berlin@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: berlin.id,
      },
    });
    const munichUser = await prisma.authAccessUser.create({
      data: {
        email: 'munich@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: munich.id,
      },
    });
    await prisma.authAccessUserOffice.createMany({
      data: [
        { authAccessUserId: berlinUser.id, officeLocationId: berlin.id },
        { authAccessUserId: munichUser.id, officeLocationId: munich.id },
      ],
    });

    const berlinCookie = `team_lunch_auth_session=${createSessionCookieValue({
      username: 'berlin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    })}`;
    const munichCookie = `team_lunch_auth_session=${createSessionCookieValue({
      username: 'munich@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    })}`;

    const berlinSse = await connectSSE(port, { Cookie: berlinCookie });
    const munichSse = await connectSSE(port, { Cookie: munichCookie });

    try {
      await waitForEvents(berlinSse.events, 1);
      await waitForEvents(munichSse.events, 1);

      await httpRequest('POST', port, '/api/menus', { name: 'Berlin Menu' }, { Cookie: berlinCookie });
      await waitForEvents(berlinSse.events, 2);

      expect(berlinSse.events[1].event).toBe('menu_created');
      expect((berlinSse.events[1].data as { menu: { name: string } }).menu.name).toBe('Berlin Menu');
      expect(munichSse.events).toHaveLength(1);
    } finally {
      berlinSse.close();
      munichSse.close();
      await teardown();
    }
  });

  it('lets a global admin subscribe to a selected office context', async () => {
    const berlin = await createOfficeLocation('Berlin');
    const munich = await createOfficeLocation('Munich');
    await prisma.authAccessUser.create({
      data: {
        email: 'admin@company.com',
        approved: true,
        blocked: false,
        isAdmin: true,
        officeLocationId: null,
      },
    });

    const adminCookie = `team_lunch_auth_session=${createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    })}`;

    await httpRequest('POST', port, `/api/menus?officeLocationId=${berlin.id}`, { name: 'Berlin Menu' }, { Cookie: adminCookie });
    await httpRequest('POST', port, `/api/menus?officeLocationId=${munich.id}`, { name: 'Munich Menu' }, { Cookie: adminCookie });

    const berlinSse = await connectSSE(
      port,
      { Cookie: adminCookie },
      `/api/events?officeLocationId=${berlin.id}`,
    );

    try {
      await waitForEvents(berlinSse.events, 1);

      const initialPayload = berlinSse.events[0].data as { latestCompletedPoll: unknown; activePoll: unknown };
      expect(initialPayload.activePoll).toBeNull();

      await httpRequest('POST', port, `/api/menus?officeLocationId=${munich.id}`, { name: 'Munich Curry' }, { Cookie: adminCookie });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(berlinSse.events).toHaveLength(1);

      await httpRequest('POST', port, `/api/menus?officeLocationId=${berlin.id}`, { name: 'Berlin Pasta' }, { Cookie: adminCookie });
      await waitForEvents(berlinSse.events, 2);
      expect(berlinSse.events[1].event).toBe('menu_created');
      expect((berlinSse.events[1].data as { menu: { name: string } }).menu.name).toBe('Berlin Pasta');
    } finally {
      await teardown(berlinSse);
    }
  });

  it('broadcasts poll lifecycle events in order', async () => {
    const sse = await connectSSE(port, defaultHeaders);
    try {
      await waitForEvents(sse.events, 1); // initial_state
      const headers = defaultHeaders;

      // Create a menu first
      const menuRes = await httpRequest('POST', port, '/api/menus', { name: 'Sushi' }, headers);
      await waitForEvents(sse.events, 2); // menu_created
      const menu = menuRes.body as { id: string };

      // Start poll
      const pollRes = await httpRequest(
        'POST',
        port,
        '/api/polls',
        {
          description: 'What for lunch?',
          durationMinutes: 60,
        },
        headers,
      );
      await waitForEvents(sse.events, 3); // poll_started
      const poll = pollRes.body as { id: string };

      expect(sse.events[2].event).toBe('poll_started');

      // Cast vote
      await httpRequest(
        'POST',
        port,
        `/api/polls/${poll.id}/votes`,
        {
          menuId: menu.id,
          nickname: 'Alice',
        },
        headers,
      );
      await waitForEvents(sse.events, 4); // vote_cast

      expect(sse.events[3].event).toBe('vote_cast');
      const votePayload = sse.events[3].data as {
        poll: {
          id: string;
          voteCounts: Record<string, number>;
          votes: Array<{ menuId: string; nickname: string }>;
        };
      };
      expect(votePayload.poll.id).toBe(poll.id);
      expect(votePayload.poll.voteCounts[menu.id]).toBe(1);
      expect(votePayload.poll.votes).toHaveLength(1);

      // Withdraw vote
      await httpRequest(
        'DELETE',
        port,
        `/api/polls/${poll.id}/votes`,
        {
          menuId: menu.id,
          nickname: 'Alice',
        },
        headers,
      );
      await waitForEvents(sse.events, 5); // vote_withdrawn

      expect(sse.events[4].event).toBe('vote_withdrawn');

      // Re-cast vote and end poll
      await httpRequest(
        'POST',
        port,
        `/api/polls/${poll.id}/votes`,
        {
          menuId: menu.id,
          nickname: 'Alice',
        },
        headers,
      );
      await waitForEvents(sse.events, 6); // vote_cast

      await prisma.poll.update({
        where: { id: poll.id },
        data: { endsAt: new Date(Date.now() - 1000) },
      });

      const endRes = await httpRequest('POST', port, `/api/polls/${poll.id}/end`, undefined, headers);
      expect(endRes.status).toBe(200);

      await waitForEvents(sse.events, 7); // poll_ended

      expect(sse.events[6].event).toBe('poll_ended');
      const endPayload = sse.events[6].data as { pollId: string; status: string };
      expect(endPayload.pollId).toBe(poll.id);
      expect(endPayload.status).toBe('finished');
    } finally {
      await teardown(sse);
    }
  });

  it('broadcasts food selection lifecycle events', async () => {
    const sse = await connectSSE(port, defaultHeaders);
    try {
      await waitForEvents(sse.events, 1); // initial_state
      const headers = defaultHeaders;

      // Setup: menu + item + finished poll
      const menuRes = await httpRequest('POST', port, '/api/menus', { name: 'Mexican' }, headers);
      await waitForEvents(sse.events, 2);
      const menu = menuRes.body as { id: string };

      const itemRes = await httpRequest(
        'POST',
        port,
        `/api/menus/${menu.id}/items`,
        {
          name: 'Tacos',
          description: 'Corn tortilla',
        },
        headers,
      );
      await waitForEvents(sse.events, 3);
      const item = itemRes.body as { id: string };

      const pollRes = await httpRequest(
        'POST',
        port,
        '/api/polls',
        {
          description: 'Lunch?',
          durationMinutes: 60,
        },
        headers,
      );
      await waitForEvents(sse.events, 4);
      const poll = pollRes.body as { id: string };

      await httpRequest(
        'POST',
        port,
        `/api/polls/${poll.id}/votes`,
        {
          menuId: menu.id,
          nickname: 'Alice',
        },
        headers,
      );
      await waitForEvents(sse.events, 5);

      await prisma.poll.update({
        where: { id: poll.id },
        data: { endsAt: new Date(Date.now() - 1000) },
      });

      await httpRequest('POST', port, `/api/polls/${poll.id}/end`, undefined, headers);
      await waitForEvents(sse.events, 6); // poll_ended

      const eventCountBefore = sse.events.length;

      // Start food selection
      const fsRes = await httpRequest(
        'POST',
        port,
        '/api/food-selections',
        {
          pollId: poll.id,
          durationMinutes: 10,
        },
        headers,
      );
      await waitForEvents(sse.events, eventCountBefore + 1);
      const fs = fsRes.body as { id: string };

      expect(sse.events[eventCountBefore].event).toBe('food_selection_started');

      // Place order
      await httpRequest('POST', port, `/api/food-selections/${fs.id}/orders`, {
        nickname: 'Bob',
        itemId: item.id,
        notes: 'Extra salsa',
      });
      await waitForEvents(sse.events, eventCountBefore + 2);

      expect(sse.events[eventCountBefore + 1].event).toBe('order_placed');
      const orderPayload = sse.events[eventCountBefore + 1].data as { order: { nickname: string; itemName: string } };
      expect(orderPayload.order.nickname).toBe('Bob');
      expect(orderPayload.order.itemName).toBe('Tacos');

      // Expire food selection
      await httpRequest('POST', port, `/api/food-selections/${fs.id}/expire`);
      await waitForEvents(sse.events, eventCountBefore + 3);

      expect(sse.events[eventCountBefore + 2].event).toBe('food_selection_overtime');

      // Complete food selection
      await httpRequest(
        'POST',
        port,
        `/api/food-selections/${fs.id}/complete`,
        undefined,
        headers,
      );
      await waitForEvents(sse.events, eventCountBefore + 4);

      expect(sse.events[eventCountBefore + 3].event).toBe('food_selection_ordering_started');

      await httpRequest('POST', port, `/api/food-selections/${fs.id}/place-order`, {
        etaMinutes: 20,
        nickname: 'admin@example.com',
      });
      await waitForEvents(sse.events, eventCountBefore + 5);

      expect(sse.events[eventCountBefore + 4].event).toBe('food_selection_delivery_started');

      await httpRequest('POST', port, `/api/food-selections/${fs.id}/eta`, {
        etaMinutes: 30,
      });
      await waitForEvents(sse.events, eventCountBefore + 6);

      expect(sse.events[eventCountBefore + 5].event).toBe('food_selection_eta_updated');

      await httpRequest('POST', port, `/api/food-selections/${fs.id}/confirm-arrival`);
      await waitForEvents(sse.events, eventCountBefore + 7);

      expect(sse.events[eventCountBefore + 6].event).toBe('food_selection_completed');
    } finally {
      await teardown(sse);
    }
  });

  it('delivers events to multiple connected clients', async () => {
    const sse1 = await connectSSE(port);
    const sse2 = await connectSSE(port);
    try {
      await waitForEvents(sse1.events, 1);
      await waitForEvents(sse2.events, 1);

      // Create a menu — both clients should receive it
      await httpRequest('POST', port, '/api/menus', { name: 'Korean' });

      await waitForEvents(sse1.events, 2);
      await waitForEvents(sse2.events, 2);

      expect(sse1.events[1].event).toBe('menu_created');
      expect(sse2.events[1].event).toBe('menu_created');

      const p1 = sse1.events[1].data as { menu: { name: string } };
      const p2 = sse2.events[1].data as { menu: { name: string } };
      expect(p1.menu.name).toBe('Korean');
      expect(p2.menu.name).toBe('Korean');
    } finally {
      sse1.close();
      sse2.close();
      await new Promise((r) => setTimeout(r, 50));
      await app.close();
    }
  });

  it('disconnected client is cleaned up and does not block broadcasts', async () => {
    const sse1 = await connectSSE(port);
    const sse2 = await connectSSE(port);
    try {
      await waitForEvents(sse1.events, 1);
      await waitForEvents(sse2.events, 1);

      // Disconnect client 1
      sse1.close();
      await new Promise((r) => setTimeout(r, 100));

      // Create a menu — should not throw, and client 2 should receive it
      await httpRequest('POST', port, '/api/menus', { name: 'Greek' });
      await waitForEvents(sse2.events, 2);

      expect(sse2.events[1].event).toBe('menu_created');
    } finally {
      sse2.close();
      await new Promise((r) => setTimeout(r, 50));
      await app.close();
    }
  });
});

