import { Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header.js';
import NicknameModal from './components/NicknameModal.js';
import DatabaseConnectionModal from './components/DatabaseConnectionModal.js';
import OrdersRail from './components/OrdersRail.js';
import FoodSelectionCompletedView from './components/FoodSelectionCompletedView.js';
import MainView from './pages/MainView.js';
import ManageMenus from './pages/ManageMenus.js';
import ShoppingList from './pages/ShoppingList.js';
import { useAppDispatch, useAppState } from './context/AppContext.js';
import { useAdminOfficeContext } from './context/AdminOfficeContext.js';
import { useSSE } from './hooks/useSSE.js';
import { useAppPhase } from './hooks/useAppPhase.js';
import { usePhaseNotifications } from './hooks/usePhaseNotifications.js';
import { useNotificationPreference } from './hooks/useNotificationPreference.js';
import { useNickname } from './hooks/useNickname.js';
import { isExternalAuthEnabled } from './auth.js';
import { withBasePath } from './config.js';
import cuisineAroundTheWorldImage from '../../assets/cuisine-around-the-world.png';
import exampleCompanyLogoImage from '../../assets/example-company-logo.png';

export default function App() {
  const { nickname, updateNickname } = useNickname();
  const externalAuthEnabled = isExternalAuthEnabled();
  const { notificationsEnabled, toggleNotificationsEnabled } = useNotificationPreference();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    canSwitchOfficeLocation,
    officeLocations,
    selectedOfficeLocationId,
    setSelectedOfficeLocationId,
  } = useAdminOfficeContext();
  const {
    completedFoodSelectionsHistory,
    activePoll,
    activeFoodSelection,
    menus,
    dbConnected,
    dbReconnectAttempts,
  } = useAppState();
  const phase = useAppPhase(nickname);
  usePhaseNotifications(phase, notificationsEnabled, activePoll, activeFoodSelection, nickname);
  const [selectedHistorySelectionId, setSelectedHistorySelectionId] = useState<string | null>(null);

  // SSE connection (fires once, stays open)
  useSSE(selectedOfficeLocationId);

  useEffect(() => {
    setSelectedHistorySelectionId(null);
  }, [selectedOfficeLocationId]);

  const selectedHistorySelection = useMemo(
    () =>
      completedFoodSelectionsHistory.find((selection) => selection.id === selectedHistorySelectionId) ??
      null,
    [completedFoodSelectionsHistory, selectedHistorySelectionId],
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
    setSelectedHistorySelectionId(selectionId);
    navigate('/');
  };

  const handleBackToOngoing = () => {
    setSelectedHistorySelectionId(null);
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
        localStorage.removeItem('team_lunch_auth_method');
        localStorage.removeItem('team_lunch_auth_role');
        window.location.reload();
      }
    })();
  };

  return (
    <div className="relative min-h-screen">
      <div className="relative z-0 flex min-h-screen flex-col">
        <Header
          nickname={nickname}
          onRename={updateNickname}
          allowRename={!externalAuthEnabled}
          notificationsEnabled={notificationsEnabled}
          onToggleNotifications={toggleNotificationsEnabled}
          onLogout={externalAuthEnabled ? handleLogout : undefined}
          officeLocations={canSwitchOfficeLocation ? officeLocations : []}
          selectedOfficeLocationId={selectedOfficeLocationId}
          onSelectOfficeLocation={setSelectedOfficeLocationId}
        />

        {/* Full-screen modal on first visit (no nickname yet) */}
        <NicknameModal
          open={!externalAuthEnabled && phase === 'NICKNAME_PROMPT'}
          title="Welcome! Choose a nickname"
          onSubmit={updateNickname}
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
                setSelectedHistorySelectionId(null);
                navigate('/');
                return;
              }
              setSelectedHistorySelectionId(null);
              dispatch({ type: 'START_NEW_TEAM_LUNCH' });
              navigate('/');
            }}
            disableStartNewTeamLunch={
              !showInProgressAction && !hasMenuWithItems
            }
          />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white/95">
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

            <div className="relative z-10 flex min-h-0 flex-1 flex-col">
              <Routes>
                <Route
                  path="/"
                  element={
                    selectedHistorySelection ? (
                      <FoodSelectionCompletedView selection={selectedHistorySelection} isHistorical onBackToDashboard={handleBackToOngoing} />
                    ) : (
                      <MainView
                        phase={phase}
                        onOpenHistorySelection={handleSelectSelection}
                      />
                    )
                  }
                />
                <Route path="/menus" element={<ManageMenus />} />
                <Route path="/shopping" element={<ShoppingList />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
