import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../../src/client/pages/Settings.js';

const mockUseAdminOfficeContext = vi.fn();
vi.mock('../../src/client/context/AdminOfficeContext.js', () => ({
  useAdminOfficeContext: () => mockUseAdminOfficeContext(),
}));

const mockGetUserPreferences = vi.fn();
const mockUpdateUserPreferences = vi.fn();
const mockSetSelectedOfficeLocationId = vi.fn();
vi.mock('../../src/client/api.js', () => ({
  getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
}));

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAdminOfficeContext.mockReturnValue({
      canSwitchOfficeLocation: false,
      officeLocations: [{ id: 'office-1', name: 'Berlin' }],
      selectedOfficeLocationId: 'office-1',
      setSelectedOfficeLocationId: mockSetSelectedOfficeLocationId,
    });
    mockGetUserPreferences.mockResolvedValue({
      userKey: 'Alice',
      allergies: ['peanuts'],
      dislikes: ['mushrooms'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockUpdateUserPreferences.mockResolvedValue({
      userKey: 'Alice',
      allergies: ['peanuts', 'shrimp'],
      dislikes: ['mushrooms', 'onions'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('loads ingredient preferences into the settings page', async () => {
    render(<Settings nickname="Alice" onRename={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /ingredient preferences/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /office/i }).compareDocumentPosition(
        screen.getByRole('heading', { name: /ingredient preferences/i }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mockGetUserPreferences).toHaveBeenCalledWith('Alice');
    expect(await screen.findByLabelText(/ingredients to avoid/i)).toHaveValue('peanuts');
    expect(screen.getByLabelText(/less preferred ingredients/i)).toHaveValue('mushrooms');
  });

  it('saves nickname and ingredient preferences from the settings-wide save button', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<Settings nickname="Alice" onRename={onRename} />);

    await user.clear(screen.getByLabelText(/nickname/i));
    await user.type(screen.getByLabelText(/nickname/i), 'Alicia');
    const allergies = await screen.findByLabelText(/ingredients to avoid/i);
    const dislikes = screen.getByLabelText(/less preferred ingredients/i);
    await user.clear(allergies);
    await user.type(allergies, 'peanuts, shrimp');
    await user.clear(dislikes);
    await user.type(dislikes, 'mushrooms; onions');
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(onRename).toHaveBeenCalledWith('Alicia');
    expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
      'Alicia',
      ['peanuts', 'shrimp'],
      ['mushrooms', 'onions'],
    );
    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/ingredients to avoid/i)).toHaveValue('peanuts, shrimp');
    });
  });

  it('stages office changes until settings are saved', async () => {
    const user = userEvent.setup();
    mockUseAdminOfficeContext.mockReturnValue({
      canSwitchOfficeLocation: true,
      officeLocations: [
        { id: 'office-1', name: 'Berlin' },
        { id: 'office-2', name: 'Hamburg' },
      ],
      selectedOfficeLocationId: 'office-1',
      setSelectedOfficeLocationId: mockSetSelectedOfficeLocationId,
    });
    render(<Settings nickname="Alice" onRename={vi.fn()} />);

    await screen.findByLabelText(/ingredients to avoid/i);
    await user.selectOptions(screen.getByLabelText(/office location/i), 'office-2');

    expect(mockSetSelectedOfficeLocationId).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(mockSetSelectedOfficeLocationId).toHaveBeenCalledWith('office-2');
  });

  it('cancels staged settings changes', async () => {
    const user = userEvent.setup();
    mockUseAdminOfficeContext.mockReturnValue({
      canSwitchOfficeLocation: true,
      officeLocations: [
        { id: 'office-1', name: 'Berlin' },
        { id: 'office-2', name: 'Hamburg' },
      ],
      selectedOfficeLocationId: 'office-1',
      setSelectedOfficeLocationId: mockSetSelectedOfficeLocationId,
    });
    const onRename = vi.fn();
    render(<Settings nickname="Alice" onRename={onRename} />);

    await user.clear(screen.getByLabelText(/nickname/i));
    await user.type(screen.getByLabelText(/nickname/i), 'Alicia');
    await user.selectOptions(screen.getByLabelText(/office location/i), 'office-2');
    await user.clear(await screen.findByLabelText(/ingredients to avoid/i));
    await user.type(screen.getByLabelText(/ingredients to avoid/i), 'shrimp');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByLabelText(/nickname/i)).toHaveValue('Alice');
    expect(screen.getByLabelText(/office location/i)).toHaveValue('office-1');
    expect(screen.getByLabelText(/ingredients to avoid/i)).toHaveValue('peanuts');
    expect(onRename).not.toHaveBeenCalled();
    expect(mockSetSelectedOfficeLocationId).not.toHaveBeenCalled();
    expect(mockUpdateUserPreferences).not.toHaveBeenCalled();
  });
});
