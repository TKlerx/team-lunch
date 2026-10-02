import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from './testRender.js';
import { MemoryRouter } from 'react-router-dom';
import { makeFoodOrder, makeFoodSelection, makeMenu, makePoll, setupUser } from './helpers.js';
import type { AppState } from '../../src/client/context/AppContext.js';
import { initialAppState } from '../../src/client/context/AppContext.js';

const mockUseAppState = vi.fn<() => AppState>();

vi.mock('../../src/client/context/AppContext.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/context/AppContext.js')>();
  return {
    ...mod,
    useAppState: (...args: unknown[]) => mockUseAppState(...(args as [])),
  };
});

const mockStartPoll = vi.fn();
const mockQuickStartFoodSelection = vi.fn();

vi.mock('../../src/client/api.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/client/api.js')>(),
  startPoll: (...args: unknown[]) => mockStartPoll(...args),
  quickStartFoodSelection: (...args: unknown[]) => mockQuickStartFoodSelection(...args),
}));

import PollIdleView from '../../src/client/components/PollIdleView.js';
import { OrderingPolicyWarningError } from '../../src/client/api.js';
import type { OrderingPolicyWarningResponse } from '../../src/lib/types.js';

function policyWarning(overrides: Partial<OrderingPolicyWarningResponse> = {}) {
  return new OrderingPolicyWarningError({
    code: 'ORDERING_POLICY_WARNING',
    error: 'This office has already completed a lunch in the current policy period.',
    orderingPolicy: {
      officeLocationId: 'office-1', evaluatedAt: '2026-10-08T10:00:00Z',
      intervalWeeks: 2, timeZone: 'Europe/Vienna', anchorDate: '2026-10-05',
      status: 'period_used', blockStart: '2026-10-04T22:00:00Z',
      blockEnd: '2026-10-18T22:00:00Z', nextEligibleAt: '2026-10-18T22:00:00Z',
    },
    ...overrides,
  }, 409);
}

function renderView(onOpenHistorySelection?: (selectionId: string) => void) {
  return render(
    <MemoryRouter>
      <PollIdleView onOpenHistorySelection={onOpenHistorySelection} />
    </MemoryRouter>,
  );
}

describe('PollIdleView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartPoll.mockReset();
    mockQuickStartFoodSelection.mockReset();
    localStorage.setItem('team_lunch_actor_key', 'alice@example.com');
    localStorage.setItem('team_lunch_display_name', 'Alice');
    localStorage.setItem('team_lunch_auth_method', 'local');
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      defaultFoodSelectionDurationMinutes: 30,
      menus: [
        makeMenu({ id: 'menu-1', name: 'Pizza Place' }),
        makeMenu({ id: 'menu-2', name: 'Sushi Bar' }),
      ],
      latestCompletedPoll: makePoll({
        status: 'finished',
        winnerMenuName: 'Pizza Place',
        voteCounts: { 'menu-1': 3 },
      }),
      latestCompletedFoodSelection: makeFoodSelection({
        id: 'fs-latest',
        status: 'completed',
        menuName: 'Pizza Place',
      }),
      completedFoodSelectionsHistory: [
        makeFoodSelection({
          id: 'fs-1',
          status: 'completed',
          menuName: 'Burger House',
          completedAt: '2026-03-09T12:30:00Z',
          orders: [
            makeFoodOrder({ id: 'o-1', nickname: 'Alice', itemName: 'Cheeseburger', rating: null }),
            makeFoodOrder({ id: 'o-2', nickname: 'Bob', itemName: 'Fries', rating: 4 }),
          ],
        }),
        makeFoodSelection({
          id: 'fs-2',
          status: 'completed',
          menuName: 'Pizza Place',
          completedAt: '2026-03-08T12:30:00Z',
          orders: [
            makeFoodOrder({ id: 'o-3', nickname: 'Alice', itemName: 'Margherita', rating: 5 }),
            makeFoodOrder({ id: 'o-4', nickname: 'Cara', itemName: 'Cheeseburger', rating: 3 }),
          ],
        }),
      ],
    });
  });

  it('renders dashboard heading, quick actions, and stats cards', () => {
    renderView();

    expect(screen.getByRole('heading', { name: /team lunch home base/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /start new team lunch/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manage menus/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /import a menu/i })).not.toBeInTheDocument();
    expect(screen.getByText(/last winner/i)).toBeInTheDocument();
    expect(screen.getByText(/average rating/i)).toBeInTheDocument();
    expect(screen.getByText('4.0 / 5')).toBeInTheDocument();
    expect(screen.getByText(/most ordered item/i)).toBeInTheDocument();
    expect(screen.getByText(/cheeseburger \(2\)/i)).toBeInTheDocument();
  });

  it('shows unavailable policy without hiding or disabling the existing manual start', () => {
    renderView();
    expect(screen.getByText('Ordering availability unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Ready to start')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start new team lunch/i })).toBeEnabled();
  });

  it('shows server-owned readiness above the unchanged start controls', () => {
    const state = mockUseAppState();
    mockUseAppState.mockReturnValue({
      ...state,
      orderingPolicy: {
        officeLocationId: 'office-1', loading: false, error: null,
        availability: {
          ...policyWarning().orderingPolicy,
          status: 'eligible', nextEligibleAt: null,
          blockEnd: '2099-10-19T00:00:00Z',
        },
      },
    });
    renderView();
    expect(screen.getByText('Ready to start')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start new team lunch/i })).toBeEnabled();
  });

  it('shows meals waiting for rating and opens the selection when requested', async () => {
    const user = setupUser();
    const onOpenHistorySelection = vi.fn();
    renderView(onOpenHistorySelection);

    expect(screen.getByText(/meals waiting for your rating/i)).toBeInTheDocument();
    expect(screen.getByText(/1 unrated meal/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /rate now/i }));
    expect(onOpenHistorySelection).toHaveBeenCalledWith('fs-1');
  });

  it('shows team lunch history preview and both menu and meal popularity', () => {
    renderView();

    expect(screen.getByText(/team lunch history/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /burger house/i }).length).toBeGreaterThan(0);
    expect(screen.getByText(/most popular menus/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. burger house/i)).toBeInTheDocument();
    expect(screen.getByText(/most popular meals/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. cheeseburger/i)).toBeInTheDocument();
    expect(screen.getByText(/recently used menus/i)).toBeInTheDocument();
    expect(screen.getAllByText('Pizza Place').length).toBeGreaterThan(0);
  });

  it('renders description input and duration picker for poll start', () => {
    renderView();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Duration')).toBeInTheDocument();
    expect(screen.getByText('0/120')).toBeInTheDocument();
  });

  it('calls api.startPoll on valid submission', async () => {
    const user = setupUser();
    mockStartPoll.mockResolvedValue({});
    renderView();

    await user.type(screen.getByLabelText('Description'), 'Lunch today?');
    await user.click(screen.getByRole('button', { name: /start new team lunch/i }));

    expect(mockStartPoll).toHaveBeenCalledWith('Lunch today?', 5, [], undefined);
  });

  it('requires a reason for each excluded menu', async () => {
    const user = setupUser();
    renderView();

    await user.type(screen.getByLabelText('Description'), 'Lunch today?');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(screen.getByRole('button', { name: /start new team lunch/i }));

    expect(screen.getByText('Provide a justification for every excluded menu')).toBeInTheDocument();
    expect(mockStartPoll).not.toHaveBeenCalled();
  });

  it('shows error from API on failure', async () => {
    const user = setupUser();
    mockStartPoll.mockRejectedValue(new Error('Active poll exists'));
    renderView();

    await user.type(screen.getByLabelText('Description'), 'Lunch');
    await user.click(screen.getByRole('button', { name: /start new team lunch/i }));

    expect(await screen.findByText('Active poll exists')).toBeInTheDocument();
  });

  it('renders single-menu quick start when only one menu has items', async () => {
    const user = setupUser();
    mockQuickStartFoodSelection.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      defaultFoodSelectionDurationMinutes: 30,
      menus: [makeMenu({ id: 'menu-1', name: 'Pizza Place' })],
      completedFoodSelectionsHistory: [],
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
    });

    renderView();

    expect(screen.getByRole('heading', { name: /start food selection/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /start food selection/i }));
    expect(mockQuickStartFoodSelection).toHaveBeenCalledWith(30, undefined);
  });

  async function startWithWarning(flow: 'normal' | 'quick', warning = policyWarning()) {
      const user = setupUser();
      const mockStart = flow === 'normal' ? mockStartPoll : mockQuickStartFoodSelection;
      mockStart.mockRejectedValueOnce(warning);
      if (flow === 'quick') {
        mockUseAppState.mockReturnValue({
          ...mockUseAppState(), menus: [makeMenu({ id: 'menu-1', name: 'Pizza Place' })],
        });
      }
      renderView();
      const startButton = screen.getByRole('button', {
        name: flow === 'normal' ? /start new team lunch/i : /start food selection/i,
      });
      if (flow === 'normal') await user.type(screen.getByLabelText('Description'), 'Lunch today?');
      await user.click(startButton);
      await screen.findByRole('dialog', { name: 'Ordering policy warning' });
      return { user, mockStart, startButton };
  }

  describe.each(['normal', 'quick'] as const)('%s policy cancellation and validation', (flow) => {
    it.each(['Cancel', 'Escape', 'dismiss'] as const)('cancels by %s without retrying', async (action) => {
      const { user, mockStart, startButton } = await startWithWarning(flow);
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
      expect(mockStart).toHaveBeenCalledTimes(1);
      await user.type(screen.getByLabelText('Justification'), 'Special occasion');
      if (action === 'Cancel') await user.click(screen.getByRole('button', { name: 'Cancel' }));
      else if (action === 'Escape') await user.keyboard('{Escape}');
      else fireEvent.click(screen.getByRole('dialog').previousElementSibling!);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(startButton).toHaveFocus();
      if (flow === 'normal') expect(screen.getByLabelText('Description')).toHaveValue('Lunch today?');
    });

    it('rejects blank and overlong reasons before explicitly retrying with trimmed justification', async () => {
      const { user, mockStart } = await startWithWarning(flow);
      const reason = screen.getByLabelText('Justification');
      const proceed = screen.getByRole('button', { name: 'Proceed with exception' });
      for (const value of ['', '   ', 'x'.repeat(501)]) {
        fireEvent.change(reason, { target: { value } });
        expect(proceed).toBeDisabled();
        fireEvent.submit(proceed.closest('form')!);
        expect(mockStart).toHaveBeenCalledTimes(1);
      }
      mockStart.mockResolvedValueOnce({});
      fireEvent.change(reason, { target: { value: '  Special occasion  ' } });
      expect(mockStart).toHaveBeenCalledTimes(1);
      await user.click(proceed);
      expect(mockStart).toHaveBeenLastCalledWith(...(flow === 'normal'
        ? ['Lunch today?', 5, [], 'Special occasion'] : [30, 'Special occasion']));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      if (flow === 'normal') expect(screen.getByLabelText('Description')).toHaveValue('');
    });

  });

  describe.each(['normal', 'quick'] as const)('%s pending start protection', (flow) => {
    it('prevents duplicate initial requests and justified retries while pending', async () => {
      const { user, mockStart, startButton } = await startWithWarning(flow);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      let finish!: (value: unknown) => void;
      mockStart.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
      fireEvent.submit(startButton.closest('form')!);
      fireEvent.submit(startButton.closest('form')!);
      expect(mockStart).toHaveBeenCalledTimes(2);
      expect(startButton).toBeDisabled();
      await act(async () => finish({}));
      if (flow === 'normal') fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Lunch today?' } });
      mockStart.mockRejectedValueOnce(policyWarning());
      await user.click(startButton);
      await screen.findByRole('dialog');
      fireEvent.change(screen.getByLabelText('Justification'), { target: { value: 'Special occasion' } });
      mockStart.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
      const proceed = screen.getByRole('button', { name: 'Proceed with exception' });
      fireEvent.submit(proceed.closest('form')!);
      fireEvent.submit(proceed.closest('form')!);
      fireEvent.submit(startButton.closest('form')!);
      await user.keyboard('{Escape}');
      fireEvent.click(screen.getByRole('dialog').previousElementSibling!);
      expect(mockStart).toHaveBeenCalledTimes(4);
      expect(proceed).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await act(async () => finish({}));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

  });

  describe.each(['normal', 'quick'] as const)('%s refreshed warnings and errors', (flow) => {
    it('requires another explicit action for a refreshed future-anchor warning', async () => {
      const { user, mockStart } = await startWithWarning(flow);
      const initial = policyWarning();
      mockStart.mockRejectedValueOnce(policyWarning({
        error: 'The office policy has not started yet.',
        orderingPolicy: { ...initial.orderingPolicy, status: 'not_started',
          anchorDate: '2026-11-02', blockStart: null, blockEnd: null,
          nextEligibleAt: '2026-11-01T23:00:00Z' },
      }));
      await user.type(screen.getByLabelText('Justification'), 'First reason');
      await user.click(screen.getByRole('button', { name: 'Proceed with exception' }));
      expect(await screen.findByText('The office policy has not started yet.')).toBeInTheDocument();
      expect(screen.getByText(/Next eligible start:/)).toHaveTextContent('Europe/Vienna');
      expect(document.querySelector('time')).toHaveAttribute('datetime', '2026-11-01T23:00:00Z');
      expect(screen.getByLabelText('Justification')).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
      expect(mockStart).toHaveBeenCalledTimes(2);
      mockStart.mockResolvedValueOnce({});
      await user.type(screen.getByLabelText('Justification'), 'Updated reason');
      await user.click(screen.getByRole('button', { name: 'Proceed with exception' }));
      expect(mockStart).toHaveBeenCalledTimes(3);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it.each([false, true])('preserves ordinary error handling (after warning: %s)', async (retry) => {
      const { user, mockStart, startButton } = await startWithWarning(flow);
      mockStart.mockRejectedValueOnce(new Error('Active lunch exists'));
      if (retry) {
        await user.type(screen.getByLabelText('Justification'), 'Special occasion');
        await user.click(screen.getByRole('button', { name: 'Proceed with exception' }));
      } else {
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        await user.click(startButton);
      }
      expect(await screen.findByText('Active lunch exists')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockStart).toHaveBeenCalledTimes(2);
    });
  });

  it('preserves normal inputs and distinct menu-exclusion reasons across warning and retry', async () => {
    const user = setupUser();
    mockStartPoll.mockRejectedValueOnce(policyWarning()).mockResolvedValueOnce({});
    renderView();
    await user.type(screen.getByLabelText('Description'), '  Team celebration  ');
    await user.selectOptions(screen.getByLabelText('Duration'), '30');
    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.type(screen.getByPlaceholderText('Why is this option excluded?'), '  Closed today  ');
    await user.click(screen.getByRole('button', { name: /start new team lunch/i }));
    await screen.findByRole('dialog');
    expect(screen.getByLabelText('Description')).toHaveValue('  Team celebration  ');
    expect(screen.getByLabelText('Duration')).toHaveValue('30');
    expect(screen.getByPlaceholderText('Why is this option excluded?')).toHaveValue('  Closed today  ');
    await user.type(screen.getByLabelText('Justification'), '  Birthday  ');
    await user.click(screen.getByRole('button', { name: 'Proceed with exception' }));
    expect(mockStartPoll.mock.calls).toEqual([
      ['Team celebration', 30, [{ menuId: 'menu-1', reason: 'Closed today' }], undefined],
      ['Team celebration', 30, [{ menuId: 'menu-1', reason: 'Closed today' }], 'Birthday'],
    ]);
  });

  it('shows validation error for empty poll description', () => {
    renderView();
    fireEvent.submit(screen.getByRole('button', { name: /start new team lunch/i }));
    expect(screen.getByText('Description is required')).toBeInTheDocument();
  });
});
