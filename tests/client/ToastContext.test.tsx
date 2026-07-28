import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from '../../src/client/context/ToastContext.js';
import { setupUser } from './helpers.js';

function ToastTrigger() {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast({ tone: 'success', message: 'Saved lunch' })}>
      Show toast
    </button>
  );
}

describe('ToastProvider', () => {
  it('announces and dismisses toast messages', async () => {
    const user = setupUser();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show toast' }));

    const liveRegion = screen.getByText('Saved lunch').closest('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(screen.queryByText('Saved lunch')).not.toBeInTheDocument();
  });
});
