import prisma from '../db.js';
import { serviceError } from '../routes/routeUtils.js';
import type {
  OfficeLocation,
  OfficeWeekday,
  UpdateOfficeLocationSettingsRequest,
} from '../../lib/types.js';

const DEFAULT_OFFICE_KEY = 'default';
const DEFAULT_OFFICE_NAME = 'Default Office';
const OFFICE_WEEKDAYS: OfficeWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function formatOfficeLocation(location: {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  autoStartPollEnabled: boolean;
  autoStartPollWeekdays: unknown;
  autoStartPollFinishTime: string | null;
  defaultFoodSelectionDurationMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}): OfficeLocation {
  return {
    id: location.id,
    key: location.key,
    name: location.name,
    isActive: location.isActive,
    autoStartPollEnabled: location.autoStartPollEnabled,
    autoStartPollWeekdays: normalizeStoredWeekdays(location.autoStartPollWeekdays),
    autoStartPollFinishTime: location.autoStartPollFinishTime,
    defaultFoodSelectionDurationMinutes: location.defaultFoodSelectionDurationMinutes,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  };
}

function normalizeStoredWeekdays(value: unknown): OfficeWeekday[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value.filter((entry): entry is OfficeWeekday =>
    typeof entry === 'string' && OFFICE_WEEKDAYS.includes(entry as OfficeWeekday),
  );

  return [...new Set(normalized)];
}

function normalizeOfficeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function normalizeOfficeLocationId(officeLocationId: string): string {
  const trimmedId = officeLocationId.trim();
  if (!trimmedId) {
    throw serviceError('Office location is required', 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(trimmedId)) {
    throw serviceError('Office location not found', 404);
  }

  return trimmedId;
}

function slugifyOfficeKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateAutoStartWeekdays(weekdays: unknown): OfficeWeekday[] {
  if (!Array.isArray(weekdays)) {
    throw serviceError('Auto-start weekdays must be an array', 400);
  }

  const normalized = weekdays.map((weekday) => {
    if (typeof weekday !== 'string') {
      throw serviceError('Auto-start weekdays must be valid weekdays', 400);
    }
    return weekday.trim().toLowerCase() as OfficeWeekday;
  });

  if (normalized.some((weekday) => !OFFICE_WEEKDAYS.includes(weekday))) {
    throw serviceError('Auto-start weekdays must be valid weekdays', 400);
  }

  return [...new Set(normalized)];
}

function validateAutoStartFinishTime(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw serviceError('Auto-start finish time must be HH:MM', 400);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    throw serviceError('Auto-start finish time must be HH:MM', 400);
  }

  const [hoursText, minutesText] = trimmed.split(':');
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw serviceError('Auto-start finish time must be HH:MM', 400);
  }

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function validateDefaultFoodSelectionDuration(value: unknown): number {
  if (!Number.isInteger(value)) {
    throw serviceError('Default food selection duration must be 1 minute or a multiple of 5 between 5 and 30 minutes', 400);
  }

  const minutes = value as number;
  const valid = minutes === 1 || (minutes >= 5 && minutes <= 30 && minutes % 5 === 0);
  if (!valid) {
    throw serviceError('Default food selection duration must be 1 minute or a multiple of 5 between 5 and 30 minutes', 400);
  }

  return minutes;
}

async function ensureOfficeNameAvailable(name: string, excludeId?: string): Promise<void> {
  const existing = await prisma.officeLocation.findMany({
    select: { id: true, name: true },
  });

  const normalized = name.toLowerCase();
  if (
    existing.some(
      (location: { id: string; name: string }) =>
        location.id !== excludeId && location.name.trim().toLowerCase() === normalized,
    )
  ) {
    throw serviceError('Office location name already exists', 409);
  }
}

async function buildUniqueOfficeKey(baseKey: string): Promise<string> {
  if (!baseKey) {
    throw serviceError('Office location key could not be generated', 400);
  }

  const existing = await prisma.officeLocation.findMany({
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((location: { key: string }) => location.key));

  if (!existingKeys.has(baseKey)) {
    return baseKey;
  }

  let suffix = 2;
  while (existingKeys.has(`${baseKey}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseKey}-${suffix}`;
}

export async function ensureDefaultOfficeLocation(): Promise<OfficeLocation> {
  const location = await prisma.officeLocation.upsert({
    where: { key: DEFAULT_OFFICE_KEY },
    create: {
      key: DEFAULT_OFFICE_KEY,
      name: DEFAULT_OFFICE_NAME,
      isActive: true,
    },
    update: {
      isActive: true,
    },
  });

  return formatOfficeLocation(location);
}

export async function listOfficeLocations(): Promise<OfficeLocation[]> {
  await ensureDefaultOfficeLocation();

  const locations = await prisma.officeLocation.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  return locations.map(formatOfficeLocation);
}

export async function createOfficeLocation(name: string): Promise<OfficeLocation> {
  const normalizedName = normalizeOfficeName(name);
  if (!normalizedName) {
    throw serviceError('Office location name is required', 400);
  }

  await ensureOfficeNameAvailable(normalizedName);
  const key = await buildUniqueOfficeKey(slugifyOfficeKey(normalizedName));

  const location = await prisma.officeLocation.create({
    data: {
      key,
      name: normalizedName,
      isActive: true,
      autoStartPollEnabled: false,
      autoStartPollWeekdays: [],
      autoStartPollFinishTime: null,
      defaultFoodSelectionDurationMinutes: 30,
    },
  });

  return formatOfficeLocation(location);
}

export async function renameOfficeLocation(officeLocationId: string, name: string): Promise<OfficeLocation> {
  const location = await validateOfficeLocationId(officeLocationId);
  const normalizedName = normalizeOfficeName(name);
  if (!normalizedName) {
    throw serviceError('Office location name is required', 400);
  }

  await ensureOfficeNameAvailable(normalizedName, location.id);

  const updated = await prisma.officeLocation.update({
    where: { id: location.id },
    data: {
      name: normalizedName,
      updatedAt: new Date(),
    },
  });

  return formatOfficeLocation(updated);
}

export async function deactivateOfficeLocation(officeLocationId: string): Promise<OfficeLocation> {
  const normalizedOfficeLocationId = normalizeOfficeLocationId(officeLocationId);
  const location = await prisma.officeLocation.findUnique({
    where: { id: normalizedOfficeLocationId },
  });
  if (!location) {
    throw serviceError('Office location not found', 404);
  }
  if (!location.isActive) {
    return formatOfficeLocation(location);
  }
  if (location.key === DEFAULT_OFFICE_KEY) {
    throw serviceError('Default office location cannot be deactivated', 409);
  }

  const assignedUsers = await prisma.authAccessUser.count({
    where: {
      officeLocationId: location.id,
    },
  });
  if (assignedUsers > 0) {
    throw serviceError('Office location still has assigned users', 409);
  }

  const updated = await prisma.officeLocation.update({
    where: { id: location.id },
    data: {
      isActive: false,
      updatedAt: new Date(),
    },
  });

  return formatOfficeLocation(updated);
}

export async function validateOfficeLocationId(officeLocationId: string): Promise<OfficeLocation> {
  const trimmedId = normalizeOfficeLocationId(officeLocationId);

  const location = await prisma.officeLocation.findUnique({
    where: { id: trimmedId },
  });
  if (!location || !location.isActive) {
    throw serviceError('Office location not found', 404);
  }

  return formatOfficeLocation(location);
}

export async function updateOfficeLocationSettings(
  officeLocationId: string,
  settings: UpdateOfficeLocationSettingsRequest,
): Promise<OfficeLocation> {
  const location = await validateOfficeLocationId(officeLocationId);
  const autoStartPollEnabled = settings.autoStartPollEnabled === true;
  const autoStartPollWeekdays = validateAutoStartWeekdays(settings.autoStartPollWeekdays);
  const autoStartPollFinishTime = validateAutoStartFinishTime(settings.autoStartPollFinishTime);
  const defaultFoodSelectionDurationMinutes = validateDefaultFoodSelectionDuration(
    settings.defaultFoodSelectionDurationMinutes,
  );

  if (autoStartPollEnabled && autoStartPollWeekdays.length === 0) {
    throw serviceError('Select at least one weekday for auto-started polls', 400);
  }
  if (autoStartPollEnabled && !autoStartPollFinishTime) {
    throw serviceError('Auto-start finish time is required when automatic polls are enabled', 400);
  }

  const updated = await prisma.officeLocation.update({
    where: { id: location.id },
    data: {
      autoStartPollEnabled,
      autoStartPollWeekdays,
      autoStartPollFinishTime,
      defaultFoodSelectionDurationMinutes,
      updatedAt: new Date(),
    },
  });

  return formatOfficeLocation(updated);
}

export async function getOfficeDefaultFoodSelectionDurationMinutes(
  officeLocationId: string,
): Promise<number> {
  const location = await validateOfficeLocationId(officeLocationId);
  return location.defaultFoodSelectionDurationMinutes;
}
