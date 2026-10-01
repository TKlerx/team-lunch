import { readFileSync } from 'node:fs';
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
