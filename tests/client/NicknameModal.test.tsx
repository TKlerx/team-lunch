import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NicknameModal from '../../src/client/components/NicknameModal.js';

describe('NicknameModal', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when open is false', () => {
    render(<NicknameModal open={false} onSubmit={onSubmit} />);
    expect(screen.queryByTestId('nickname-modal')).not.toBeInTheDocument();
  });

  it('renders when open is true', () => {
    render(<NicknameModal open={true} onSubmit={onSubmit} />);
    expect(screen.getByTestId('nickname-modal')).toBeInTheDocument();
  });

  it('shows the title text', () => {
    render(<NicknameModal open={true} title="Welcome!" onSubmit={onSubmit} />);
    expect(screen.getByText('Welcome!')).toBeInTheDocument();
  });

  it('shows default title when not specified', () => {
    render(<NicknameModal open={true} onSubmit={onSubmit} />);
    expect(screen.getByText('Choose a nickname')).toBeInTheDocument();
  });

  it('shows validation error for empty input', async () => {
    render(<NicknameModal open={true} onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Nickname cannot be empty');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows validation error for whitespace-only input', async () => {
    render(<NicknameModal open={true} onSubmit={onSubmit} />);
    const input = screen.getByLabelText(/nickname/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Nickname cannot be empty');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows validation error for nickname exceeding 30 characters', async () => {
    render(<NicknameModal open={true} onSubmit={onSubmit} />);
    const input = screen.getByLabelText(/nickname/i);
    // Input has maxLength=30, so we need to bypass it by setting value directly
    fireEvent.change(input, { target: { value: 'a'.repeat(31) } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('30 characters or fewer');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with trimmed nickname on valid submit', async () => {
    const user = userEvent.setup();
    render(<NicknameModal open={true} onSubmit={onSubmit} />);
    const input = screen.getByLabelText(/nickname/i);
    await user.type(input, '  Alice  ');
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith('Alice');
  });

  it('pre-fills initialValue in the input', () => {
    render(<NicknameModal open={true} initialValue="Bob" onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/nickname/i)).toHaveValue('Bob');
  });

  it('shows cancel button only when onCancel is provided', () => {
    const { rerender } = render(<NicknameModal open={true} onSubmit={onSubmit} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    rerender(<NicknameModal open={true} onSubmit={onSubmit} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<NicknameModal open={true} onSubmit={onSubmit} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('clears error when user types after validation failure', async () => {
    const user = userEvent.setup();
    render(<NicknameModal open={true} onSubmit={onSubmit} />);

    // Trigger validation error
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Type something — error should clear
    await user.type(screen.getByLabelText(/nickname/i), 'A');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
