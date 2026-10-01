import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../../src/server/db.js';
import {
  createOfficeLocation,
  deactivateOfficeLocation,
  ensureDefaultOfficeLocation,
  listOfficeLocations,
  renameOfficeLocation,
  validateOfficeLocationId,
  updateOfficeLocationSettings,
} from '../../src/server/services/officeLocation.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import type { UpdateOfficeLocationSettingsRequest, OrderingIntervalWeeks } from '../../src/lib/types.js';

const settingsPayload: UpdateOfficeLocationSettingsRequest = {
  autoStartPollEnabled: false,
  autoStartPollWeekdays: [],
  autoStartPollFinishTime: null,
  defaultFoodSelectionDurationMinutes: 20,
};

const invalidPolicyFields = [
  ...[-1, 5, 1.5, '1', null, true, [], {}].map((orderingIntervalWeeks) => ({ orderingIntervalWeeks })),
  ...['', 'Not/AZone', '+01:00', ' Europe/Vienna ', null, 12, {}, []].map((timeZone) => ({ timeZone })),
  ...['2026-02-30', '2026-10-01', '2026-9-07', '2026-09-07T00:00:00Z', '0000-01-03', '', null, 12, {}, []]
    .map((orderingAnchorDate) => ({ orderingAnchorDate })),
];

describe('office ordering settings validation', () => {
  beforeEach(cleanDatabase);
  afterAll(disconnectDatabase);

  it.each<OrderingIntervalWeeks>([0, 1, 2, 3, 4])('saves exact interval %i and accepts future Mondays', async (orderingIntervalWeeks) => {
    const office = await createOfficeLocation('Policy Office');
    const updated = await updateOfficeLocationSettings(office.id, {
      ...settingsPayload, orderingIntervalWeeks, timeZone: 'Europe/Vienna', orderingAnchorDate: '2099-01-05',
    });
    expect(updated).toMatchObject({
      orderingIntervalWeeks, timeZone: 'Europe/Vienna',
      orderingAnchorDate: orderingIntervalWeeks === 0 ? office.orderingAnchorDate : '2099-01-05',
    });
  });

  it.each(invalidPolicyFields)('rejects invalid policy field %j without changing any settings', async (field) => {
    const office = await createOfficeLocation('Policy Office');
    const before = await prisma.officeLocation.findUniqueOrThrow({ where: { id: office.id } });
    await expect(updateOfficeLocationSettings(office.id, {
      ...settingsPayload, ...field,
    } as UpdateOfficeLocationSettingsRequest)).rejects.toMatchObject({ statusCode: 400 });
    expect(await prisma.officeLocation.findUniqueOrThrow({ where: { id: office.id } })).toEqual(before);
  });

  it('retains policy values for older clients and individually omitted fields', async () => {
    const office = await createOfficeLocation('Policy Office');
    const policy = { orderingIntervalWeeks: 3 as const, timeZone: 'Europe/Vienna', orderingAnchorDate: '2099-01-05' };
    await updateOfficeLocationSettings(office.id, { ...settingsPayload, ...policy });
    expect(await updateOfficeLocationSettings(office.id, settingsPayload)).toMatchObject(policy);
    expect(await updateOfficeLocationSettings(office.id, { ...settingsPayload, orderingIntervalWeeks: 4 }))
      .toMatchObject({ ...policy, orderingIntervalWeeks: 4 });
  });

  it.each(['2099-01-12', 'not a date', null, 12, {}])('ignores disabled anchor edits %j and re-enables with the retained Monday', async (orderingAnchorDate) => {
    const office = await createOfficeLocation('Policy Office');
    await updateOfficeLocationSettings(office.id, { ...settingsPayload, orderingAnchorDate: '2099-01-05' });
    expect(await updateOfficeLocationSettings(office.id, {
      ...settingsPayload, orderingIntervalWeeks: 0, timeZone: 'Pacific/Honolulu', orderingAnchorDate,
    } as UpdateOfficeLocationSettingsRequest)).toMatchObject({ orderingIntervalWeeks: 0, orderingAnchorDate: '2099-01-05' });
    expect(await updateOfficeLocationSettings(office.id, { ...settingsPayload, orderingIntervalWeeks: 2 }))
      .toMatchObject({ orderingIntervalWeeks: 2, orderingAnchorDate: '2099-01-05', timeZone: 'Pacific/Honolulu' });
  });

  it('validates timezone while unrestricted and submitted anchor when re-enabling', async () => {
    const office = await createOfficeLocation('Policy Office');
    await updateOfficeLocationSettings(office.id, { ...settingsPayload, orderingIntervalWeeks: 0 });
    const before = await prisma.officeLocation.findUniqueOrThrow({ where: { id: office.id } });
    await expect(updateOfficeLocationSettings(office.id, { ...settingsPayload, timeZone: 'Not/AZone' }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(updateOfficeLocationSettings(office.id, {
      ...settingsPayload, orderingIntervalWeeks: 1, orderingAnchorDate: '2099-01-06',
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(await prisma.officeLocation.findUniqueOrThrow({ where: { id: office.id } })).toEqual(before);
  });
});

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

  it('initializes new and default offices to weekly UTC with their creation-week Monday', async () => {
    const offices = [await createOfficeLocation('Weekly Office'), await ensureDefaultOfficeLocation()];
    for (const office of offices) {
      const stored = await prisma.officeLocation.findUniqueOrThrow({ where: { id: office.id } });
      const monday = new Date(stored.createdAt);
      monday.setUTCHours(0, 0, 0, 0);
      monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
      expect(stored.orderingIntervalWeeks).toBe(1);
      expect(stored.timeZone).toBe('UTC');
      expect(stored.orderingAnchorDate).toEqual(monday);
      expect(office).toMatchObject({
        orderingIntervalWeeks: 1,
        timeZone: 'UTC',
        orderingAnchorDate: monday.toISOString().slice(0, 10),
      });
    }
  });

  it('preserves editable policy settings when ensuring an existing default office', async () => {
    const office = await ensureDefaultOfficeLocation();
    const settings = {
      orderingIntervalWeeks: 3,
      timeZone: 'Europe/Vienna',
      orderingAnchorDate: new Date('2026-09-07T00:00:00Z'),
    };
    await prisma.officeLocation.update({ where: { id: office.id }, data: settings });
    await ensureDefaultOfficeLocation();
    expect(await prisma.officeLocation.findUniqueOrThrow({ where: { id: office.id } }))
      .toMatchObject(settings);
  });

  it.each<OrderingIntervalWeeks>([0, 1, 2, 3, 4])('serializes stored %i-week policy settings as calendar dates on reads and updates', async (orderingIntervalWeeks) => {
    const office = await ensureDefaultOfficeLocation();
    const settings = {
      orderingIntervalWeeks,
      timeZone: 'Pacific/Honolulu',
      orderingAnchorDate: '2026-09-07',
    };
    await prisma.officeLocation.update({
      where: { id: office.id },
      data: { ...settings, orderingAnchorDate: new Date('2026-09-07T00:00:00Z') },
    });
    expect(await ensureDefaultOfficeLocation()).toMatchObject(settings);
    expect(await validateOfficeLocationId(office.id)).toMatchObject(settings);
    expect((await listOfficeLocations()).find((entry) => entry.id === office.id)).toMatchObject(settings);
    expect(await renameOfficeLocation(office.id, 'Renamed Office')).toMatchObject(settings);
    expect(await updateOfficeLocationSettings(office.id, {
      autoStartPollEnabled: false,
      autoStartPollWeekdays: [],
      autoStartPollFinishTime: null,
      defaultFoodSelectionDurationMinutes: 20,
    })).toMatchObject(settings);
  });

  it('serializes retained policy settings after office deactivation', async () => {
    const office = await createOfficeLocation('Retired Office');
    const settings = {
      orderingIntervalWeeks: 2,
      timeZone: 'Europe/Vienna',
      orderingAnchorDate: '2026-09-07',
    };
    await prisma.officeLocation.update({
      where: { id: office.id },
      data: { ...settings, orderingAnchorDate: new Date('2026-09-07T00:00:00Z') },
    });
    expect(await deactivateOfficeLocation(office.id)).toMatchObject({ ...settings, isActive: false });
  });

  it('backfills pre-existing rows and supplies dynamic defaults for direct inserts', async () => {
    const migration = readFileSync(new URL(
      '../../prisma/migrations/20261001120000_add_ordering_interval_policy/migration.sql',
      import.meta.url,
    ), 'utf8');
    expect(migration).not.toContain('\r');
    expect(migration.charCodeAt(0)).not.toBe(0xfeff);
    const officeAlter = migration.slice(migration.indexOf('ALTER TABLE')).split(';')[0]
      .replace('"office_locations"', '"policy_migration_offices"');
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE policy_migration_offices (name TEXT) ON COMMIT DROP');
      await tx.$executeRawUnsafe("INSERT INTO policy_migration_offices (name) VALUES ('Existing')");
      await tx.$executeRawUnsafe(officeAlter);
      await tx.$executeRawUnsafe("INSERT INTO policy_migration_offices (name) VALUES ('New')");
      const rows = await tx.$queryRaw<Array<{
        name: string; ordering_interval_weeks: number; time_zone: string; valid_anchor: boolean;
      }>>`
        SELECT name, ordering_interval_weeks, time_zone,
          ordering_anchor_date = date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS valid_anchor
        FROM policy_migration_offices ORDER BY name
      `;
      expect(rows).toEqual(['Existing', 'New'].map((name) => ({
        name, ordering_interval_weeks: 1, time_zone: 'UTC', valid_anchor: true,
      })));
    });
  });

  it('keeps direct office creation compatible and rejects invalid interval and weekday in the database', async () => {
    const office = await prisma.officeLocation.create({ data: { key: 'direct', name: 'Direct' } });
    expect(office.orderingIntervalWeeks).toBe(1);
    expect(office.timeZone).toBe('UTC');
    expect(office.orderingAnchorDate.getUTCDay()).toBe(1);
    await expect(prisma.officeLocation.update({
      where: { id: office.id }, data: { orderingIntervalWeeks: 5 },
    })).rejects.toThrow();
    await expect(prisma.officeLocation.update({
      where: { id: office.id }, data: { orderingAnchorDate: new Date('2026-10-01T00:00:00Z') },
    })).rejects.toThrow();
  });

  it('deploys nullable exception storage and the completion lookup index', async () => {
    const schema = new URL(process.env.TEST_DATABASE_URL_EFFECTIVE!).searchParams.get('schema');
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = ${schema} AND tablename = 'food_selections'
        AND indexname = 'food_selections_office_location_id_status_completed_at_idx'
    `;
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toContain('(office_location_id, status, completed_at)');
    const columns = await prisma.$queryRaw<Array<{ is_nullable: string; data_type: string }>>`
      SELECT is_nullable, data_type FROM information_schema.columns
      WHERE table_schema = ${schema} AND table_name = 'polls'
        AND column_name = 'ordering_policy_exception'
    `;
    expect(columns).toEqual([{ is_nullable: 'YES', data_type: 'jsonb' }]);
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
