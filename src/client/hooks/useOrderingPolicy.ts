import type { Dispatch } from 'react';
import type { OrderingPolicyAvailability } from '../../lib/types.js';
import { fetchOrderingPolicy } from '../api.js';
import {
  useAppState, useOrderingPolicyRefresh, type AppAction,
} from '../context/AppContext.js';

/** Reads the single SSE-owned policy subscription; calling this hook adds no listeners. */
export function useOrderingPolicy() {
  const { orderingPolicy } = useAppState();
  const refresh = useOrderingPolicyRefresh();
  return { ...orderingPolicy, refresh };
}

function isOlder(availability: OrderingPolicyAvailability | null, evaluatedAt: string | null): boolean {
  return availability !== null && evaluatedAt !== null &&
    Date.parse(availability.evaluatedAt) < Date.parse(evaluatedAt);
}

function matchesOffice(availability: OrderingPolicyAvailability | null, officeLocationId: string | null): boolean {
  return availability === null || availability.officeLocationId === officeLocationId;
}

/** One request sequence per SSE connection/office, including hydration and reconnects. */
export function createOrderingPolicyConnection(
  officeLocationId: string | null,
  dispatch: Dispatch<AppAction>,
  isCurrent: () => boolean,
) {
  let requestId = 0;
  let hydrationAllowed = true;
  let initialConnection = true;
  let evaluatedAt: string | null = null;
  const isLatest = (id: number) => isCurrent() && id === requestId;

  const publish = (availability: OrderingPolicyAvailability | null, loading: boolean, error: string | null) => {
    dispatch({ type: 'SET_ORDERING_POLICY', payload: { officeLocationId, availability, loading, error } });
  };

  const refresh = async (): Promise<OrderingPolicyAvailability | null> => {
    if (!officeLocationId || !isCurrent()) return null;
    const id = ++requestId;
    hydrationAllowed = false;
    publish(null, true, null);
    try {
      const availability = await fetchOrderingPolicy(officeLocationId);
      if (!isLatest(id)) return null;
      hydrationAllowed = false;
      if (availability.officeLocationId !== officeLocationId) {
        throw new Error('Ordering policy office does not match the selected office');
      }
      if (isOlder(availability, evaluatedAt)) {
        throw new Error('Ordering policy response is stale');
      }
      evaluatedAt = availability.evaluatedAt;
      publish(availability, false, null);
      return availability;
    } catch (error) {
      if (isLatest(id)) {
        hydrationAllowed = false;
        publish(null, false, error instanceof Error ? error.message : 'Ordering policy unavailable');
      }
      return null;
    }
  };

  const reconnect = () => {
    const pending = refresh();
    // Only first-connect hydration can replace REST. A reconnect snapshot has no request
    // sequence, so it cannot safely supersede an invalidation or boundary recheck.
    hydrationAllowed = initialConnection;
    initialConnection = false;
    return pending;
  };

  const hydrate = (availability: OrderingPolicyAvailability | null | undefined) => {
    if (!officeLocationId || !isCurrent() || !hydrationAllowed || availability === undefined) return;
    if (!matchesOffice(availability, officeLocationId) || isOlder(availability, evaluatedAt)) return;
    hydrationAllowed = false;
    ++requestId;
    evaluatedAt = availability?.evaluatedAt ?? evaluatedAt;
    publish(availability, false, availability === null ? 'Ordering policy unavailable' : null);
  };

  const cancel = () => {
    ++requestId;
    hydrationAllowed = false;
  };

  return { refresh, reconnect, hydrate, cancel };
}
