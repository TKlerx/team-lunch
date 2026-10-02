import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOrderingPolicy, importMenuJson, OrderingPolicyWarningError, quickStartFoodSelection, startPoll,
} from '../../src/client/api.js';
import type { OrderingPolicyAvailability, OrderingPolicyWarningResponse } from '../../src/lib/types.js';
import { ADMIN_OFFICE_LOCATION_STORAGE_KEY } from '../../src/client/config.js';

const availability: OrderingPolicyAvailability = {
  officeLocationId: 'office-1', evaluatedAt: '2026-10-01T10:00:00.000Z', intervalWeeks: 1,
  timeZone: 'Europe/Vienna', anchorDate: '2026-09-28', status: 'period_used',
  blockStart: '2026-09-27T22:00:00.000Z', blockEnd: '2026-10-04T22:00:00.000Z',
  nextEligibleAt: '2026-10-04T22:00:00.000Z',
};
const fetchMock = vi.fn<typeof fetch>();
function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('ordering policy API', () => {
  it.each(['eligible', 'unrestricted', 'period_used', 'not_started'] as const)('reads typed %s availability without caching', async status => {
    const policy: OrderingPolicyAvailability = { ...availability, status };
    respond(policy);
    const result: OrderingPolicyAvailability = await fetchOrderingPolicy();
    expect(result).toEqual(policy);
    expect(fetchMock).toHaveBeenCalledWith('/api/polls/ordering-policy', { headers: {}, cache: 'no-store' });
  });

  it('uses the existing selected-office context', async () => {
    localStorage.setItem('team_lunch_auth_role', 'admin');
    localStorage.setItem(ADMIN_OFFICE_LOCATION_STORAGE_KEY, 'office-2');
    respond({ ...availability, officeLocationId: 'office-2' });
    expect((await fetchOrderingPolicy()).officeLocationId).toBe('office-2');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/polls/ordering-policy?officeLocationId=office-2');
  });

  it('explicitly scopes reads independently of mutable stored office context', async () => {
    localStorage.setItem('team_lunch_auth_role', 'admin');
    localStorage.setItem(ADMIN_OFFICE_LOCATION_STORAGE_KEY, 'office-2');
    respond(availability);
    await fetchOrderingPolicy('office-1');
    expect(fetchMock).toHaveBeenCalledWith('/api/polls/ordering-policy?officeLocationId=office-1', {
      headers: {}, cache: 'no-store',
    });
  });

  it('does not grant regular users an admin-stored office override', async () => {
    localStorage.setItem('team_lunch_auth_role', 'user');
    localStorage.setItem(ADMIN_OFFICE_LOCATION_STORAGE_KEY, 'office-2');
    respond(availability);
    await fetchOrderingPolicy();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/polls/ordering-policy');
  });

  it.each([401, 403, 404, 500])('preserves ordinary %i errors instead of inventing eligibility', async status => {
    const body = { error: 'Availability unavailable' };
    respond(body, status);
    await expect(fetchOrderingPolicy()).rejects.toMatchObject({ message: body.error, status, body });
  });

  it('retains non-JSON and network error behavior', async () => {
    fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 502, statusText: 'Bad Gateway' }));
    await expect(fetchOrderingPolicy()).rejects.toMatchObject({ message: 'Bad Gateway', status: 502, body: { error: 'Bad Gateway' } });
    const error = new Error('Network unavailable');
    fetchMock.mockRejectedValueOnce(error);
    await expect(fetchOrderingPolicy()).rejects.toBe(error);
  });
});

const starts = [
  { name: 'normal', run: (reason?: string) => startPoll('Lunch', 10, [{ menuId: 'menu-1', reason: 'Closed' }], reason),
    url: '/api/polls', body: { description: 'Lunch', durationMinutes: 10, excludedMenuJustifications: [{ menuId: 'menu-1', reason: 'Closed' }] } },
  { name: 'quick', run: (reason?: string) => quickStartFoodSelection(10, reason),
    url: '/api/food-selections/quick-start', body: { durationMinutes: 10 } },
];
for (const start of starts) {
  describe(`${start.name} start payloads and errors`, () => {
    it.each([undefined, 'Team celebration'])('sends only supported fields with optional reason %s', async reason => {
      const result = { id: 'created' };
      respond(result, 201);
      expect(await start.run(reason)).toEqual(result);
      expect(fetchMock.mock.calls[0][0]).toBe(start.url);
      const options = fetchMock.mock.calls[0][1];
      expect(options).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
      expect(JSON.parse(String(options?.body))).toEqual({ ...start.body, ...(reason === undefined ? {} : { orderingPolicyJustification: reason }) });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each(['period_used', 'not_started'] as const)('preserves the typed %s warning and latest availability without retry', async status => {
      const body: OrderingPolicyWarningResponse = {
        error: 'Policy warning', code: 'ORDERING_POLICY_WARNING', orderingPolicy: { ...availability, status },
      };
      respond(body, 409);
      const error = await start.run().catch((error: unknown) => error);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(OrderingPolicyWarningError);
      if (!(error instanceof OrderingPolicyWarningError)) throw new Error('Expected a typed warning');
      const policy: OrderingPolicyAvailability = error.orderingPolicy;
      expect(policy).toEqual(body.orderingPolicy);
      expect(error).toMatchObject({ message: body.error, status: 409, body, code: body.code });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps non-policy conflicts as ordinary errors', async () => {
      const body = { error: 'An active lunch already exists' };
      respond(body, 409);
      const error = await start.run().catch((error: unknown) => error);
      expect(error).not.toBeInstanceOf(OrderingPolicyWarningError);
      expect(error).toMatchObject({ message: body.error, status: 409, body });
    });
  });
}

it('preserves import violation wrapping', async () => {
  const violations = [{ path: 'items', message: 'Invalid menu' }];
  respond({ error: 'Import rejected', violations }, 400);
  await expect(importMenuJson({})).rejects.toMatchObject({ message: 'Import rejected', violations });
});
