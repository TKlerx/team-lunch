import { useEffect, useRef } from 'react';
import type { AppPhase, FoodSelection, Poll } from '../../lib/types.js';

const phaseLabels: Record<AppPhase, string> = {
  NICKNAME_PROMPT: 'Nickname setup',
  NO_MENUS: 'No menus available',
  POLL_IDLE: 'Poll ready',
  POLL_ACTIVE: 'Phase 1/3 · Poll active',
  POLL_TIED: 'Phase 1/3 · Poll tie',
  POLL_FINISHED: 'Phase 1/3 complete',
  FOOD_SELECTION_ACTIVE: 'Phase 2/3 · Food selection active',
  FOOD_SELECTION_OVERTIME: 'Phase 2/3 · Overtime',
  FOOD_ORDERING: 'Phase 3/3 · Place order',
  FOOD_DELIVERY_ACTIVE: 'Phase 3/3 · Delivery tracking',
  FOOD_DELIVERY_DUE: 'Phase 3/3 · Delivery due',
  FOOD_SELECTION_COMPLETED: 'Team lunch completed',
};

type PhaseNotificationContext = {
  phase: AppPhase;
  activePoll: Poll | null;
  activeFoodSelection: FoodSelection | null;
  nickname: string | null;
};

function buildNotificationPayload(context: PhaseNotificationContext): {
  key: string;
  title: string;
  body: string;
} | null {
  const { phase, activePoll, activeFoodSelection, nickname } = context;
  const normalizedNickname = nickname?.trim().toLowerCase() ?? null;

  if (phase === 'FOOD_ORDERING' && activeFoodSelection?.orderPlacedBy) {
    if (
      normalizedNickname &&
      activeFoodSelection.orderPlacedBy.trim().toLowerCase() === normalizedNickname
    ) {
      return null;
    }

    const placedBy = activeFoodSelection.orderPlacedBy.trim();
    return {
      key: `ordering-claimed:${activeFoodSelection.id}:${placedBy.toLowerCase()}`,
      title: 'Team Lunch ordering started',
      body: `${placedBy} started placing the ${activeFoodSelection.menuName} order.`,
    };
  }

  if (phase === 'FOOD_DELIVERY_ACTIVE' && activeFoodSelection) {
    if (
      normalizedNickname &&
      activeFoodSelection.orderPlacedBy &&
      activeFoodSelection.orderPlacedBy.trim().toLowerCase() === normalizedNickname
    ) {
      return null;
    }

    const placedBy = activeFoodSelection.orderPlacedBy?.trim() || 'Someone';
    const etaLabel =
      typeof activeFoodSelection.etaMinutes === 'number'
        ? ` ETA: ${activeFoodSelection.etaMinutes} minute(s).`
        : '';
    return {
      key: `delivery-started:${activeFoodSelection.id}:${activeFoodSelection.orderPlacedAt ?? ''}:${activeFoodSelection.etaMinutes ?? ''}`,
      title: 'Team Lunch order placed',
      body: `${placedBy} placed the ${activeFoodSelection.menuName} order.${etaLabel}`,
    };
  }

  if (phase === 'FOOD_DELIVERY_DUE' && activeFoodSelection) {
    return {
      key: `delivery-due:${activeFoodSelection.id}:${activeFoodSelection.deliveryDueAt ?? ''}`,
      title: 'Team Lunch delivery is due',
      body: `${activeFoodSelection.menuName} should have arrived by now.`,
    };
  }

  if (phase === 'POLL_ACTIVE' && activePoll) {
    return {
      key: `poll-active:${activePoll.id}`,
      title: 'Team Lunch phase update',
      body: `Cuisine poll in progress: ${activePoll.description}`,
    };
  }

  if (phase === 'POLL_FINISHED' && activePoll?.winnerMenuName) {
    return {
      key: `poll-finished:${activePoll.id}:${activePoll.winnerMenuName}`,
      title: 'Team Lunch phase update',
      body: `Cuisine poll finished. Winning menu: ${activePoll.winnerMenuName}`,
    };
  }

  if (
    (phase === 'FOOD_SELECTION_ACTIVE' ||
      phase === 'FOOD_SELECTION_OVERTIME' ||
      phase === 'FOOD_ORDERING' ||
      phase === 'FOOD_SELECTION_COMPLETED') &&
    activeFoodSelection
  ) {
    return {
      key: `${phase}:${activeFoodSelection.id}:${activeFoodSelection.status}`,
      title: 'Team Lunch phase update',
      body: `${phaseLabels[phase]}: ${activeFoodSelection.menuName}`,
    };
  }

  return {
    key: phase,
    title: 'Team Lunch phase update',
    body: phaseLabels[phase] ?? 'Phase changed',
  };
}

export async function sendPhaseNotification(context: PhaseNotificationContext): Promise<void> {
  const payload = buildNotificationPayload(context);
  if (!payload) {
    return;
  }

  return sendBrowserNotification(payload.title, payload.body);
}

export async function sendBrowserNotification(title: string, body: string): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    new Notification(title, { body });
    return;
  }

  if (Notification.permission !== 'default') return;

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    // Ignore permission request errors.
  }
}

export function usePhaseNotifications(
  phase: AppPhase,
  enabled: boolean,
  activePoll: Poll | null,
  activeFoodSelection: FoodSelection | null,
  nickname: string | null,
): void {
  const previousNotificationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const payload = buildNotificationPayload({
      phase,
      activePoll,
      activeFoodSelection,
      nickname,
    });

    if (previousNotificationKeyRef.current === null) {
      previousNotificationKeyRef.current = payload?.key ?? null;
      return;
    }

    if (enabled && payload && previousNotificationKeyRef.current !== payload.key) {
      void sendPhaseNotification({
        phase,
        activePoll,
        activeFoodSelection,
        nickname,
      });
    }
    previousNotificationKeyRef.current = payload?.key ?? null;
  }, [activeFoodSelection, activePoll, enabled, nickname, phase]);
}
