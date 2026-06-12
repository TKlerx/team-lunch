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
const mockFetchAppVersion = vi.fn();
const mockSetSelectedOfficeLocationId = vi.fn();
vi.mock('../../src/client/api.js', () => ({
  fetchAppVersion: (...args: unknown[]) => mockFetchAppVersion(...args),
  getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
}));

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.unstubAllGlobals();
    localStorage.setItem('team_lunch_actor_key', 'alice@example.com');
    localStorage.setItem('team_lunch_auth_method', 'local');
    localStorage.setItem('team_lunch_display_name', 'Alice');
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
    mockFetchAppVersion.mockResolvedValue({
      version: '20260611.1',
      gitSha: 'abc123def456',
      gitBranch: 'main',
      buildTime: '2026-06-11T08:30:00Z',
      dirty: false,
      nodeVersion: 'v24.0.0',
      environment: 'test',
    });
  });

  it('loads ingredient preferences into the settings page', async () => {
    render(<Settings />);

    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /ingredient preferences/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /office/i }).compareDocumentPosition(
        screen.getByRole('heading', { name: /ingredient preferences/i }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await waitFor(() => {
      expect(mockGetUserPreferences).toHaveBeenCalledWith('alice@example.com');
    });
    expect(await screen.findByLabelText(/ingredients to avoid/i)).toHaveValue('peanuts');
    expect(screen.getByLabelText(/less preferred ingredients/i)).toHaveValue('mushrooms');
  });

  it('shows app build metadata for support diagnostics', async () => {
    render(<Settings />);

    expect(await screen.findByTestId('app-version')).toHaveTextContent(
      '20260611.1 | abc123def456 | 2026-06-11T08:30:00Z',
    );
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('test | v24.0.0')).toBeInTheDocument();
  });

  it('saves ingredient preferences from the settings-wide save button', async () => {
    const user = userEvent.setup();
    render(<Settings />);

    const allergies = await screen.findByLabelText(/ingredients to avoid/i);
    const dislikes = screen.getByLabelText(/less preferred ingredients/i);
    await user.clear(allergies);
    await user.type(allergies, 'peanuts, shrimp');
    await user.clear(dislikes);
    await user.type(dislikes, 'mushrooms; onions');
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
      'alice@example.com',
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
    render(<Settings />);

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
    render(<Settings />);

    await user.selectOptions(screen.getByLabelText(/office location/i), 'office-2');
    await user.clear(await screen.findByLabelText(/ingredients to avoid/i));
    await user.type(screen.getByLabelText(/ingredients to avoid/i), 'shrimp');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByLabelText(/office location/i)).toHaveValue('office-1');
    expect(screen.getByLabelText(/ingredients to avoid/i)).toHaveValue('peanuts');
    expect(mockSetSelectedOfficeLocationId).not.toHaveBeenCalled();
    expect(mockUpdateUserPreferences).not.toHaveBeenCalled();
  });

  it('shows local account identity and saves display name', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ displayName: 'Alicia', displayNameSource: 'local' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('team_lunch_actor_key', 'alice@example.com');
    localStorage.setItem('team_lunch_auth_method', 'local');
    localStorage.setItem('team_lunch_display_name', 'Alice');
    const profileUpdated = vi.fn();
    window.addEventListener('team_lunch_auth_profile_updated', profileUpdated);

    render(<Settings />);

    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Local account')).toBeInTheDocument();
    const displayName = screen.getByLabelText(/display name/i);
    await user.clear(displayName);
    await user.type(displayName, 'Alicia');
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me/display-name',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ displayName: 'Alicia' }),
      }),
    );
    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument();
    expect(localStorage.getItem('team_lunch_display_name')).toBe('Alicia');
    expect(profileUpdated).toHaveBeenCalledTimes(1);
    window.removeEventListener('team_lunch_auth_profile_updated', profileUpdated);
  });

  it('renders Entra display names as read-only with email fallback copy', async () => {
    localStorage.setItem('team_lunch_actor_key', 'entra@example.com');
    localStorage.setItem('team_lunch_auth_method', 'entra');
    localStorage.removeItem('team_lunch_display_name');

    render(<Settings />);

    expect(await screen.findByText('entra@example.com')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Entra')).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeDisabled();
    expect(screen.getByText(/managed by microsoft entra/i)).toBeInTheDocument();
    expect(screen.getByText(/account email is displayed until a name is set/i)).toBeInTheDocument();
  });

  it('shows display-name validation errors before saving', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<Settings />);

    const displayName = screen.getByLabelText(/display name/i);
    await user.clear(displayName);
    await user.type(displayName, 'Bad<Name');

    expect(screen.getByText(/unsupported characters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save settings/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
