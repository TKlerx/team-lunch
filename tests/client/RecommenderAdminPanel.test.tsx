import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import RecommenderAdminPanel from '../../src/client/components/RecommenderAdminPanel.js';
import { setupUser } from './helpers.js';

const mockFetchRecommenderStatus = vi.fn();
const mockTrainRecommenderModel = vi.fn();
const mockEvaluateRecommenderModel = vi.fn();
const mockUpdateRecommenderOfficeMode = vi.fn();
const mockUpdateRecommenderOfficeExploreEnabled = vi.fn();

vi.mock('../../src/client/api.js', () => ({
  fetchRecommenderStatus: (...args: unknown[]) => mockFetchRecommenderStatus(...args),
  trainRecommenderModel: (...args: unknown[]) => mockTrainRecommenderModel(...args),
  evaluateRecommenderModel: (...args: unknown[]) => mockEvaluateRecommenderModel(...args),
  updateRecommenderOfficeMode: (...args: unknown[]) => mockUpdateRecommenderOfficeMode(...args),
  updateRecommenderOfficeExploreEnabled: (...args: unknown[]) =>
    mockUpdateRecommenderOfficeExploreEnabled(...args),
}));

function makeOffice(id: string, name: string, isActive = true) {
  return { id, name, isActive };
}

describe('RecommenderAdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchRecommenderStatus.mockResolvedValue({
      activeModelVersion: null,
      offices: [],
    });
    mockTrainRecommenderModel.mockResolvedValue({
      modelVersion: 8,
      trainingSampleCount: 24,
    });
    mockEvaluateRecommenderModel.mockResolvedValue({
      results: [],
    });
    mockUpdateRecommenderOfficeMode.mockResolvedValue({
      officeLocationId: 'office-1',
      safeMode: 'baseline',
      activeModelVersion: null,
    });
    mockUpdateRecommenderOfficeExploreEnabled.mockResolvedValue({
      officeLocationId: 'office-1',
      exploreEnabled: true,
    });
  });

  it('loads status and can train, evaluate, and toggle office controls', async () => {
    const user = setupUser();
    mockFetchRecommenderStatus.mockResolvedValue({
      activeModelVersion: 7,
      offices: [
        {
          officeLocationId: 'office-1',
          safeMode: 'baseline',
          exploreEnabled: true,
          latestMargin: 11,
        },
        {
          officeLocationId: 'office-2',
          safeMode: 'learned',
          exploreEnabled: false,
          latestMargin: 4.99,
        },
      ],
    });
    mockEvaluateRecommenderModel.mockResolvedValueOnce({
      results: [
        {
          officeLocationId: 'office-1',
          baselineTop3HitRate: 0.25,
          modelTop3HitRate: 0.5,
          marginPoints: 25,
          sampleCount: 4,
        },
      ],
    });

    render(
      <RecommenderAdminPanel
        officeLocations={[
          makeOffice('office-1', 'Berlin'),
          makeOffice('office-2', 'Munich'),
        ]}
      />,
    );

    expect(await screen.findByText('Berlin')).toBeInTheDocument();
    expect(screen.getAllByText(/^baseline$/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/^learned$/)).toBeInTheDocument();
    expect(screen.getByText(/^explore off$/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /train model/i }));
    await waitFor(() => {
      expect(mockTrainRecommenderModel).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/trained model v8 from 24 training sample/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /run evaluation/i }));
    await waitFor(() => {
      expect(mockEvaluateRecommenderModel).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/baseline 25\.0%/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /enable learned/i })[0]);
    await waitFor(() => {
      expect(mockUpdateRecommenderOfficeMode).toHaveBeenCalledWith('office-1', 'learned');
    });

    await user.click(screen.getByRole('button', { name: /enable explore/i }));
    await waitFor(() => {
      expect(mockUpdateRecommenderOfficeExploreEnabled).toHaveBeenCalledWith('office-2', true);
    });
  });

  it('blocks learned mode when the margin stays below the gate', async () => {
    const user = setupUser();
    mockFetchRecommenderStatus.mockResolvedValueOnce({
      activeModelVersion: 7,
      offices: [
        {
          officeLocationId: 'office-1',
          safeMode: 'baseline',
          exploreEnabled: true,
          latestMargin: 4.99,
        },
      ],
    });
    mockUpdateRecommenderOfficeMode.mockRejectedValueOnce(new Error('Model does not beat baseline for this office'));

    render(<RecommenderAdminPanel officeLocations={[makeOffice('office-1', 'Berlin')]} />);

    expect(await screen.findByText(/^baseline$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /enable learned/i }));

    expect(await screen.findByText(/model does not beat baseline for this office/i)).toBeInTheDocument();
    expect(mockUpdateRecommenderOfficeMode).toHaveBeenCalledWith('office-1', 'learned');
  });

  it('reverts an office back to baseline immediately', async () => {
    const user = setupUser();
    mockFetchRecommenderStatus
      .mockResolvedValueOnce({
        activeModelVersion: 7,
        offices: [
          {
            officeLocationId: 'office-1',
            safeMode: 'learned',
            exploreEnabled: true,
            latestMargin: 11,
          },
        ],
      })
      .mockResolvedValueOnce({
        activeModelVersion: 7,
        offices: [
          {
            officeLocationId: 'office-1',
            safeMode: 'baseline',
            exploreEnabled: true,
            latestMargin: 11,
          },
        ],
      });
    mockUpdateRecommenderOfficeMode.mockResolvedValueOnce({
      officeLocationId: 'office-1',
      safeMode: 'baseline',
      activeModelVersion: null,
    });

    render(<RecommenderAdminPanel officeLocations={[makeOffice('office-1', 'Berlin')]} />);

    expect(await screen.findByText(/^learned$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /revert to baseline/i }));

    await waitFor(() => {
      expect(mockUpdateRecommenderOfficeMode).toHaveBeenCalledWith('office-1', 'baseline');
    });
    expect(await screen.findByText(/^baseline$/)).toBeInTheDocument();
  });
});
