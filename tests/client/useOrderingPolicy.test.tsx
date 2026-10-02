import React, { type ReactNode } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useAppState } from '../../src/client/context/AppContext.js';
import { useOrderingPolicy } from '../../src/client/hooks/useOrderingPolicy.js';
import { useSSE } from '../../src/client/hooks/useSSE.js';
import type { InitialStatePayload, OrderingPolicyAvailability } from '../../src/lib/types.js';

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, (event: MessageEvent) => void>();
  close = vi.fn();
  constructor(public url: string) { MockEventSource.instances.push(this); }
  addEventListener(name: string, listener: (event: MessageEvent) => void) { this.listeners.set(name, listener); }
  emit(name: string, data: unknown) { this.listeners.get(name)?.(new MessageEvent(name, { data: JSON.stringify(data) })); }
}

const basePolicy: OrderingPolicyAvailability = {
  officeLocationId: 'office-1', evaluatedAt: '2026-10-02T10:00:00.000Z', intervalWeeks: 1,
  timeZone: 'Europe/Vienna', anchorDate: '2026-09-28', status: 'period_used',
  blockStart: '2026-09-27T22:00:00.000Z', blockEnd: '2026-10-04T22:00:00.000Z',
  nextEligibleAt: '2026-10-04T22:00:00.000Z',
};
const initial: InitialStatePayload = {
  activePoll: null, activeFoodSelection: null, latestCompletedPoll: null,
  latestCompletedFoodSelection: null, completedFoodSelectionsHistory: [], defaultFoodSelectionDurationMinutes: 30,
};
const requests: { url: string; resolve: (value: Response) => void; reject: (error: unknown) => void }[] = [];
function wrapper({ children }: { children: ReactNode }) { return <AppProvider>{children}</AppProvider>; }
function mount(office: string | null = 'office-1') {
  return renderHook(({ office }) => {
    useSSE(office);
    return { ...useOrderingPolicy(), state: useAppState() };
  }, { wrapper, initialProps: { office } });
}
async function resolve(index: number, policy: OrderingPolicyAvailability = basePolicy) {
  await act(async () => requests[index].resolve(new Response(JSON.stringify(policy), { status: 200 })));
}
function source() { return MockEventSource.instances.at(-1)!; }

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('team_lunch_actor_key', 'user@example.com');
  localStorage.setItem('team_lunch_auth_method', 'local');
  requests.length = 0;
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/polls/ordering-policy')) {
      return new Promise<Response>((resolve, reject) => requests.push({ url, resolve, reject }));
    }
    return Promise.resolve(new Response(JSON.stringify(url === '/api/health'
      ? { status: 'ok', db: { connected: true, attemptCount: 0 } } : []), { status: 200 }));
  }));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('office-scoped ordering policy state', () => {
  it('loads explicit office availability and exposes a stable awaitable refresh without extra subscriptions', async () => {
    const hook = mount();
    const refresh = hook.result.current.refresh;
    expect(hook.result.current).toMatchObject({ officeLocationId: 'office-1', availability: null, loading: true, error: null });
    expect(requests[0].url).toBe('/api/polls/ordering-policy?officeLocationId=office-1');
    await resolve(0);
    expect(hook.result.current).toMatchObject({ availability: basePolicy, loading: false, error: null });
    let pending!: ReturnType<typeof refresh>;
    act(() => { pending = refresh(); });
    expect(hook.result.current).toMatchObject({ availability: null, loading: true });
    await resolve(1, { ...basePolicy, status: 'eligible' });
    await expect(pending).resolves.toMatchObject({ status: 'eligible' });
    expect(hook.result.current.refresh).toBe(refresh);
    expect(MockEventSource.instances).toHaveLength(1);
    hook.unmount();
    await expect(refresh()).resolves.toBeNull();
    expect(requests).toHaveLength(2);
  });

  it.each([basePolicy, null])('hydrates public availability or explicit unavailable data: %s', async policy => {
    const hook = mount();
    act(() => source().emit('initial_state', { ...initial, orderingPolicy: policy }));
    expect(hook.result.current).toMatchObject({ availability: policy, loading: false,
      error: policy === null ? 'Ordering policy unavailable' : null });
    await resolve(0, { ...basePolicy, status: 'eligible' });
    expect(hook.result.current.availability).toEqual(policy);
    expect(hook.result.current.state.initialized).toBe(true);
  });

  it('keeps the REST read for legacy absent hydration and ignores wrong-office hydration', async () => {
    const hook = mount();
    act(() => source().emit('initial_state', initial));
    act(() => source().emit('initial_state', { ...initial, orderingPolicy: { ...basePolicy, officeLocationId: 'office-2' } }));
    expect(hook.result.current).toMatchObject({ availability: null, loading: true });
    await resolve(0);
    expect(hook.result.current.availability).toEqual(basePolicy);
  });

});

describe('ordering policy invalidation ordering', () => {
  it('refreshes only matching invalidations, with latest-issued request winning even on errors', async () => {
    const hook = mount();
    await resolve(0);
    act(() => source().emit('ordering_policy_changed', { officeLocationId: 'office-2' }));
    act(() => source().emit('ordering_policy_changed', null));
    expect(requests).toHaveLength(1);
    act(() => source().emit('ordering_policy_changed', { officeLocationId: 'office-1' }));
    act(() => source().emit('ordering_policy_changed', { officeLocationId: 'office-1' }));
    await resolve(2, { ...basePolicy, status: 'eligible' });
    await act(async () => requests[1].reject(new Error('old failure')));
    expect(hook.result.current).toMatchObject({ availability: { status: 'eligible' }, error: null, loading: false });
  });

  it('does not let an older success or hydration undo the newest failed refresh', async () => {
    const hook = mount();
    act(() => { void hook.result.current.refresh(); });
    await act(async () => requests[1].reject(new Error('latest failure')));
    await resolve(0);
    act(() => source().emit('initial_state', { ...initial, orderingPolicy: basePolicy }));
    expect(hook.result.current).toMatchObject({ availability: null, loading: false, error: 'latest failure' });
  });

  it('does not let stale hydration replace an invalidation or boundary refresh', async () => {
    const hook = mount();
    act(() => source().emit('ordering_policy_changed', { officeLocationId: 'office-1' }));
    act(() => source().emit('initial_state', { ...initial, orderingPolicy: basePolicy }));
    expect(hook.result.current).toMatchObject({ availability: null, loading: true });
    await resolve(1, { ...basePolicy, status: 'eligible' });
    await resolve(0);
    act(() => { void hook.result.current.refresh(); });
    act(() => source().emit('initial_state', { ...initial, orderingPolicy: null }));
    expect(hook.result.current.loading).toBe(true);
    await resolve(2, { ...basePolicy, status: 'unrestricted' });
    expect(hook.result.current.availability?.status).toBe('unrestricted');
  });

});

describe('ordering policy reconnects', () => {
  it('rechecks when the first connection recovers after failing before it ever opened', async () => {
    const hook = mount();
    await act(async () => requests[0].reject(new Error('offline')));
    act(() => source().onerror?.());
    act(() => source().onopen?.());
    expect(hook.result.current).toMatchObject({ availability: null, loading: true, error: null });
    await resolve(1);
    expect(hook.result.current.availability).toEqual(basePolicy);
  });

  it('keeps reconnect REST authoritative over a stale snapshot and an earlier invalidation read', async () => {
    const hook = mount();
    act(() => source().onopen?.());
    await resolve(0);
    act(() => source().emit('ordering_policy_changed', { officeLocationId: 'office-1' }));
    act(() => source().onopen?.());
    act(() => source().emit('initial_state', { ...initial, orderingPolicy: basePolicy }));
    expect(hook.result.current).toMatchObject({ availability: null, loading: true });
    await resolve(2, { ...basePolicy, status: 'eligible' });
    await resolve(1);
    expect(hook.result.current.availability?.status).toBe('eligible');
  });

  it('refetches on reconnect, ignoring delayed hydration after REST has settled', async () => {
    const hook = mount();
    act(() => source().onopen?.());
    expect(requests).toHaveLength(1);
    await resolve(0);
    act(() => source().onerror?.());
    act(() => source().onopen?.());
    expect(requests).toHaveLength(2);
    await resolve(1, { ...basePolicy, status: 'eligible' });
    act(() => source().emit('initial_state', { ...initial, orderingPolicy: basePolicy }));
    expect(hook.result.current.availability?.status).toBe('eligible');
  });

  it('ignores older reconnect hydration timestamps and preserves its REST read', async () => {
    const hook = mount();
    act(() => source().onopen?.());
    await resolve(0);
    act(() => source().onopen?.());
    act(() => source().emit('initial_state', { ...initial, orderingPolicy: {
      ...basePolicy, evaluatedAt: '2026-10-01T10:00:00.000Z', status: 'eligible',
    } }));
    expect(hook.result.current.loading).toBe(true);
    await resolve(1);
    expect(hook.result.current.availability).toEqual(basePolicy);
  });

});

describe('ordering policy scope changes', () => {
  it('clears office state and discards late responses/events across office switches and switch-back', async () => {
    const hook = mount();
    const oldSource = source();
    const refresh = hook.result.current.refresh;
    hook.rerender({ office: 'office-2' });
    expect(hook.result.current).toMatchObject({ officeLocationId: 'office-2', availability: null, loading: true });
    expect(oldSource.close).toHaveBeenCalledOnce();
    act(() => oldSource.emit('initial_state', { ...initial, orderingPolicy: basePolicy }));
    act(() => oldSource.emit('ordering_policy_changed', { officeLocationId: 'office-1' }));
    await resolve(1, { ...basePolicy, officeLocationId: 'office-2' });
    hook.rerender({ office: 'office-1' });
    await resolve(2, { ...basePolicy, status: 'eligible' });
    await resolve(0);
    expect(hook.result.current.availability?.status).toBe('eligible');
    expect(hook.result.current.refresh).toBe(refresh);
    expect(requests).toHaveLength(3);
  });

});

describe('ordering policy failures', () => {
  it.each(['network', 'wrong office', 'stale response', '401'])('fails unavailable on %s and can recover', async failure => {
    const hook = mount();
    if (failure === 'network') await act(async () => requests[0].reject(new Error('offline')));
    else if (failure === '401') await act(async () => requests[0].resolve(new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 })));
    else if (failure === 'wrong office') await resolve(0, { ...basePolicy, officeLocationId: 'office-2' });
    else {
      await resolve(0);
      act(() => { void hook.result.current.refresh(); });
      await resolve(1, { ...basePolicy, evaluatedAt: '2026-10-01T10:00:00.000Z' });
    }
    expect(hook.result.current).toMatchObject({ availability: null, loading: false, error: expect.any(String) });
    act(() => { void hook.result.current.refresh(); });
    expect(hook.result.current.error).toBeNull();
    await resolve(requests.length - 1);
    expect(hook.result.current.availability).toEqual(basePolicy);
  });

});

describe('ordering policy auth and cleanup', () => {
  it('discards an old actor response even before rerender and refreshes for a new actor in the same office', async () => {
    const hook = mount();
    localStorage.setItem('team_lunch_actor_key', 'other@example.com');
    await resolve(0);
    expect(hook.result.current.availability).toBeNull();
    hook.rerender({ office: 'office-1' });
    await resolve(1);
    expect(hook.result.current.availability).toEqual(basePolicy);
    localStorage.removeItem('team_lunch_actor_key');
    localStorage.removeItem('team_lunch_auth_method');
    hook.rerender({ office: 'office-1' });
    expect(hook.result.current).toMatchObject({ availability: null, loading: false, error: null });
    await expect(hook.result.current.refresh()).resolves.toBeNull();
    expect(requests).toHaveLength(2);
  });

  it('has no implicit office fetch when selection is absent', async () => {
    const hook = mount(null);
    expect(hook.result.current).toMatchObject({ officeLocationId: null, availability: null, loading: false });
    await expect(hook.result.current.refresh()).resolves.toBeNull();
    expect(requests).toHaveLength(0);
  });

  it('cleans up pending work when the SSE owner unmounts, leaving shared state unavailable', async () => {
    let observed!: ReturnType<typeof useOrderingPolicy>;
    function Connection() { useSSE('office-1'); return null; }
    function Observer() { observed = useOrderingPolicy(); return null; }
    const view = render(<AppProvider><Connection /><Observer /></AppProvider>);
    const oldSource = source();
    expect(observed.loading).toBe(true);
    view.rerender(<AppProvider><Observer /></AppProvider>);
    expect(observed).toMatchObject({ officeLocationId: null, availability: null, loading: false, error: null });
    await resolve(0);
    act(() => oldSource.emit('ordering_policy_changed', { officeLocationId: 'office-1' }));
    expect(observed.availability).toBeNull();
    await expect(observed.refresh()).resolves.toBeNull();
    expect(oldSource.close).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(1);
  });
});
