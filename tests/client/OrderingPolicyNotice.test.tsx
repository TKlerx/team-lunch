import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrderingPolicyNotice from '../../src/client/components/OrderingPolicyNotice.js';
import type { OrderingPolicyWarningResponse } from '../../src/lib/types.js';
import { setupUser } from './helpers.js';

function makeWarning(
  overrides: Partial<OrderingPolicyWarningResponse['orderingPolicy']> = {},
): OrderingPolicyWarningResponse {
  return {
    error: 'This office has already completed a lunch in the current policy period.',
    code: 'ORDERING_POLICY_WARNING',
    orderingPolicy: {
      officeLocationId: 'office-1',
      evaluatedAt: '2026-10-08T10:00:00.000Z',
      intervalWeeks: 2,
      timeZone: 'Europe/Vienna',
      anchorDate: '2026-10-05',
      status: 'period_used',
      blockStart: '2026-10-04T22:00:00.000Z',
      blockEnd: '2026-10-18T22:00:00.000Z',
      nextEligibleAt: '2026-10-18T22:00:00.000Z',
      ...overrides,
    },
  };
}

function renderNotice(warning = makeWarning(), pending = false) {
  const onCancel = vi.fn();
  const onProceed = vi.fn();
  const props = { warning, pending, onCancel, onProceed };
  return { ...render(<OrderingPolicyNotice {...props} />), ...props };
}

function submitForm() {
  const form = screen.getByRole('button', { name: 'Proceed with exception' }).closest('form');
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
}

function clickBackdrop() {
  const backdrop = screen.getByRole('dialog').previousElementSibling;
  expect(backdrop).toHaveAttribute('aria-hidden');
  fireEvent.click(backdrop!);
}

describe('OrderingPolicyNotice accessibility', () => {
  it('labels the modal and justification, and defaults focus to non-submit Cancel', async () => {
    const user = setupUser();
    const { onCancel, onProceed } = renderNotice();
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    expect(screen.getByRole('dialog', { name: 'Ordering policy warning' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('textbox', { name: 'Justification' })).toHaveAccessibleDescription(/1–500 characters/);
    expect(cancel).toHaveAttribute('type', 'button');
    expect(cancel).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Proceed with exception' })).toBeDisabled();

    await user.keyboard('{Enter}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('traps Tab in both directions and restores focus when unmounted', async () => {
    const user = setupUser();
    render(<button type="button">Start lunch</button>);
    const trigger = screen.getByRole('button', { name: 'Start lunch' });
    trigger.focus();
    const { unmount } = renderNotice();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const textarea = screen.getByRole('textbox', { name: 'Justification' });
    const proceed = screen.getByRole('button', { name: 'Proceed with exception' });

    await user.tab({ shift: true });
    expect(textarea).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    await user.type(textarea, 'Special occasion');
    expect(textarea).toHaveFocus();
    await user.tab();
    expect(proceed).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(proceed).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
  });

});

describe('OrderingPolicyNotice cancellation and justification', () => {
  it.each(['Cancel', 'Escape', 'backdrop'])('cancels via %s without proceeding', async (action) => {
    const user = setupUser();
    const { onCancel, onProceed } = renderNotice();
    await user.type(screen.getByRole('textbox', { name: 'Justification' }), 'An exception');

    if (action === 'Cancel') await user.click(screen.getByRole('button', { name: 'Cancel' }));
    if (action === 'Escape') await user.keyboard('{Escape}');
    if (action === 'backdrop') clickBackdrop();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onProceed).not.toHaveBeenCalled();
  });

  it.each(['', ' \n\t ', 'x'.repeat(501), `  ${'x'.repeat(501)}  `])(
    'rejects invalid justification %# in both UI and submit handler', async (input) => {
      const user = setupUser();
      const { onProceed } = renderNotice();
      fireEvent.change(screen.getByRole('textbox', { name: 'Justification' }), { target: { value: input } });
      const proceed = screen.getByRole('button', { name: 'Proceed with exception' });

      expect(proceed).toBeDisabled();
      await user.click(proceed);
      submitForm();
      expect(onProceed).not.toHaveBeenCalled();
    },
  );

  it.each(['x', 'x'.repeat(500), 'Urgent\nteam celebration'])('submits trimmed valid justification %# only explicitly', async (reason) => {
    const user = setupUser();
    const { onProceed, onCancel } = renderNotice();
    fireEvent.change(screen.getByRole('textbox', { name: 'Justification' }), {
      target: { value: ` \n${reason}\t ` },
    });
    const proceed = screen.getByRole('button', { name: 'Proceed with exception' });

    expect(proceed).toBeEnabled();
    expect(onProceed).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(proceed);
    expect(onProceed).toHaveBeenCalledExactlyOnceWith(reason);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not submit when Enter adds a newline to the justification', async () => {
    const user = setupUser();
    const { onProceed } = renderNotice();
    const textarea = screen.getByRole('textbox', { name: 'Justification' });
    await user.type(textarea, 'Team celebration{Enter}');
    expect(textarea).toHaveValue('Team celebration\n');
    expect(onProceed).not.toHaveBeenCalled();
  });

});

describe('OrderingPolicyNotice pending protection', () => {
  it('blocks duplicate submission, editing and all dismissal while pending, then allows cancellation again', async () => {
    const user = setupUser();
    const { rerender, warning, onCancel, onProceed } = renderNotice();
    const textarea = screen.getByRole('textbox', { name: 'Justification' });
    await user.type(textarea, 'Special occasion');
    await user.click(screen.getByRole('button', { name: 'Proceed with exception' }));
    expect(onProceed).toHaveBeenCalledExactlyOnceWith('Special occasion');

    rerender(<OrderingPolicyNotice warning={warning} pending onCancel={onCancel} onProceed={onProceed} />);
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveValue('Special occasion');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const proceed = screen.getByRole('button', { name: 'Proceed with exception' });
    expect(cancel).toBeDisabled();
    expect(proceed).toBeDisabled();
    expect(proceed.closest('form')).toHaveAttribute('aria-busy', 'true');
    await user.click(cancel);
    await user.click(proceed);
    await user.keyboard('{Escape}');
    clickBackdrop();
    submitForm();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onProceed).toHaveBeenCalledTimes(1);

    rerender(<OrderingPolicyNotice warning={warning} pending={false} onCancel={onCancel} onProceed={onProceed} />);
    expect(proceed).toBeEnabled();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('remains non-dismissible when initially mounted pending', async () => {
    const user = setupUser();
    const { onCancel, onProceed } = renderNotice(makeWarning(), true);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    await user.tab();
    expect(dialog).toHaveFocus();
    await user.keyboard('{Escape}');
    clickBackdrop();
    submitForm();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onProceed).not.toHaveBeenCalled();
  });

});

describe('OrderingPolicyNotice availability and privacy', () => {
  it.each([
    ['Europe/Vienna', '2026-10-18T22:00:00.000Z', '2026-10-19', 'period_used'],
    ['Pacific/Auckland', '2026-12-06T11:00:00.000Z', '2026-12-07', 'not_started'],
    ['America/Los_Angeles', '2027-01-04T08:00:00.000Z', '2027-01-04', 'not_started'],
  ] as const)('shows the exact server instant in %s for %s without recomputing policy', (timeZone, nextEligibleAt, localDate, status) => {
    const warning = makeWarning({ timeZone, nextEligibleAt, status, anchorDate: '2040-01-02', blockStart: null, blockEnd: null });
    warning.error = status === 'not_started'
      ? 'This office ordering policy has not started yet.'
      : warning.error;
    renderNotice(warning);

    expect(screen.getByText(warning.error)).toBeInTheDocument();
    const formatted = new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: 'full', timeStyle: 'long' })
      .format(new Date(nextEligibleAt));
    const time = screen.getByText(formatted);
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', nextEligibleAt);
    expect(time.parentElement).toHaveTextContent(`(${timeZone})`);
    const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(nextEligibleAt));
    expect(dateParts).toBe(localDate);
    expect(time.parentElement).not.toHaveTextContent('2040');
  });

  it('renders only the public message and availability, not private exception or actor metadata', () => {
    const privateMetadata = {
      justification: 'PRIVATE_REASON',
      actorEmail: 'private@example.test',
      actorKey: 'PRIVATE_ACTOR_KEY',
      actorDisplayName: 'PRIVATE_DISPLAY_NAME',
      decisionTime: 'PRIVATE_DECISION_TIME',
    };
    const warning = {
      ...makeWarning(),
      orderingPolicyException: privateMetadata,
      orderingPolicy: { ...makeWarning().orderingPolicy, orderingPolicyException: privateMetadata },
    };
    renderNotice(warning);
    for (const value of Object.values(privateMetadata)) {
      expect(document.body).not.toHaveTextContent(value);
      expect(document.body.innerHTML).not.toContain(value);
    }
  });

});

describe('OrderingPolicyNotice fresh warnings', () => {
  it('starts with a fresh reason when remounted for a new warning', () => {
    const { rerender, onCancel, onProceed } = renderNotice();
    fireEvent.change(screen.getByRole('textbox', { name: 'Justification' }), { target: { value: 'Old reason' } });
    const warning = makeWarning({ nextEligibleAt: '2026-11-02T00:00:00.000Z' });
    rerender(<OrderingPolicyNotice key="fresh-warning" warning={warning} pending={false} onCancel={onCancel} onProceed={onProceed} />);
    expect(screen.getByRole('textbox', { name: 'Justification' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Proceed with exception' })).toBeDisabled();
    expect(onProceed).not.toHaveBeenCalled();
  });
});
