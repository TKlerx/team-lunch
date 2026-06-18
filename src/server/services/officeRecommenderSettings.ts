import prisma from '../db.js';
import { serviceError } from '../routes/routeUtils.js';
import type {
  RecommenderOfficeExploreResponse,
  RecommenderOfficeModeResponse,
  RecommenderSafeMode,
  RecommenderStatusOffice,
  RecommenderStatusResponse,
} from '../../lib/types.js';
import { loadLatestMealRecommendationModel, loadMealRecommendationModelByVersion } from './mealRecommendationModel.js';

export interface OfficeRecommenderSettingsView {
  officeLocationId: string;
  safeMode: RecommenderSafeMode;
  activeModelId: string | null;
  activeModelVersion: number | null;
  exploreEnabled: boolean;
  updatedAt: string;
}

function toView(row: {
  officeLocationId: string;
  safeMode: string;
  activeModelId: string | null;
  exploreEnabled: boolean;
  updatedAt: Date;
  activeModel: { version: number } | null;
}): OfficeRecommenderSettingsView {
  return {
    officeLocationId: row.officeLocationId,
    safeMode: row.safeMode as RecommenderSafeMode,
    activeModelId: row.activeModelId,
    activeModelVersion: row.activeModel?.version ?? null,
    exploreEnabled: row.exploreEnabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getOrCreateSetting(officeLocationId: string) {
  return prisma.officeRecommenderSetting.upsert({
    where: { officeLocationId },
    create: { officeLocationId, safeMode: 'baseline', exploreEnabled: true },
    update: {},
    include: { activeModel: { select: { version: true } } },
  });
}

async function assertModelHasNotFailedBaseline(officeLocationId: string, modelId: string): Promise<void> {
  const latestResult = await prisma.modelEvaluationResult.findFirst({
    where: { officeLocationId, recommenderModelId: modelId },
    orderBy: { evaluatedAt: 'desc' },
  });

  if (!latestResult) {
    return;
  }

  const margin = Number(latestResult.marginPoints);
  if (!Number.isFinite(margin) || margin < 5) {
    throw serviceError('Model does not beat baseline for this office', 409);
  }
}

export async function getOfficeRecommenderSettings(
  officeLocationId: string,
): Promise<OfficeRecommenderSettingsView> {
  const setting = await getOrCreateSetting(officeLocationId);
  return toView(setting);
}

export async function setOfficeRecommenderSafeMode(
  officeLocationId: string,
  safeMode: RecommenderSafeMode,
  modelVersion?: number | null,
): Promise<RecommenderOfficeModeResponse> {
  const current = await getOrCreateSetting(officeLocationId);

  if (safeMode === 'baseline') {
    const updated = await prisma.officeRecommenderSetting.update({
      where: { officeLocationId },
      data: {
        safeMode: 'baseline',
        activeModelId: null,
      },
      include: { activeModel: { select: { version: true } } },
    });

    return {
      officeLocationId,
      safeMode: updated.safeMode as RecommenderSafeMode,
      activeModelVersion: updated.activeModel?.version ?? null,
    };
  }

  const candidateVersion =
    modelVersion ??
    current.activeModel?.version ??
    (await loadLatestMealRecommendationModel())?.version ??
    null;

  if (candidateVersion === null) {
    throw serviceError('No trained model is available', 404);
  }

  const loaded = await loadMealRecommendationModelByVersion(candidateVersion);
  if (!loaded) {
    throw serviceError('Model not found', 404);
  }

  await assertModelHasNotFailedBaseline(officeLocationId, loaded.id ? loaded.id : String(candidateVersion));

  const updated = await prisma.officeRecommenderSetting.update({
    where: { officeLocationId },
    data: {
      safeMode: 'learned',
      activeModelId: loaded.id,
    },
    include: { activeModel: { select: { version: true } } },
  });

  return {
    officeLocationId,
    safeMode: updated.safeMode as RecommenderSafeMode,
    activeModelVersion: updated.activeModel?.version ?? null,
  };
}

export async function setOfficeRecommenderExploreEnabled(
  officeLocationId: string,
  enabled: boolean,
): Promise<RecommenderOfficeExploreResponse> {
  await getOrCreateSetting(officeLocationId);

  const updated = await prisma.officeRecommenderSetting.update({
    where: { officeLocationId },
    data: { exploreEnabled: enabled },
  });

  return {
    officeLocationId,
    exploreEnabled: updated.exploreEnabled,
  };
}

export async function getRecommenderAdminStatus(): Promise<RecommenderStatusResponse> {
  const activeModel = await prisma.officeRecommenderSetting.findFirst({
    where: { safeMode: 'learned', activeModelId: { not: null } },
    orderBy: { updatedAt: 'desc' },
    include: { activeModel: { select: { version: true } } },
  });

  const offices = await prisma.officeRecommenderSetting.findMany({
    orderBy: { officeLocationId: 'asc' },
    include: {
      activeModel: { select: { version: true } },
      officeLocation: { select: { id: true } },
    },
  });

  const latestMargins = await prisma.modelEvaluationResult.findMany({
    orderBy: { evaluatedAt: 'desc' },
  });

  const marginByOffice = new Map<string, number | null>();
  for (const result of latestMargins) {
    if (marginByOffice.has(result.officeLocationId)) {
      continue;
    }
    marginByOffice.set(result.officeLocationId, Number(result.marginPoints));
  }

  return {
    activeModelVersion: activeModel?.activeModel?.version ?? null,
    offices: offices.map<RecommenderStatusOffice>((office) => ({
      officeLocationId: office.officeLocationId,
      safeMode: office.safeMode as RecommenderSafeMode,
      exploreEnabled: office.exploreEnabled,
      latestMargin: marginByOffice.get(office.officeLocationId) ?? null,
    })),
  };
}
