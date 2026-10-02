import prisma from '../db.js';
import { parseCalendarDate, validateMondayDate, validateTimeZone } from './officeTime.js';
import { serviceError } from '../routes/routeUtils.js';
import type {
  OfficeLocation,
  OrderingIntervalWeeks,
  OfficeWeekday,
  UpdateOfficeLocationSettingsRequest,
} from '../../lib/types.js';

// Late-bound by SSE, which already depends on this service for hydration.
let onOrderingPolicyChanged: (officeLocationId: string) => void = () => {};
export function setOrderingPolicyChangedHandler(handler: typeof onOrderingPolicyChanged): void {
  onOrderingPolicyChanged = handler;
}

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
  orderingIntervalWeeks: number;
  timeZone: string;
  orderingAnchorDate: Date;
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
    orderingIntervalWeeks: location.orderingIntervalWeeks as OrderingIntervalWeeks,
    timeZone: location.timeZone,
    orderingAnchorDate: location.orderingAnchorDate.toISOString().slice(0, 10),
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

function defaultOrderingPolicy() {
  const monday = new Date();
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return { orderingIntervalWeeks: 1, timeZone: 'UTC', orderingAnchorDate: monday };
}

export async function ensureDefaultOfficeLocation(): Promise<OfficeLocation> {
  const location = await prisma.officeLocation.upsert({
    where: { key: DEFAULT_OFFICE_KEY },
    create: {
      key: DEFAULT_OFFICE_KEY,
      name: DEFAULT_OFFICE_NAME,
      isActive: true,
      ...defaultOrderingPolicy(),
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
      ...defaultOrderingPolicy(),
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

function validateOrderingSettings(location: OfficeLocation, settings: UpdateOfficeLocationSettingsRequest) {
  const orderingIntervalWeeks = settings.orderingIntervalWeeks === undefined
    ? location.orderingIntervalWeeks : settings.orderingIntervalWeeks;
  if (![0, 1, 2, 3, 4].includes(orderingIntervalWeeks)) {
    throw serviceError('Ordering interval must be 0, 1, 2, 3, or 4 weeks', 400);
  }
  const timeZone = settings.timeZone === undefined ? location.timeZone : settings.timeZone;
  const orderingAnchorDate = orderingIntervalWeeks === 0 || settings.orderingAnchorDate === undefined
    ? location.orderingAnchorDate : settings.orderingAnchorDate;
  try {
    validateTimeZone(timeZone);
    if (orderingIntervalWeeks !== 0) validateMondayDate(orderingAnchorDate);
  } catch (err) {
    if (err instanceof RangeError) throw serviceError(err.message, 400);
    throw err;
  }
  return {
    orderingIntervalWeeks,
    timeZone,
    orderingAnchorDate: parseCalendarDate(orderingAnchorDate),
  };
}

export async function updateOfficeLocationSettings(
  officeLocationId: string,
  settings: UpdateOfficeLocationSettingsRequest,
): Promise<OfficeLocation> {
  const location = await validateOfficeLocationId(officeLocationId);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw serviceError('Office settings must be an object', 400);
  }
  const orderingSettings = validateOrderingSettings(location, settings);
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
      ...orderingSettings,
      updatedAt: new Date(),
    },
  });

  if ([
    updated.orderingIntervalWeeks !== location.orderingIntervalWeeks,
    updated.timeZone !== location.timeZone,
    updated.orderingAnchorDate.toISOString().slice(0, 10) !== location.orderingAnchorDate,
  ].some(Boolean)) {
    onOrderingPolicyChanged(location.id);
  }

  return formatOfficeLocation(updated);
}

export async function getOfficeDefaultFoodSelectionDurationMinutes(
  officeLocationId: string,
): Promise<number> {
  const location = await validateOfficeLocationId(officeLocationId);
  return location.defaultFoodSelectionDurationMinutes;
}
