import { useCallback, useEffect, useMemo, useState } from 'react';
import { Section } from './ui/Section.js';
import { Button } from './ui/Button.js';
import * as api from '../api.js';
import type {
  RecommenderEvaluationResponse,
  RecommenderSafeMode,
  RecommenderStatusResponse,
  RecommenderTrainResponse,
} from '../../lib/types.js';

type OfficeLocationSummary = {
  id: string;
  name: string;
  isActive: boolean;
};

interface RecommenderAdminPanelProps {
  officeLocations: OfficeLocationSummary[];
}

type OfficeState = {
  id: string;
  name: string;
  isActive: boolean;
  safeMode: RecommenderSafeMode;
  exploreEnabled: boolean;
  latestMargin: number | null;
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMargin(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return 'n/a';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} pts`;
}

function getStatusSummary(loadingStatus: boolean, status: RecommenderStatusResponse | null): string {
  if (loadingStatus) {
    return 'Loading...';
  }
  if (status?.activeModelVersion) {
    return `Active model v${status.activeModelVersion}`;
  }
  return 'No active model';
}

function getTrainingSummary(trainResult: RecommenderTrainResponse | null): string {
  if (!trainResult) {
    return 'No training run yet';
  }
  return `v${trainResult.modelVersion} on ${trainResult.trainingSampleCount} samples`;
}

function getEvaluationSummary(evaluationResult: RecommenderEvaluationResponse | null): string {
  if (!evaluationResult) {
    return 'No evaluation run yet';
  }
  return `${evaluationResult.results.length} office result(s)`;
}

function mergeOfficeStatus(
  officeLocations: OfficeLocationSummary[],
  status: RecommenderStatusResponse | null,
): OfficeState[] {
  const statusByOffice = new Map(
    (status?.offices ?? []).map((office) => [office.officeLocationId, office]),
  );

  return [...officeLocations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<OfficeState>((office) => {
      const officeStatus = statusByOffice.get(office.id);
      return {
        id: office.id,
        name: office.name,
        isActive: office.isActive,
        safeMode: officeStatus?.safeMode ?? 'baseline',
        exploreEnabled: officeStatus?.exploreEnabled ?? true,
        latestMargin: officeStatus?.latestMargin ?? null,
      };
    });
}

function StatusBadge({ label, tone }: { label: string; tone: 'neutral' | 'success' | 'warning' }) {
  const toneClass =
    tone === 'success'
      ? 'border-success bg-success-soft text-success-fg'
      : tone === 'warning'
        ? 'border-warning bg-warning-soft text-warning-fg'
        : 'border-border bg-surface-muted text-fg-muted';

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${toneClass}`}>
      {label}
    </span>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-fg">{value}</p>
    </div>
  );
}

function SummaryGrid({
  statusValue,
  trainingValue,
  evaluationValue,
  officeCount,
}: {
  statusValue: string;
  trainingValue: string;
  evaluationValue: string;
  officeCount: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Status" value={statusValue} />
      <SummaryCard label="Training" value={trainingValue} />
      <SummaryCard label="Evaluation" value={evaluationValue} />
      <SummaryCard label="Offices" value={`${officeCount} configured`} />
    </div>
  );
}

function StatusNoticeStack({ statusError, actionError }: { statusError: string; actionError: string }) {
  return (
    <>
      {statusError ? (
        <p className="rounded border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-fg">
          {statusError}
        </p>
      ) : null}
      {actionError ? (
        <p className="rounded border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-fg">
          {actionError}
        </p>
      ) : null}
    </>
  );
}

function MaybeEvaluationResults({
  result,
}: {
  result: RecommenderEvaluationResponse | null;
}) {
  if (!result) {
    return null;
  }
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fg">Latest evaluation</p>
      <p className="text-xs text-fg-muted">{result.results.length} office(s)</p>
      </div>
      {result.results.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">No held-out office samples were available yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {result.results.map((entry) => (
            <li key={entry.officeLocationId} className="rounded border border-border bg-surface-muted px-3 py-2 text-sm">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <span className="font-medium text-fg">{entry.officeLocationId}</span>
                <span className="text-fg-muted">
                  baseline {formatPercent(entry.baselineTop3HitRate)} · model {formatPercent(entry.modelTop3HitRate)} · margin {formatMargin(entry.marginPoints)}
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-muted">{entry.sampleCount} held-out sample(s)</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MaybeTrainingBanner({ trainResult }: { trainResult: RecommenderTrainResponse | null }) {
  if (!trainResult) {
    return null;
  }

  return (
    <div className="rounded-lg border border-success bg-success-soft/40 px-4 py-3 text-sm text-success-fg">
      Trained model v{trainResult.modelVersion} from {trainResult.trainingSampleCount} training sample(s).
    </div>
  );
}

function OfficeControlList({
  offices,
  busyOfficeId,
  onOfficeMode,
  onExploreToggle,
}: {
  offices: OfficeState[];
  busyOfficeId: string | null;
  onOfficeMode: (officeId: string, safeMode: RecommenderSafeMode) => void;
  onExploreToggle: (officeId: string, enabled: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      {offices.map((office) => (
        <OfficeControlCard
          key={office.id}
          office={office}
          busyOfficeId={busyOfficeId}
          onOfficeMode={onOfficeMode}
          onExploreToggle={onExploreToggle}
        />
      ))}
    </div>
  );
}

function OfficeControlCard({
  office,
  busyOfficeId,
  onOfficeMode,
  onExploreToggle,
}: {
  office: OfficeState;
  busyOfficeId: string | null;
  onOfficeMode: (officeId: string, safeMode: RecommenderSafeMode) => void;
  onExploreToggle: (officeId: string, enabled: boolean) => void;
}) {
  const canToggle = busyOfficeId !== office.id;
  const isLearned = office.safeMode === 'learned';

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-fg">{office.name}</p>
            {!office.isActive ? <StatusBadge label="inactive" tone="warning" /> : null}
            <StatusBadge label={isLearned ? 'learned' : 'baseline'} tone={isLearned ? 'success' : 'neutral'} />
            <StatusBadge label={office.exploreEnabled ? 'explore on' : 'explore off'} tone={office.exploreEnabled ? 'success' : 'neutral'} />
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            Latest margin: {formatMargin(office.latestMargin)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={isLearned ? 'ghost' : 'secondary'}
            disabled={!canToggle}
            onClick={() => void onOfficeMode(office.id, 'baseline')}
          >
            Revert to baseline
          </Button>
          <Button
            type="button"
            variant={isLearned ? 'primary' : 'secondary'}
            disabled={!canToggle}
            onClick={() => void onOfficeMode(office.id, 'learned')}
          >
            Enable learned
          </Button>
          <Button
            type="button"
            variant={office.exploreEnabled ? 'success' : 'secondary'}
            disabled={!canToggle}
            onClick={() => void onExploreToggle(office.id, !office.exploreEnabled)}
          >
            {office.exploreEnabled ? 'Disable explore' : 'Enable explore'}
          </Button>
        </div>
      </div>
    </div>
  );
}

type RecommenderAdminPanelController = {
  loadingStatus: boolean;
  status: RecommenderStatusResponse | null;
  statusError: string;
  actionError: string;
  trainResult: RecommenderTrainResponse | null;
  evaluationResult: RecommenderEvaluationResponse | null;
  busyTrain: boolean;
  busyEvaluate: boolean;
  busyOfficeId: string | null;
  onTrain: () => Promise<void>;
  onEvaluate: () => Promise<void>;
  onOfficeMode: (officeId: string, safeMode: RecommenderSafeMode) => Promise<void>;
  onExploreToggle: (officeId: string, enabled: boolean) => Promise<void>;
};

function useRecommenderAdminPanelController(
  officeLocations: OfficeLocationSummary[],
): RecommenderAdminPanelController & { offices: OfficeState[] } {
  const [status, setStatus] = useState<RecommenderStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [actionError, setActionError] = useState('');
  const [trainResult, setTrainResult] = useState<RecommenderTrainResponse | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<RecommenderEvaluationResponse | null>(null);
  const [busyTrain, setBusyTrain] = useState(false);
  const [busyEvaluate, setBusyEvaluate] = useState(false);
  const [busyOfficeId, setBusyOfficeId] = useState<string | null>(null);

  const offices = useMemo(() => mergeOfficeStatus(officeLocations, status), [officeLocations, status]);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError('');
    try {
      const payload = await api.fetchRecommenderStatus();
      setStatus(payload);
    } catch (error) {
      setStatus(null);
      setStatusError(error instanceof Error ? error.message : 'Failed to load recommender status');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const onTrain = useCallback(async () => {
    setBusyTrain(true);
    setActionError('');
    try {
      const result = await api.trainRecommenderModel();
      setTrainResult(result);
      await loadStatus();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Training failed');
    } finally {
      setBusyTrain(false);
    }
  }, [loadStatus]);

  const onEvaluate = useCallback(async () => {
    setBusyEvaluate(true);
    setActionError('');
    try {
      const result = await api.evaluateRecommenderModel();
      setEvaluationResult(result);
      await loadStatus();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Evaluation failed');
    } finally {
      setBusyEvaluate(false);
    }
  }, [loadStatus]);

  const onOfficeMode = useCallback(
    async (officeId: string, safeMode: RecommenderSafeMode) => {
      setBusyOfficeId(officeId);
      setActionError('');
      try {
        await api.updateRecommenderOfficeMode(officeId, safeMode);
        await loadStatus();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'Office mode update failed');
      } finally {
        setBusyOfficeId(null);
      }
    },
    [loadStatus],
  );

  const onExploreToggle = useCallback(
    async (officeId: string, enabled: boolean) => {
      setBusyOfficeId(officeId);
      setActionError('');
      try {
        await api.updateRecommenderOfficeExploreEnabled(officeId, enabled);
        await loadStatus();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'Explore toggle failed');
      } finally {
        setBusyOfficeId(null);
      }
    },
    [loadStatus],
  );

  return {
    offices,
    loadingStatus,
    status,
    statusError,
    actionError,
    trainResult,
    evaluationResult,
    busyTrain,
    busyEvaluate,
    busyOfficeId,
    onTrain,
    onEvaluate,
    onOfficeMode,
    onExploreToggle,
  };
}

function RecommenderAdminPanelContent({
  officeLocations,
  controller,
}: {
  officeLocations: OfficeLocationSummary[];
  controller: RecommenderAdminPanelController & { offices: OfficeState[] };
}) {
  const {
    offices,
    loadingStatus,
    status,
    statusError,
    actionError,
    trainResult,
    evaluationResult,
    busyTrain,
    busyEvaluate,
    busyOfficeId,
    onTrain,
    onEvaluate,
    onOfficeMode,
    onExploreToggle,
  } = controller;

  return (
    <Section
      title="Learned Recommender"
      description="Train the model, review offline lift, and only flip an office to learned mode after it beats baseline."
      className="mt-6"
    >
      <div className="space-y-4 rounded-xl border border-border bg-surface-muted p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-fg">Rollout control</p>
            <p className="mt-1 text-sm text-fg-muted">
              Learned mode stays gated by the latest office margin result. Explore remains opt-in per office.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void onTrain()} disabled={busyTrain || loadingStatus}>
              {busyTrain ? 'Training...' : 'Train model'}
            </Button>
            <Button type="button" variant="primary" onClick={() => void onEvaluate()} disabled={busyEvaluate || loadingStatus}>
              {busyEvaluate ? 'Evaluating...' : 'Run evaluation'}
            </Button>
          </div>
        </div>

        <StatusNoticeStack statusError={statusError} actionError={actionError} />
        <SummaryGrid
          statusValue={getStatusSummary(loadingStatus, status)}
          trainingValue={getTrainingSummary(trainResult)}
          evaluationValue={getEvaluationSummary(evaluationResult)}
          officeCount={officeLocations.length}
        />
        <MaybeEvaluationResults result={evaluationResult} />
        <MaybeTrainingBanner trainResult={trainResult} />
        <OfficeControlList
          offices={offices}
          busyOfficeId={busyOfficeId}
          onOfficeMode={onOfficeMode}
          onExploreToggle={onExploreToggle}
        />
      </div>
    </Section>
  );
}

export default function RecommenderAdminPanel({ officeLocations }: RecommenderAdminPanelProps) {
  const controller = useRecommenderAdminPanelController(officeLocations);
  return <RecommenderAdminPanelContent officeLocations={officeLocations} controller={controller} />;
}
