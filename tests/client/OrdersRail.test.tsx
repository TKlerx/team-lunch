import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrdersRail from '../../src/client/components/OrdersRail.js';
import { makeFoodSelection } from './helpers.js';

describe('OrdersRail', () => {
  it('shows Start new Team Lunch as first prominent action', () => {
    const { container } = render(
      <OrdersRail
        history={[]}
        selectedSelectionId={null}
        onSelectSelection={vi.fn()}
        onStartNewTeamLunch={vi.fn()}
      />,
    );

    const actionButton = screen.getByRole('button', { name: /start new team lunch/i });
    const heading = screen.getByText('Past Lunches');

    expect(actionButton).toBeInTheDocument();
    expect(container.firstElementChild?.firstElementChild).toBe(actionButton);
    expect(actionButton.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders history entries with most recent first (input order)', () => {
    render(
      <OrdersRail
        history={[
          makeFoodSelection({ id: 'fs-2', status: 'completed', menuName: 'Most Recent', completedAt: '2026-01-02T12:00:00Z' }),
          makeFoodSelection({ id: 'fs-1', status: 'completed', menuName: 'Older', completedAt: '2026-01-01T12:00:00Z' }),
        ]}
        selectedSelectionId={null}
        onSelectSelection={vi.fn()}
        onStartNewTeamLunch={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toHaveTextContent('Most Recent');
    expect(buttons[2]).toHaveTextContent('Older');
  });

  it('calls onSelectSelection when clicking a history item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <OrdersRail
        history={[makeFoodSelection({ id: 'fs-1', status: 'completed', menuName: 'Pizza Place', completedAt: '2026-01-01T12:00:00Z' })]}
        selectedSelectionId={null}
        onSelectSelection={onSelect}
        onStartNewTeamLunch={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /pizza place/i }));
    expect(onSelect).toHaveBeenCalledWith('fs-1');
  });

  it('calls onStartNewTeamLunch when clicking top action', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <OrdersRail
        history={[]}
        selectedSelectionId={null}
        onSelectSelection={vi.fn()}
        onStartNewTeamLunch={onStart}
      />,
    );

    await user.click(screen.getByRole('button', { name: /start new team lunch/i }));
    expect(onStart).toHaveBeenCalled();
  });

  it('shows phase-specific in-progress label when lunch process is active', () => {
    render(
      <OrdersRail
        history={[]}
        selectedSelectionId={null}
        onSelectSelection={vi.fn()}
        onStartNewTeamLunch={vi.fn()}
        hasOngoingLunchProcess
        inProgressActionLabel="Awaiting lunch delivery..."
        inProgressPhaseLabel="3/3"
        inProgressCountdownTo={new Date(Date.now() + 90_000).toISOString()}
      />,
    );

    expect(screen.getByRole('button', { name: /awaiting lunch delivery\.\.\./i })).toBeEnabled();
    expect(screen.getByText(/3\/3/)).toBeInTheDocument();
    expect(screen.getByText(/01:|00:/)).toBeInTheDocument();
  });

  it('shows ringing due-state visuals for phase 3 timer in rail', () => {
    render(
      <OrdersRail
        history={[]}
        selectedSelectionId={null}
        onSelectSelection={vi.fn()}
        onStartNewTeamLunch={vi.fn()}
        hasOngoingLunchProcess
        inProgressPhaseLabel="3/3"
        inProgressCountdownTo={new Date(Date.now() - 10_000).toISOString()}
      />,
    );

    expect(screen.getByRole('img', { name: /ringing clock/i })).toBeInTheDocument();
    expect(screen.getByTestId('in-progress-status')).toHaveClass('delivery-due-alert');
  });

  it('disables Start new Team Lunch when no menus are available', () => {
    render(
      <OrdersRail
        history={[]}
        selectedSelectionId={null}
        onSelectSelection={vi.fn()}
        onStartNewTeamLunch={vi.fn()}
        disableStartNewTeamLunch
      />,
    );

    expect(screen.getByRole('button', { name: /start new team lunch/i })).toBeDisabled();
  });

  it('shows Back to ongoing Team Lunch when history is selected and process is ongoing', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(
      <OrdersRail
        history={[makeFoodSelection({ id: 'fs-1', status: 'completed', menuName: 'Pizza Place', completedAt: '2026-01-01T12:00:00Z' })]}
        selectedSelectionId="fs-1"
        onSelectSelection={vi.fn()}
        onBackToOngoing={onBack}
        hasOngoingLunchProcess
        onStartNewTeamLunch={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /back to ongoing team lunch/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
