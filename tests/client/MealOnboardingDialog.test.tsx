import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MealOnboardingDialog from '../../src/client/components/MealOnboardingDialog.js';

describe('MealOnboardingDialog', () => {
  it('renders candidate cards and marks the selected dish', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onMarkCandidate = vi.fn().mockResolvedValue(undefined);

    render(
      <MealOnboardingDialog
        open
        loading={false}
        error=""
        candidates={[
          {
            itemId: 'item-1',
            itemName: 'Chicken Pad Thai',
            itemIdentityKey: 'chicken-pad-thai',
            tags: ['ingredient:chicken', 'style:thai'],
          },
        ]}
        onClose={onClose}
        onMarkCandidate={onMarkCandidate}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Chicken Pad Thai')).toBeInTheDocument();
    expect(screen.getByText('chicken')).toBeInTheDocument();
    expect(screen.getByText('thai')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Like Chicken Pad Thai' }));
    expect(onMarkCandidate).toHaveBeenCalledWith('item-1', 'like');

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows loading and empty states', () => {
    render(
      <MealOnboardingDialog
        open
        loading
        error=""
        candidates={[]}
        onClose={vi.fn()}
        onMarkCandidate={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText(/preparing flavorful picks/i)).toBeInTheDocument();
  });
});
