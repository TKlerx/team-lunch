import { Link, Navigate, Routes, Route, useMatch, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.js';
import DatabaseConnectionModal from './components/DatabaseConnectionModal.js';
import OrdersRail from './components/OrdersRail.js';
import FoodSelectionCompletedView from './components/FoodSelectionCompletedView.js';
import MainView from './pages/MainView.js';
import ManageMenus from './pages/ManageMenus.js';
import ShoppingList from './pages/ShoppingList.js';
import Settings from './pages/Settings.js';
import Administration from './pages/Administration.js';
import { useAppDispatch, useAppState } from './context/AppContext.js';
import { useAdminOfficeContext } from './context/AdminOfficeContext.js';
import { useSSE } from './hooks/useSSE.js';
import { useAppPhase } from './hooks/useAppPhase.js';
import { usePhaseNotifications } from './hooks/usePhaseNotifications.js';
import { useNotificationPreference } from './hooks/useNotificationPreference.js';
import {
  ACTOR_KEY_STORAGE_KEY,
  AUTH_METHOD_STORAGE_KEY,
  AUTH_PROFILE_UPDATED_EVENT,
  AUTH_ROLE_STORAGE_KEY,
  DISPLAY_NAME_STORAGE_KEY,
  getAuthenticatedDisplayLabel,
  getAuthenticatedAuthMethod,
  isExternalAuthEnabled,
} from './auth.js';
import { withBasePath } from './config.js';
import cuisineAroundTheWorldImage from '../../assets/cuisine-around-the-world.png';
import exampleCompanyLogoImage from '../../assets/example-company-logo.png';

function RouteLoadingView() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-12 text-center">
      <p className="text-sm font-medium text-fg-muted">Loading route...</p>
    </div>
  );
}

function RouteUnavailableView({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-12 text-center">
      <div className="rounded-lg border border-border bg-surface/90 px-6 py-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-fg">{title}</h1>
        <p className="mt-3 text-sm text-fg-muted">{message}</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  const [, setAuthProfileVersion] = useState(0);
  const nickname = getAuthenticatedDisplayLabel();
  const authMethod = getAuthenticatedAuthMethod();
  const externalAuthEnabled = isExternalAuthEnabled();
  const { notificationsEnabled, toggleNotificationsEnabled } = useNotificationPreference();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    selectedOfficeLocationId,
    isAdmin,
    pendingApprovalCount,
  } = useAdminOfficeContext();

  const autoOpenedAdmin = useRef(false);
  useEffect(() => {
    if (!autoOpenedAdmin.current && isAdmin && pendingApprovalCount > 0) {
      autoOpenedAdmin.current = true;
      navigate('/admin');
    }
  }, [isAdmin, pendingApprovalCount, navigate]);
  const {
    completedFoodSelectionsHistory,
    activePoll,
    activeFoodSelection,
    latestCompletedPoll,
    latestCompletedFoodSelection,
    menus,
    dbConnected,
    dbReconnectAttempts,
    initialized,
  } = useAppState();
  const phase = useAppPhase();
  const routeStateInitialized = initialized !== false;
  usePhaseNotifications(phase, notificationsEnabled, activePoll, activeFoodSelection, nickname);
  const foodSelectionRouteMatch = useMatch('/food-selections/:foodSelectionId');
  const routeFoodSelectionId = foodSelectionRouteMatch?.params.foodSelectionId ?? null;

  // SSE connection (fires once, stays open)
  useSSE(selectedOfficeLocationId);

  useEffect(() => {
    const handleAuthProfileUpdated = () => {
      setAuthProfileVersion((version) => version + 1);
    };
    window.addEventListener(AUTH_PROFILE_UPDATED_EVENT, handleAuthProfileUpdated);
    return () => {
      window.removeEventListener(AUTH_PROFILE_UPDATED_EVENT, handleAuthProfileUpdated);
    };
  }, []);

  const selectedHistorySelectionId = useMemo(
    () =>
      routeFoodSelectionId && completedFoodSelectionsHistory.some((selection) => selection.id === routeFoodSelectionId)
        ? routeFoodSelectionId
        : null,
    [completedFoodSelectionsHistory, routeFoodSelectionId],
  );

  const hasOngoingLunchProcess = !!activePoll || !!activeFoodSelection;
  const isPollFinishedTransition = phase === 'POLL_FINISHED';
  const showInProgressAction = hasOngoingLunchProcess || isPollFinishedTransition;
  const hasMenuWithItems = menus.some((menu) => menu.items.length > 0);

  const inProgressDetails = useMemo(() => {
    if (activeFoodSelection) {
      if (
        activeFoodSelection.status === 'delivering' ||
        activeFoodSelection.status === 'delivery_due'
      ) {
        return {
          actionLabel: 'Awaiting lunch delivery...',
          phaseLabel: '3/3',
          countdownTo: activeFoodSelection.deliveryDueAt,
        };
      }

      return {
        actionLabel: 'Food selection in progress...',
        phaseLabel: '2/3',
        countdownTo: activeFoodSelection.endsAt,
      };
    }

    if (activePoll) {
      return {
        actionLabel: 'Cuisine poll in progress...',
        phaseLabel: '1/3',
        countdownTo: activePoll.endsAt,
      };
    }

    if (isPollFinishedTransition) {
      return {
        actionLabel: 'Cuisine poll in progress...',
        phaseLabel: '1/3',
        countdownTo: null,
      };
    }

    return {
      actionLabel: undefined,
      phaseLabel: undefined,
      countdownTo: null,
    };
  }, [activeFoodSelection, activePoll, isPollFinishedTransition]);

  const handleSelectSelection = (selectionId: string) => {
    navigate(`/food-selections/${selectionId}`);
  };

  const handleBackToOngoing = () => {
    navigate('/');
  };

  const handleLogout = () => {
    void (async () => {
      try {
        await fetch(withBasePath('/api/auth/logout'), {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        // Ignore network errors and still clear local auth hints.
      } finally {
        localStorage.removeItem(AUTH_METHOD_STORAGE_KEY);
        localStorage.removeItem(AUTH_ROLE_STORAGE_KEY);
        localStorage.removeItem(ACTOR_KEY_STORAGE_KEY);
        localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY);
        window.location.reload();
      }
    })();
  };

  return (
    <div className="relative h-screen overflow-hidden">
      <div className="relative z-0 flex h-full min-h-0 flex-col">
        <Header
          nickname={nickname}
          authMethod={authMethod}
          notificationsEnabled={notificationsEnabled}
          onToggleNotifications={toggleNotificationsEnabled}
          onLogout={externalAuthEnabled ? handleLogout : undefined}
          isAdmin={isAdmin}
          pendingApprovalCount={pendingApprovalCount}
        />

        <DatabaseConnectionModal open={!dbConnected} attemptCount={dbReconnectAttempts} />

        <main className="flex min-h-0 flex-1">
          <OrdersRail
            history={completedFoodSelectionsHistory}
            selectedSelectionId={selectedHistorySelectionId}
            onSelectSelection={handleSelectSelection}
            onBackToOngoing={handleBackToOngoing}
            hasOngoingLunchProcess={showInProgressAction}
            inProgressActionLabel={inProgressDetails.actionLabel}
            inProgressPhaseLabel={inProgressDetails.phaseLabel}
            inProgressCountdownTo={inProgressDetails.countdownTo}
            onStartNewTeamLunch={() => {
              if (showInProgressAction) {
                if (activeFoodSelection) {
                  navigate(`/food-selections/${activeFoodSelection.id}`);
                  return;
                }
                if (activePoll) {
                  navigate(`/polls/${activePoll.id}`);
                  return;
                }
                if (latestCompletedPoll) {
                  navigate(`/polls/${latestCompletedPoll.id}`);
                  return;
                }
                navigate('/');
                return;
              }
              dispatch({ type: 'START_NEW_TEAM_LUNCH' });
              navigate('/');
            }}
            disableStartNewTeamLunch={
              !showInProgressAction && !hasMenuWithItems
            }
          />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface/95">
            <div
              className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
              aria-hidden
            >
              <div className="relative h-full w-full max-h-[70%] max-w-[70%]">
                <div className="absolute inset-0 z-0 flex items-center justify-center">
                  <img
                    src={cuisineAroundTheWorldImage}
                    alt=""
                    className="h-auto w-auto max-h-full max-w-full object-contain opacity-20"
                  />
                </div>
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <img
                    src={exampleCompanyLogoImage}
                    alt=""
                    className="h-auto w-auto max-h-[24%] max-w-[45%] object-contain opacity-20"
                  />
                </div>
              </div>
            </div>

            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
              <Routes>
                <Route
                  path="/"
                  element={
                    <MainView
                      phase={phase}
                      onOpenHistorySelection={handleSelectSelection}
                    />
                  }
                />
                <Route
                  path="/polls/:pollId"
                  element={
                    <PollRouteView
                      phase={phase}
                      initialized={routeStateInitialized}
                      activePoll={activePoll}
                      activeFoodSelectionId={activeFoodSelection?.id ?? null}
                      latestCompletedPoll={latestCompletedPoll}
                      onOpenHistorySelection={handleSelectSelection}
                    />
                  }
                />
                <Route
                  path="/food-selections/:foodSelectionId"
                  element={
                    <FoodSelectionRouteView
                      phase={phase}
                      initialized={routeStateInitialized}
                      activeFoodSelection={activeFoodSelection}
                      latestCompletedFoodSelection={latestCompletedFoodSelection}
                      completedFoodSelectionsHistory={completedFoodSelectionsHistory}
                      onBackToDashboard={handleBackToOngoing}
                      onOpenHistorySelection={handleSelectSelection}
                    />
                  }
                />
                <Route path="/menus" element={<ManageMenus />} />
                <Route path="/shopping-list" element={<ShoppingList />} />
                <Route path="/shopping" element={<Navigate to="/shopping-list" replace />} />
                <Route
                  path="/settings"
                  element={<Settings />}
                />
                <Route path="/admin" element={<Administration />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function PollRouteView({
  phase,
  initialized,
  activePoll,
  activeFoodSelectionId,
  latestCompletedPoll,
  onOpenHistorySelection,
}: {
  phase: ReturnType<typeof useAppPhase>;
  initialized: boolean;
  activePoll: ReturnType<typeof useAppState>['activePoll'];
  activeFoodSelectionId: string | null;
  latestCompletedPoll: ReturnType<typeof useAppState>['latestCompletedPoll'];
  onOpenHistorySelection: (selectionId: string) => void;
}) {
  const { pollId } = useParams();
  const matchesActivePoll = !!pollId && activePoll?.id === pollId;
  const matchesJustFinishedPoll =
    !!pollId &&
    !activeFoodSelectionId &&
    latestCompletedPoll?.id === pollId &&
    phase === 'POLL_FINISHED';

  if (matchesActivePoll || matchesJustFinishedPoll) {
    return <MainView phase={phase} onOpenHistorySelection={onOpenHistorySelection} />;
  }

  if (!initialized) {
    return <RouteLoadingView />;
  }

  return (
    <RouteUnavailableView
      title="Poll unavailable"
      message="This poll is not the current visible poll for your office."
    />
  );
}

function FoodSelectionRouteView({
  phase,
  initialized,
  activeFoodSelection,
  latestCompletedFoodSelection,
  completedFoodSelectionsHistory,
  onBackToDashboard,
  onOpenHistorySelection,
}: {
  phase: ReturnType<typeof useAppPhase>;
  initialized: boolean;
  activeFoodSelection: ReturnType<typeof useAppState>['activeFoodSelection'];
  latestCompletedFoodSelection: ReturnType<typeof useAppState>['latestCompletedFoodSelection'];
  completedFoodSelectionsHistory: ReturnType<typeof useAppState>['completedFoodSelectionsHistory'];
  onBackToDashboard: () => void;
  onOpenHistorySelection: (selectionId: string) => void;
}) {
  const { foodSelectionId } = useParams();
  const completedSelection =
    completedFoodSelectionsHistory.find((selection) => selection.id === foodSelectionId) ??
    (latestCompletedFoodSelection?.id === foodSelectionId ? latestCompletedFoodSelection : null);

  if (foodSelectionId && activeFoodSelection?.id === foodSelectionId) {
    return <MainView phase={phase} onOpenHistorySelection={onOpenHistorySelection} />;
  }

  if (completedSelection) {
    return (
      <FoodSelectionCompletedView
        selection={completedSelection}
        isHistorical
        onBackToDashboard={onBackToDashboard}
      />
    );
  }

  if (!initialized) {
    return <RouteLoadingView />;
  }

  return (
    <RouteUnavailableView
      title="Food selection unavailable"
      message="This meal is not available in the current office history or live lunch flow."
    />
  );
}
