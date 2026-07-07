import { useState } from 'react';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';
import type {
  MealAnticipatedLikeSentiment,
  MealRecommendationOnboardingCandidate,
} from '../../lib/types.js';

interface MealOnboardingDialogProps {
  open: boolean;
  loading: boolean;
  error: string;
  candidates: MealRecommendationOnboardingCandidate[];
  onClose: () => void;
  onMarkCandidate: (itemId: string, sentiment: MealAnticipatedLikeSentiment) => Promise<void>;
}

function SentimentButton({
  label,
  sentiment,
  candidate,
  disabled,
  onMarkCandidate,
}: {
  label: string;
  sentiment: MealAnticipatedLikeSentiment;
  candidate: MealRecommendationOnboardingCandidate;
  disabled: boolean;
  onMarkCandidate: (itemId: string, sentiment: MealAnticipatedLikeSentiment) => Promise<void>;
}) {
  return (
    <Button
      variant={sentiment === 'like' ? 'success' : 'warning'}
      disabled={disabled}
      onClick={() => void onMarkCandidate(candidate.itemId, sentiment)}
      className="px-3 py-1.5"
      aria-label={`${label} ${candidate.itemName}`}
    >
      {label}
    </Button>
  );
}

export default function MealOnboardingDialog({
  open,
  loading,
  error,
  candidates,
  onClose,
  onMarkCandidate,
}: MealOnboardingDialogProps) {
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const handleMarkCandidate = async (itemId: string, sentiment: MealAnticipatedLikeSentiment) => {
    setBusyItemId(itemId);
    try {
      await onMarkCandidate(itemId, sentiment);
    } finally {
      setBusyItemId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="meal-onboarding-title"
      className="max-w-3xl"
      data-testid="meal-onboarding-dialog"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="meal-onboarding-title" className="text-lg font-semibold text-fg">
              Mark dishes you expect to like
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              This is optional. Pick a few dishes you would probably enjoy and we&apos;ll use them
              to warm up your recommendations.
            </p>
          </div>
          <Button variant="secondary" onClick={onClose} className="px-3 py-1.5 text-fg-muted">
            Skip
          </Button>
        </div>

        {loading ? (
          <p className="rounded border border-border bg-surface-muted px-4 py-3 text-sm text-fg-muted">
            Preparing flavorful picks...
          </p>
        ) : null}

        {error ? <p className="rounded border border-danger bg-danger-soft px-4 py-3 text-sm text-danger-fg">{error}</p> : null}

        {!loading && candidates.length === 0 ? (
          <p className="rounded border border-border bg-surface-muted px-4 py-3 text-sm text-fg-muted">
            No onboarding picks are available right now.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {candidates.map((candidate) => (
            <div key={candidate.itemId} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-fg">{candidate.itemName}</h3>
                  <p className="mt-1 text-xs text-fg-muted">Tap one of the buttons to save your signal.</p>
                </div>
              </div>

              {candidate.tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {candidate.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted"
                    >
                      {tag.replace(/^(ingredient|style):/, '')}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <SentimentButton
                  label="Like"
                  sentiment="like"
                  candidate={candidate}
                  disabled={busyItemId === candidate.itemId}
                  onMarkCandidate={handleMarkCandidate}
                />
                <SentimentButton
                  label="Dislike"
                  sentiment="dislike"
                  candidate={candidate}
                  disabled={busyItemId === candidate.itemId}
                  onMarkCandidate={handleMarkCandidate}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
