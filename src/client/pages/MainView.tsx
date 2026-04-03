import type { AppPhase } from '../../lib/types.js';
import NoMenusView from '../components/NoMenusView.js';
import PollIdleView from '../components/PollIdleView.js';
import PollActiveView from '../components/PollActiveView.js';
import PollTiedView from '../components/PollTiedView.js';
import PollFinishedView from '../components/PollFinishedView.js';
import FoodSelectionActiveView from '../components/FoodSelectionActiveView.js';
import FoodSelectionOvertimeView from '../components/FoodSelectionOvertimeView.js';
import FoodSelectionOrderingView from '../components/FoodSelectionOrderingView.js';
import FoodDeliveryView from '../components/FoodDeliveryView.js';
import FoodSelectionCompletedView from '../components/FoodSelectionCompletedView.js';

/**
 * Phase-driven main view. Renders the appropriate view component for each phase.
 */
export default function MainView({
  phase,
  onOpenHistorySelection,
}: {
  phase: AppPhase;
  onOpenHistorySelection?: (selectionId: string) => void;
}) {
  switch (phase) {
    case 'NICKNAME_PROMPT':
      return null;
    case 'NO_MENUS':
      return <NoMenusView />;
    case 'POLL_IDLE':
      return <PollIdleView onOpenHistorySelection={onOpenHistorySelection} />;
    case 'POLL_ACTIVE':
      return <PollActiveView />;
    case 'POLL_TIED':
      return <PollTiedView />;
    case 'POLL_FINISHED':
      return <PollFinishedView />;
    case 'FOOD_SELECTION_ACTIVE':
      return <FoodSelectionActiveView />;
    case 'FOOD_SELECTION_OVERTIME':
      return <FoodSelectionOvertimeView />;
    case 'FOOD_ORDERING':
      return <FoodSelectionOrderingView />;
    case 'FOOD_DELIVERY_ACTIVE':
      return <FoodDeliveryView />;
    case 'FOOD_DELIVERY_DUE':
      return <FoodDeliveryView />;
    case 'FOOD_SELECTION_COMPLETED':
      return <FoodSelectionCompletedView />;
  }
}
