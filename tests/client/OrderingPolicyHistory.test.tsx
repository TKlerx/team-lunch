import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import App from '../../src/client/App.js';
import FoodSelectionCompletedView from '../../src/client/components/FoodSelectionCompletedView.js';
import { initialAppState } from '../../src/client/context/AppContext.js';
import type { OrderingPolicyException } from '../../src/lib/types.js';
import { AUTH_PROFILE_UPDATED_EVENT } from '../../src/client/auth.js';
import { makeFoodSelection, makePoll, setupUser } from './helpers.js';

const mocks = vi.hoisted(() => ({ state: vi.fn(), office: vi.fn(), phase: vi.fn() }));
vi.mock('../../src/client/context/AppContext.js', async (original) => ({
  ...await original<typeof import('../../src/client/context/AppContext.js')>(),
  useAppState: () => mocks.state(),
}));
vi.mock('../../src/client/context/AdminOfficeContext.js', () => ({ useAdminOfficeContext: () => mocks.office() }));
vi.mock('../../src/client/hooks/useSSE.js', () => ({ useSSE: vi.fn() }));
vi.mock('../../src/client/hooks/useAppPhase.js', () => ({ useAppPhase: () => mocks.phase() }));
vi.mock('../../src/client/components/Header.js', () => ({ default: () => null }));
vi.mock('../../src/client/pages/MainView.js', () => ({ default: () => <p>Live poll</p> }));
vi.mock('../../src/client/components/PollFinishedView.js', () => ({ default: () => <p>Historical poll</p> }));

const snapshot: OrderingPolicyException = {
  reason: 'Visiting team lunch', actorKey: 'starter@example.com', actorEmail: 'starter@example.com',
  displayNameSnapshot: 'Original Starter', decidedAt: '2026-10-08T10:00:00.000Z',
  intervalWeeks: 2, timeZone: 'Europe/Vienna', anchorDate: '2026-10-05',
  blockStart: '2026-10-04T22:00:00.000Z', blockEnd: '2026-10-18T22:00:00.000Z',
  nextEligibleAt: '2026-10-18T22:00:00.000Z', violation: 'period_used',
  previousCompletedSelectionId: 'previous-lunch', previousCompletedAt: '2026-10-06T11:00:00.000Z',
};
const completed = makeFoodSelection({ status: 'completed', completedAt: '2026-10-08T12:00:00Z' });
const fetchMock = vi.fn<typeof fetch>();
let office = { isAdmin: true, selectedOfficeLocationId: 'office-a', pendingApprovalCount: 0 };

function response(kind: 'poll' | 'food-selection', exception: OrderingPolicyException | null | undefined = snapshot, id?: string) {
  const record = kind === 'poll' ? makePoll({ id: id ?? 'poll-1', status: 'finished' }) : { ...completed, id: id ?? completed.id };
  return new Response(JSON.stringify({ ...record, orderingPolicyException: exception }), { status: 200 });
}

function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

function NextRecord() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/polls/poll-2')}>Next poll</button>;
}

function view(kind: 'poll' | 'food-selection') {
  return <MemoryRouter initialEntries={[kind === 'poll' ? '/polls/poll-1' : '/food-selections/fs-1']}>
    {kind === 'poll' ? <><NextRecord /><App /></> : <FoodSelectionCompletedView selection={completed} isHistorical />}
  </MemoryRouter>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('team_lunch_actor_key', 'admin@example.com');
  localStorage.setItem('team_lunch_auth_method', 'local');
  localStorage.setItem('team_lunch_auth_role', 'admin');
  office = { isAdmin: true, selectedOfficeLocationId: 'office-a', pendingApprovalCount: 0 };
  mocks.office.mockImplementation(() => office);
  mocks.phase.mockReturnValue('POLL_ACTIVE');
  mocks.state.mockReturnValue({ ...initialAppState, initialized: true, activePoll: makePoll(), latestCompletedFoodSelection: completed });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe.each(['poll', 'food-selection'] as const)('%s ordering-policy history', (kind) => {
  it('hydrates public SSE records through office-scoped admin REST and displays the original snapshot', async () => {
    const pending = deferred();
    fetchMock.mockReturnValue(pending.promise);
    render(view(kind));
    expect(screen.getByRole('status')).toHaveTextContent('Loading ordering-policy details');
    expect(screen.queryByText(snapshot.reason)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/${kind === 'poll' ? 'polls/poll-1' : 'food-selections/fs-1'}?officeLocationId=office-a`, expect.objectContaining({ cache: 'no-store' }));
    await act(async () => pending.resolve(response(kind)));
    expect(await screen.findByText(snapshot.reason)).toBeInTheDocument();
    expect(screen.getByText(snapshot.displayNameSnapshot)).toBeInTheDocument();
    expect(screen.getByText(/Every 2 weeks; Europe\/Vienna; starting Monday 2026-10-05/)).toBeInTheDocument();
    for (const timestamp of [snapshot.decidedAt, snapshot.blockStart, snapshot.blockEnd, snapshot.previousCompletedAt]) {
      expect(document.querySelector(`time[datetime="${timestamp}"]`)).not.toBeNull();
    }
    expect(screen.getByText('previous-lunch')).toBeInTheDocument();
  });

  it('does not fetch or display private data for ordinary users, even if shared state has an old admin snapshot', () => {
    office.isAdmin = false;
    localStorage.setItem('team_lunch_auth_role', 'user');
    mocks.state.mockReturnValue({ ...initialAppState, initialized: true, activePoll: makePoll({ orderingPolicyException: snapshot }), latestCompletedFoodSelection: { ...completed, orderingPolicyException: snapshot } });
    render(view(kind));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Ordering-policy exception' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('leaves lunches without exceptions unchanged after an authoritative null', async () => {
    fetchMock.mockResolvedValue(response(kind, null));
    render(view(kind));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Ordering-policy exception' })).not.toBeInTheDocument();
    expect(screen.getByText(kind === 'poll' ? 'Live poll' : 'No orders were placed')).toBeInTheDocument();
  });

  it.each(['failure', 'omitted'] as const)('shows unavailable, not a fabricated exception, on %s', async (mode) => {
    if (mode === 'failure') fetchMock.mockRejectedValue(new Error('Forbidden'));
    else fetchMock.mockResolvedValue(new Response(JSON.stringify(kind === 'poll' ? makePoll() : completed)));
    render(view(kind));
    expect(await screen.findByText('Ordering-policy details unavailable.')).toBeInTheDocument();
    expect(screen.queryByText(snapshot.reason)).not.toBeInTheDocument();
  });

  it('keeps historical policy and actor values after profile/policy edits and public SSE replacement', async () => {
    fetchMock.mockResolvedValue(response(kind));
    const rendered = render(view(kind));
    await screen.findByText(snapshot.reason);
    act(() => {
      localStorage.setItem('team_lunch_display_name', 'Renamed Admin');
      window.dispatchEvent(new Event(AUTH_PROFILE_UPDATED_EVENT));
    });
    // SSE replacement still has no exception and the current office settings are not snapshot inputs.
    mocks.state.mockReturnValue({ ...initialAppState, initialized: true, activePoll: makePoll(), latestCompletedFoodSelection: completed });
    rendered.rerender(view(kind));
    expect(screen.getByText('Original Starter')).toBeInTheDocument();
    expect(screen.getByText(/Every 2 weeks; Europe\/Vienna; starting Monday 2026-10-05/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

});

describe.each(['poll', 'food-selection'] as const)('%s private response isolation', (kind) => {
  it('discards late old-office responses and clears loaded private state on office changes', async () => {
    const old = deferred();
    fetchMock.mockReturnValueOnce(old.promise).mockResolvedValue(response(kind, { ...snapshot, reason: 'Office B exception' }));
    const rendered = render(view(kind));
    office = { ...office, selectedOfficeLocationId: 'office-b' };
    rendered.rerender(view(kind));
    await screen.findByText('Office B exception');
    await act(async () => old.resolve(response(kind)));
    expect(screen.queryByText(snapshot.reason)).not.toBeInTheDocument();
    expect(screen.getByText('Office B exception')).toBeInTheDocument();
    office = { ...office, selectedOfficeLocationId: 'office-c' };
    fetchMock.mockReturnValue(new Promise(() => {}));
    rendered.rerender(view(kind));
    expect(screen.queryByText('Office B exception')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('discards in-flight data on demotion and clears private data on logout', async () => {
    const old = deferred();
    fetchMock.mockReturnValueOnce(old.promise).mockResolvedValue(response(kind));
    const rendered = render(view(kind));
    office = { ...office, isAdmin: false };
    rendered.rerender(view(kind));
    await act(async () => old.resolve(response(kind)));
    expect(screen.queryByText(snapshot.reason)).not.toBeInTheDocument();
    office = { ...office, isAdmin: true };
    rendered.rerender(view(kind));
    await screen.findByText(snapshot.reason);
    act(() => {
      localStorage.removeItem('team_lunch_auth_method');
      window.dispatchEvent(new Event(AUTH_PROFILE_UPDATED_EVENT));
    });
    expect(screen.queryByText(snapshot.reason)).not.toBeInTheDocument();
  });

  it('discards late responses when the authenticated actor changes', async () => {
    const old = deferred();
    fetchMock.mockReturnValueOnce(old.promise).mockResolvedValue(response(kind, null));
    render(view(kind));
    act(() => {
      localStorage.setItem('team_lunch_actor_key', 'another-admin@example.com');
      window.dispatchEvent(new Event(AUTH_PROFILE_UPDATED_EVENT));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => old.resolve(response(kind)));
    expect(screen.queryByText(snapshot.reason)).not.toBeInTheDocument();
  });
});

it('displays a future-anchor exception without inventing period boundaries or prior lunch evidence', async () => {
  fetchMock.mockResolvedValue(response('food-selection', {
    ...snapshot, violation: 'not_started', blockStart: null, blockEnd: null,
    previousCompletedAt: null, previousCompletedSelectionId: null,
  }));
  render(view('food-selection'));
  await screen.findByText(snapshot.reason);
  expect(screen.getByText('The policy starting Monday had not been reached.')).toBeInTheDocument();
  expect(screen.queryByText('Evaluated period (end exclusive)')).not.toBeInTheDocument();
  expect(screen.queryByText('Previous lunch completed')).not.toBeInTheDocument();
});

it('does not accept detail data for a different record', async () => {
  fetchMock.mockResolvedValue(response('food-selection', snapshot, 'other-selection'));
  render(view('food-selection'));
  await screen.findByText('Ordering-policy details unavailable.');
  expect(screen.queryByText(snapshot.reason)).not.toBeInTheDocument();
});

it('clears loaded details on role/storage changes even before the admin context refreshes', async () => {
  fetchMock.mockResolvedValue(response('food-selection'));
  render(view('food-selection'));
  await screen.findByText(snapshot.reason);
  act(() => {
    localStorage.setItem('team_lunch_auth_role', 'user');
    window.dispatchEvent(new StorageEvent('storage', { key: 'team_lunch_auth_role' }));
  });
  expect(screen.queryByText(snapshot.reason)).not.toBeInTheDocument();
});

it('ignores a response after the completed view unmounts', async () => {
  const old = deferred();
  fetchMock.mockReturnValue(old.promise);
  const rendered = render(view('food-selection'));
  rendered.unmount();
  await act(async () => old.resolve(response('food-selection')));
  expect(screen.queryByText(snapshot.reason)).not.toBeInTheDocument();
});

it('shows the snapshot for an authorized historical poll URL', async () => {
  mocks.state.mockReturnValue({ ...initialAppState, initialized: true });
  fetchMock.mockImplementation(async () => response('poll'));
  render(view('poll'));
  expect(await screen.findByText('Historical poll')).toBeInTheDocument();
  expect(await screen.findByText(snapshot.reason)).toBeInTheDocument();
});

it('isolates late poll detail responses after route record changes', async () => {
  const old = deferred();
  fetchMock.mockImplementation((url) => String(url).includes('/poll-1') ? old.promise : Promise.resolve(response('poll', null, 'poll-2')));
  render(view('poll'));
  await setupUser().click(screen.getByRole('button', { name: 'Next poll' }));
  await screen.findByText('Historical poll');
  await act(async () => old.resolve(response('poll')));
  expect(screen.queryByText(snapshot.reason)).not.toBeInTheDocument();
});

it('isolates late completed-selection responses after record changes', async () => {
  const old = deferred();
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValue(response('food-selection', null, 'fs-2'));
  const rendered = render(<FoodSelectionCompletedView selection={completed} />);
  rendered.rerender(<FoodSelectionCompletedView selection={{ ...completed, id: 'fs-2' }} />);
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  await act(async () => old.resolve(response('food-selection')));
  expect(screen.queryByText(snapshot.reason)).not.toBeInTheDocument();
  rendered.unmount();
});
