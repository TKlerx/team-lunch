import { useState } from 'react';
import { useAppState } from '../context/AppContext.js';
import * as api from '../api.js';
import { isAdminAuthenticatedUser, isCreatorAuthenticatedUser } from '../auth.js';
import FoodSelectionAbortControl from './FoodSelectionAbortControl.js';
import FoodSelectionOrderBoard from './FoodSelectionOrderBoard.js';

const EXTEND_OPTIONS = [5, 10, 15] as const;

export default function FoodSelectionOvertimeView() {
  const { activeFoodSelection, menus } = useAppState();
  const [extensionMinutes, setExtensionMinutes] = useState<number>(5);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!activeFoodSelection) return null;

  const selection = activeFoodSelection;
  const canManageFoodSelection = isAdminAuthenticatedUser();
  const canExtendFoodSelection = canManageFoodSelection || isCreatorAuthenticatedUser(selection.createdBy);
  const canAdvanceToOrdering = true;

  const handleExtend = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.extendFoodSelection(selection.id, extensionMinutes);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.completeFoodSelection(selection.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAbort = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.abortFoodSelection(selection.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 lg:px-6">
      {/* Overtime banner */}
      <div className="mb-4 rounded bg-amber-50 px-4 py-2 text-center">
        <span className="text-sm font-medium text-amber-700">
          {selection.menuName} &mdash; Time&apos;s up!
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Left: Prompt */}
        <div className="rounded-lg border border-amber-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h2 className="mb-2 text-lg font-semibold text-amber-700">
            Time&apos;s up!
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            Extend the food selection or confirm the order?
          </p>

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          {/* Extend */}
          <div className="mb-4 space-y-2">
            <div className="flex gap-2">
              <select
                value={extensionMinutes}
                onChange={(e) => setExtensionMinutes(Number(e.target.value))}
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {EXTEND_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleExtend()}
                disabled={submitting || !canExtendFoodSelection}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Extend
              </button>
            </div>
            {!canExtendFoodSelection && (
              <p className="text-sm text-amber-700">
                Only admins or the food-selection creator can extend this timer.
              </p>
            )}
          </div>

          <div className="relative my-4 flex items-center">
            <div className="flex-1 border-t border-gray-200" />
            <span className="px-3 text-xs text-gray-400">or</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          {canAdvanceToOrdering ? (
            <button
              type="button"
              onClick={() => void handleComplete()}
              disabled={submitting}
              className="w-full rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Confirm &mdash; we&apos;re done
            </button>
          ) : (
            <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              Finish meal collection once everyone has ordered.
            </p>
          )}

          {canManageFoodSelection && (
            <div className="mt-3 text-center">
              <FoodSelectionAbortControl disabled={submitting} onAbort={handleAbort} />
            </div>
          )}
        </div>

        <FoodSelectionOrderBoard selection={selection} menus={menus} />
      </div>
    </div>
  );
}
