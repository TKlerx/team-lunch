import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import MainView from '../../src/client/pages/MainView.js';
import type { AppPhase } from '../../src/lib/types.js';

// Mock all child components so we can test routing in isolation
vi.mock('../../src/client/components/NoMenusView.js', () => ({
  default: () => <div data-testid="no-menus-view" />,
}));
vi.mock('../../src/client/components/PollIdleView.js', () => ({
  default: () => <div data-testid="poll-idle-view" />,
}));
vi.mock('../../src/client/components/PollActiveView.js', () => ({
  default: () => <div data-testid="poll-active-view" />,
}));
vi.mock('../../src/client/components/PollTiedView.js', () => ({
  default: () => <div data-testid="poll-tied-view" />,
}));
vi.mock('../../src/client/components/PollFinishedView.js', () => ({
  default: () => <div data-testid="poll-finished-view" />,
}));
vi.mock('../../src/client/components/FoodSelectionActiveView.js', () => ({
  default: () => <div data-testid="food-selection-active-view" />,
}));
vi.mock('../../src/client/components/FoodSelectionOvertimeView.js', () => ({
  default: () => <div data-testid="food-selection-overtime-view" />,
}));
vi.mock('../../src/client/components/FoodSelectionOrderingView.js', () => ({
  default: () => <div data-testid="food-selection-ordering-view" />,
}));
vi.mock('../../src/client/components/FoodDeliveryView.js', () => ({
  default: () => <div data-testid="food-delivery-view" />,
}));
vi.mock('../../src/client/components/FoodSelectionCompletedView.js', () => ({
  default: () => <div data-testid="food-selection-completed-view" />,
}));

function renderPhase(phase: AppPhase) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MainView phase={phase} />
    </MemoryRouter>,
  );
}

describe('MainView — phase routing', () => {
  it('renders nothing for NICKNAME_PROMPT', () => {
    const { container } = renderPhase('NICKNAME_PROMPT');
    expect(container.innerHTML).toBe('');
  });

  it('renders NoMenusView for NO_MENUS', () => {
    renderPhase('NO_MENUS');
    expect(screen.getByTestId('no-menus-view')).toBeInTheDocument();
  });

  it('renders PollIdleView for POLL_IDLE', () => {
    renderPhase('POLL_IDLE');
    expect(screen.getByTestId('poll-idle-view')).toBeInTheDocument();
  });

  it('renders PollActiveView for POLL_ACTIVE', () => {
    renderPhase('POLL_ACTIVE');
    expect(screen.getByTestId('poll-active-view')).toBeInTheDocument();
  });

  it('renders PollTiedView for POLL_TIED', () => {
    renderPhase('POLL_TIED');
    expect(screen.getByTestId('poll-tied-view')).toBeInTheDocument();
  });

  it('renders PollFinishedView for POLL_FINISHED', () => {
    renderPhase('POLL_FINISHED');
    expect(screen.getByTestId('poll-finished-view')).toBeInTheDocument();
  });

  it('renders FoodSelectionActiveView for FOOD_SELECTION_ACTIVE', () => {
    renderPhase('FOOD_SELECTION_ACTIVE');
    expect(screen.getByTestId('food-selection-active-view')).toBeInTheDocument();
  });

  it('renders FoodSelectionOvertimeView for FOOD_SELECTION_OVERTIME', () => {
    renderPhase('FOOD_SELECTION_OVERTIME');
    expect(screen.getByTestId('food-selection-overtime-view')).toBeInTheDocument();
  });

  it('renders FoodSelectionOrderingView for FOOD_ORDERING', () => {
    renderPhase('FOOD_ORDERING');
    expect(screen.getByTestId('food-selection-ordering-view')).toBeInTheDocument();
  });

  it('renders FoodDeliveryView for FOOD_DELIVERY_ACTIVE', () => {
    renderPhase('FOOD_DELIVERY_ACTIVE');
    expect(screen.getByTestId('food-delivery-view')).toBeInTheDocument();
  });

  it('renders FoodDeliveryView for FOOD_DELIVERY_DUE', () => {
    renderPhase('FOOD_DELIVERY_DUE');
    expect(screen.getByTestId('food-delivery-view')).toBeInTheDocument();
  });

  it('renders FoodSelectionCompletedView for FOOD_SELECTION_COMPLETED', () => {
    renderPhase('FOOD_SELECTION_COMPLETED');
    expect(screen.getByTestId('food-selection-completed-view')).toBeInTheDocument();
  });
});
