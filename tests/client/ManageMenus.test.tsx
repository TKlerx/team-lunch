import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeMenu, makeMenuItem } from './helpers.js';
import type { AppState } from '../../src/client/context/AppContext.js';
import { initialAppState } from '../../src/client/context/AppContext.js';

// ─── Mocks ─────────────────────────────────────────────────

const mockUseAppState = vi.fn<() => AppState>();

vi.mock('../../src/client/context/AppContext.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/context/AppContext.js')>();
  return {
    ...mod,
    useAppState: (...args: unknown[]) => mockUseAppState(...(args as [])),
  };
});

vi.mock('../../src/client/hooks/useNickname.js', () => ({
  useNickname: () => ({
    nickname: 'alice@example.com',
    updateNickname: vi.fn(),
    clearNickname: vi.fn(),
  }),
}));

const mockCreateMenu = vi.fn();
const mockUpdateMenu = vi.fn();
const mockDeleteMenu = vi.fn();
const mockCreateMenuItem = vi.fn();
const mockUpdateMenuItem = vi.fn();
const mockDeleteMenuItem = vi.fn();
const mockImportMenuJson = vi.fn();
const mockPreviewImportMenuJson = vi.fn();
const mockGetUserMenuDefaultPreferences = vi.fn();
const mockUpdateUserMenuDefaultPreference = vi.fn();

vi.mock('../../src/client/api.js', () => ({
  createMenu: (...args: unknown[]) => mockCreateMenu(...args),
  updateMenu: (...args: unknown[]) => mockUpdateMenu(...args),
  deleteMenu: (...args: unknown[]) => mockDeleteMenu(...args),
  createMenuItem: (...args: unknown[]) => mockCreateMenuItem(...args),
  updateMenuItem: (...args: unknown[]) => mockUpdateMenuItem(...args),
  deleteMenuItem: (...args: unknown[]) => mockDeleteMenuItem(...args),
  previewImportMenuJson: (...args: unknown[]) => mockPreviewImportMenuJson(...args),
  importMenuJson: (...args: unknown[]) => mockImportMenuJson(...args),
  getUserMenuDefaultPreferences: (...args: unknown[]) => mockGetUserMenuDefaultPreferences(...args),
  updateUserMenuDefaultPreference: (...args: unknown[]) =>
    mockUpdateUserMenuDefaultPreference(...args),
}));

import ManageMenus from '../../src/client/pages/ManageMenus.js';

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ManageMenus />
    </MemoryRouter>,
  );
}

describe('ManageMenus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserMenuDefaultPreferences.mockResolvedValue([]);
    mockUpdateUserMenuDefaultPreference.mockResolvedValue({
      userKey: 'alice@example.com',
      menuId: 'menu-1',
      itemId: 'item-1',
      defaultComment: 'No onions',
      allowOrganizerFallback: true,
      updatedAt: '2026-03-09T12:00:00.000Z',
    });
  });

  it('shows empty state when no menus', () => {
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    renderPage();
    expect(screen.getByText('No menus yet. Create one to get started.')).toBeInTheDocument();
  });

  it('shows "Manage Menus" heading and New Menu button', () => {
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    renderPage();
    expect(screen.getByText('Manage Menus')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new menu/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import json/i })).toBeInTheDocument();
  });

  it('loads saved default-meal preferences for the current user', async () => {
    mockGetUserMenuDefaultPreferences.mockResolvedValue([
      {
        userKey: 'alice@example.com',
        menuId: 'menu-1',
        itemId: 'item-1',
        defaultComment: 'No onions',
        allowOrganizerFallback: true,
        updatedAt: '2026-03-09T12:00:00.000Z',
      },
    ]);
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({ items: [makeMenuItem({ id: 'item-1', itemNumber: '12', name: 'Margherita' })] })],
    });

    renderPage();
    fireEvent.click(screen.getByLabelText('Expand Pizza Place'));

    const defaultMealSelect = await screen.findByLabelText(/default meal for pizza place/i);
    await waitFor(() => expect(defaultMealSelect).toHaveValue('item-1'));
    expect(screen.getByLabelText(/default comment for pizza place/i)).toHaveValue('No onions');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('shows import helper schema and prompt for admins importing menus', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    renderPage();

    await user.click(screen.getByText(/import helper/i));
    expect(screen.getByRole('button', { name: /copy json schema/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy llm prompt/i })).toBeInTheDocument();
    expect(screen.getAllByText(/\$schema/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/date-created/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/item-number/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/output only one json object/i)).toBeInTheDocument();
  });

  it('copies schema and prompt from import helper', async () => {
    const user = userEvent.setup();
    const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    renderPage();
    await user.click(screen.getByText(/import helper/i));

    await user.click(screen.getByRole('button', { name: /copy json schema/i }));
    expect(clipboardWriteText).toHaveBeenCalledWith(expect.stringContaining('"$schema"'));
    expect(await screen.findByText('JSON schema copied.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /copy llm prompt/i }));
    expect(clipboardWriteText).toHaveBeenCalledWith(expect.stringContaining('Return JSON only.'));
    expect(await screen.findByText('LLM prompt copied.')).toBeInTheDocument();
  });

  it('uploads JSON file, shows preview, and imports on confirmation', async () => {
    mockPreviewImportMenuJson.mockResolvedValue({
      menuName: 'Pizza Pronto',
      menuExists: true,
      itemSummary: { created: 3, updated: 2, deleted: 1 },
    });
    mockImportMenuJson.mockResolvedValue({
      created: true,
      menu: makeMenu({ name: 'Pizza Pronto' }),
    });
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    const { container } = renderPage();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([
      JSON.stringify({
        menu: [
          {
            name: 'Pizza Pronto',
            location: 'Street 1',
            phone: '+49 1',
            'date-created': '2026-02-06T12:00:00Z',
          },
          { category: 'Pizza', items: [{ name: 'Margherita', ingredients: 'Cheese', price: 7.5 }] },
        ],
      }),
    ], 'menu.json', { type: 'application/json' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/confirm import for/i)).toBeInTheDocument();
    expect(screen.getByText('Created items: 3')).toBeInTheDocument();
    expect(screen.getByText('Updated items: 2')).toBeInTheDocument();
    expect(screen.getByText('Deleted items: 1')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: /confirm import/i }));

    await vi.waitFor(() => {
      expect(mockImportMenuJson).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/imported menu/i)).toBeInTheDocument();
  });

  it('previews and imports from pasted JSON text', async () => {
    const user = userEvent.setup();
    mockPreviewImportMenuJson.mockResolvedValue({
      menuName: 'Thai Bowl',
      menuExists: false,
      itemSummary: { created: 2, updated: 0, deleted: 0 },
    });
    mockImportMenuJson.mockResolvedValue({
      created: true,
      menu: makeMenu({ name: 'Thai Bowl' }),
    });
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    renderPage();

    fireEvent.change(screen.getByLabelText(/paste json/i), {
      target: {
        value: JSON.stringify({
          menu: [
            {
              name: 'Thai Bowl',
              location: 'Main Street',
              phone: '+49 123',
              'date-created': '2026-03-03T10:00:00Z',
            },
            { category: 'Main', items: [{ name: 'Pad Thai', ingredients: 'Rice noodles', price: 11.5 }] },
          ],
        }),
      },
    });
    await user.click(screen.getByRole('button', { name: /preview pasted json/i }));

    expect(await screen.findByText(/confirm import for "thai bowl"/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm import/i }));

    expect(mockImportMenuJson).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/imported menu/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/paste json/i)).toHaveValue('');
  });

  it('shows validation error when pasted JSON is invalid', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    renderPage();

    fireEvent.change(screen.getByLabelText(/paste json/i), { target: { value: '{ invalid' } });
    await user.click(screen.getByRole('button', { name: /preview pasted json/i }));

    expect(await screen.findByText('Pasted content is not valid JSON')).toBeInTheDocument();
  });

  it('cancels import from preview without calling import API', async () => {
    mockPreviewImportMenuJson.mockResolvedValue({
      menuName: 'Pizza Pronto',
      menuExists: false,
      itemSummary: { created: 1, updated: 0, deleted: 0 },
    });
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    const { container } = renderPage();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify({ menu: [{}, {}] })], 'menu.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/confirm import for/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockImportMenuJson).not.toHaveBeenCalled();
    expect(screen.getByText('Import cancelled')).toBeInTheDocument();
  });

  it('renders schema violations from import API error', async () => {
    const error = new Error('Import payload validation failed') as Error & {
      violations?: Array<{ path: string; message: string }>;
    };
    error.violations = [
      { path: 'menu[0].name', message: 'name must be 1–60 characters' },
      { path: 'menu[1].items[0].price', message: 'price must be between 0 and 9999.99' },
    ];
    mockPreviewImportMenuJson.mockRejectedValue(error);

    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    const { container } = renderPage();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify({ menu: [] })], 'bad.json', { type: 'application/json' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('Import payload validation failed')).toBeInTheDocument();
    expect(screen.getByText(/menu\[0\]\.name/)).toBeInTheDocument();
    expect(screen.getByText(/menu\[1\]\.items\[0\]\.price/)).toBeInTheDocument();
  });

  it('opens create menu form when clicking New Menu', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    renderPage();

    await user.click(screen.getByRole('button', { name: /new menu/i }));
    expect(screen.getByPlaceholderText(/e.g. italian/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('validates empty menu name on create', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    renderPage();

    await user.click(screen.getByRole('button', { name: /new menu/i }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Menu name cannot be empty')).toBeInTheDocument();
  });

  it('calls createMenu API on valid submission', async () => {
    const user = userEvent.setup();
    mockCreateMenu.mockResolvedValue(makeMenu({ name: 'Italian' }));
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    renderPage();

    await user.click(screen.getByRole('button', { name: /new menu/i }));
    await user.type(screen.getByPlaceholderText(/e.g. italian/i), 'Italian');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(mockCreateMenu).toHaveBeenCalledWith('Italian');
  });

  it('shows API error on create failure', async () => {
    const user = userEvent.setup();
    mockCreateMenu.mockRejectedValue(new Error('Duplicate name'));
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus: [] });
    renderPage();

    await user.click(screen.getByRole('button', { name: /new menu/i }));
    await user.type(screen.getByPlaceholderText(/e.g. italian/i), 'Italian');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Duplicate name')).toBeInTheDocument();
  });

  it('lists menus alphabetically with item counts', () => {
    const menus = [
      makeMenu({ id: 'menu-2', name: 'Sushi Bar', items: [makeMenuItem({ id: 'i1' }), makeMenuItem({ id: 'i2' })], itemCount: 2 }),
      makeMenu({ id: 'menu-1', name: 'Italian', items: [makeMenuItem()], itemCount: 1 }),
    ];
    mockUseAppState.mockReturnValue({ ...initialAppState, initialized: true, menus });
    renderPage();

    const headings = screen.getAllByRole('heading', { level: 3 });
    // Should be sorted alphabetically: Italian, Sushi Bar
    expect(headings[0]).toHaveTextContent('Italian');
    expect(headings[1]).toHaveTextContent('Sushi Bar');

    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('shows Edit and Delete buttons for each menu', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu()],
    });
    renderPage();
    // Menu starts collapsed: no action buttons visible until expanded
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Expand Pizza Place'));
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Delete' }).length).toBeGreaterThanOrEqual(1);
  });

  it('shows only name and item count while collapsed', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({ items: [makeMenuItem({ name: 'Margherita' })] })],
    });
    renderPage();

    expect(screen.getByText('Pizza Place')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.queryByText('Margherita')).not.toBeInTheDocument();
  });

  it('renders location, phone, and URL links in menu title row', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        makeMenu({
          location: 'Main Street 1',
          phone: '+49 123 456',
          url: 'https://pizza.example',
        }),
      ],
    });
    renderPage();

    const orderedLinks = screen.getAllByRole('link');

    expect(orderedLinks[0]).toHaveTextContent('https://pizza.example');
    expect(orderedLinks[1]).toHaveTextContent('+49 123 456');
    expect(orderedLinks[2]).toHaveTextContent('Main Street 1');

    const locationLink = screen.getByRole('link', { name: 'Main Street 1' });
    expect(locationLink).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Main%20Street%201',
    );
    expect(locationLink).toHaveAttribute('target', '_blank');

    const phoneLink = screen.getByRole('link', { name: '+49 123 456' });
    expect(phoneLink).toHaveAttribute('href', 'tel:+49 123 456');

    const urlLink = screen.getByRole('link', { name: 'https://pizza.example' });
    expect(urlLink).toHaveAttribute('href', 'https://pizza.example');
    expect(urlLink).toHaveAttribute('target', '_blank');
  });

  it('shows menu edit dialog when clicking Edit', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({ name: 'Old Name' })],
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Expand Old Name'));
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(screen.getByDisplayValue('Old Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
    expect(screen.getByLabelText('URL')).toBeInTheDocument();
  });

  it('calls updateMenu API when saving name and contact details', async () => {
    const user = userEvent.setup();
    mockUpdateMenu.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({ name: 'Old Name' })],
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Expand Old Name'));
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const input = screen.getByDisplayValue('Old Name');
    await user.clear(input);
    await user.type(input, 'New Name');
    await user.type(screen.getByLabelText('Location'), 'Street 7');
    await user.type(screen.getByLabelText('Phone'), '+49 999');
    await user.type(screen.getByLabelText('URL'), 'https://menu.example');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mockUpdateMenu).toHaveBeenCalledWith('menu-1', {
      name: 'New Name',
      location: 'Street 7',
      phone: '+49 999',
      url: 'https://menu.example',
    });
  });

  it('shows delete confirmation dialog', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({ name: 'Pizza Place' })],
    });
    renderPage();

    // Click bottom-level Delete button (menu card)
    fireEvent.click(screen.getByLabelText('Expand Pizza Place'));
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    expect(screen.getByText(/delete menu "pizza place"/i)).toBeInTheDocument();
  });

  it('calls deleteMenu API on confirmation', async () => {
    const user = userEvent.setup();
    mockDeleteMenu.mockResolvedValue(undefined);
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu()],
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Expand Pizza Place'));
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);
    // Confirm dialog should have a Delete button
    const confirmDelete = screen.getAllByRole('button', { name: 'Delete' });
    // The last Delete button is in the confirm dialog
    await user.click(confirmDelete[confirmDelete.length - 1]);

    expect(mockDeleteMenu).toHaveBeenCalledWith('menu-1');
  });

  it('shows menu items and "+ Add item" button', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({ items: [makeMenuItem({ itemNumber: '12', name: 'Margherita', price: 9.5 })] })],
    });
    renderPage();
    fireEvent.click(screen.getByLabelText('Expand Pizza Place'));
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(screen.getByText('€9.50')).toBeInTheDocument();
    expect(screen.getByText('+ Add item')).toBeInTheDocument();
  });

  it('opens add item form and calls createMenuItem', async () => {
    const user = userEvent.setup();
    mockCreateMenuItem.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu()],
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Expand Pizza Place'));
    await user.click(screen.getByText('+ Add item'));
    await user.type(screen.getByPlaceholderText('Meal number (optional)'), '12');
    await user.type(screen.getByPlaceholderText('Item name'), 'Calzone');
    await user.type(screen.getByPlaceholderText('Price (optional)'), '9.50');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(mockCreateMenuItem).toHaveBeenCalledWith('menu-1', {
      name: 'Calzone',
      description: undefined,
      itemNumber: '12',
      price: 9.5,
    });
  });

  it('edits item number and price for an existing menu item', async () => {
    const user = userEvent.setup();
    mockUpdateMenuItem.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({ items: [makeMenuItem({ id: 'item-1', itemNumber: '12', name: 'Margherita', price: 9.5 })] })],
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Expand Pizza Place'));
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[editButtons.length - 1]);
    await user.clear(screen.getByDisplayValue('12'));
    await user.type(screen.getByPlaceholderText('Meal number (optional)'), '21');
    await user.clear(screen.getByDisplayValue('9.50'));
    await user.type(screen.getByPlaceholderText('Price (optional)'), '10.50');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpdateMenuItem).toHaveBeenCalledWith('menu-1', 'item-1', {
      name: 'Margherita',
      description: undefined,
      itemNumber: '21',
      price: 10.5,
    });
  });

  it('saves a default meal and organizer fallback opt-in for a menu', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({ items: [makeMenuItem({ id: 'item-1', itemNumber: '12', name: 'Margherita' })] })],
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Expand Pizza Place'));
    await user.selectOptions(screen.getByLabelText(/default meal for pizza place/i), 'item-1');
    await user.type(screen.getByLabelText(/default comment for pizza place/i), 'No onions');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /save default/i }));

    expect(mockUpdateUserMenuDefaultPreference).toHaveBeenCalledWith(
      'menu-1',
      'alice@example.com',
      'item-1',
      'No onions',
      true,
    );
    expect(await screen.findByText('Default meal saved.')).toBeInTheDocument();
  });

  it('shows "No items yet" for empty menu', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({ items: [], itemCount: 0 })],
    });
    renderPage();
    fireEvent.click(screen.getByLabelText('Expand Pizza Place'));
    expect(screen.getByText('No items yet')).toBeInTheDocument();
  });
});
