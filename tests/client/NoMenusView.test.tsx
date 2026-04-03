import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NoMenusView from '../../src/client/components/NoMenusView.js';

function renderView() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NoMenusView />
    </MemoryRouter>,
  );
}

describe('NoMenusView', () => {
  it('shows the "No menus yet" heading', () => {
    renderView();
    expect(screen.getByText('No menus yet')).toBeInTheDocument();
  });

  it('shows an instructional message', () => {
    renderView();
    expect(
      screen.getByText(/create a menu with at least one item/i),
    ).toBeInTheDocument();
  });

  it('renders a "Create Menu" link pointing to /menus', () => {
    renderView();
    const link = screen.getByRole('link', { name: /create menu/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/menus');
  });
});
