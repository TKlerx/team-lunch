import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../../src/server/db.js';
import {
  createOfficeLocation,
  deactivateOfficeLocation,
  ensureDefaultOfficeLocation,
  renameOfficeLocation,
  updateOfficeLocationSettings,
} from '../../src/server/services/officeLocation.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';

describe('office location service', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('creates an office location with an auto-generated unique key', async () => {
    const created = await createOfficeLocation('Berlin Mitte');
    const second = await createOfficeLocation('Berlin-Mitte');

    expect(created.name).toBe('Berlin Mitte');
    expect(created.key).toBe('berlin-mitte');
    expect(second.key).toBe('berlin-mitte-2');
  });

  it('renames an office location without changing its key', async () => {
    const created = await createOfficeLocation('Munich');

    const renamed = await renameOfficeLocation(created.id, 'Munich East');

    expect(renamed.name).toBe('Munich East');
    expect(renamed.key).toBe('munich');
  });

  it('rejects deactivating the default office location', async () => {
    const defaultOffice = await ensureDefaultOfficeLocation();

    await expect(deactivateOfficeLocation(defaultOffice.id)).rejects.toThrow(
      'Default office location cannot be deactivated',
    );
  });

  it('rejects deactivating an office location that still has assigned users', async () => {
    const office = await createOfficeLocation('Zurich');

    await prisma.authAccessUser.create({
      data: {
        email: 'member@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: office.id,
      },
    });

    await expect(deactivateOfficeLocation(office.id)).rejects.toThrow(
      'Office location still has assigned users',
    );
  });

  it('updates office scheduling settings and default food-selection duration', async () => {
    const office = await createOfficeLocation('Berlin');

    const updated = await updateOfficeLocationSettings(office.id, {
      autoStartPollEnabled: true,
      autoStartPollWeekdays: ['monday', 'wednesday', 'friday'],
      autoStartPollFinishTime: '11:30',
      defaultFoodSelectionDurationMinutes: 20,
    });

    expect(updated.autoStartPollEnabled).toBe(true);
    expect(updated.autoStartPollWeekdays).toEqual(['monday', 'wednesday', 'friday']);
    expect(updated.autoStartPollFinishTime).toBe('11:30');
    expect(updated.defaultFoodSelectionDurationMinutes).toBe(20);
  });

  it('rejects enabling automatic polls without weekdays or finish time', async () => {
    const office = await createOfficeLocation('Munich');

    await expect(
      updateOfficeLocationSettings(office.id, {
        autoStartPollEnabled: true,
        autoStartPollWeekdays: [],
        autoStartPollFinishTime: null,
        defaultFoodSelectionDurationMinutes: 15,
      }),
    ).rejects.toThrow('Select at least one weekday for auto-started polls');
  });
});
