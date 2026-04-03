import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import ExcelJS from 'exceljs';
import { buildApp } from '../../src/server/index.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as menuService from '../../src/server/services/menu.js';
import * as pollService from '../../src/server/services/poll.js';
import * as foodSelectionService from '../../src/server/services/foodSelection.js';
import prisma from '../../src/server/db.js';

async function createCompletedSelectionWithOrder(nickname: string) {
  const menu = await menuService.createMenu('Thai House');
  await menuService.createItem(menu.id, 'Pad Thai', 'Noodles');
  const item = await prisma.menuItem.findFirstOrThrow({ where: { menuId: menu.id } });

  const poll = await pollService.startPoll('Lunch?', 10);
  await pollService.castVote(poll.id, menu.id, nickname);
  const finishedPoll = await pollService.endPoll(poll.id);

  const selection = await foodSelectionService.startFoodSelection(finishedPoll.id, 10);
  const order = await foodSelectionService.placeOrder(selection.id, nickname, item.id, 'No peanuts');

  await foodSelectionService.completeFoodSelectionNow(selection.id);
  await foodSelectionService.placeDeliveryOrder(selection.id, 20, nickname);
  await foodSelectionService.confirmFoodArrival(selection.id);

  return { selectionId: selection.id, orderId: order.id };
}

describe('food order rating and export routes', () => {
  beforeEach(async () => {
    pollService.clearAllTimers();
    foodSelectionService.clearAllTimers();
    await cleanDatabase();
  });

  afterAll(async () => {
    pollService.clearAllTimers();
    foodSelectionService.clearAllTimers();
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('rates an own completed order', async () => {
    const { selectionId, orderId } = await createCompletedSelectionWithOrder('alice@example.com');
    const app = await buildApp();
    await app.ready();

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selectionId}/orders/${orderId}/rating`)
      .send({ nickname: 'alice@example.com', rating: 4, feedbackComment: 'Fast delivery and hot food' })
      .expect(200);

    expect(res.body.rating).toBe(4);
    expect(res.body.feedbackComment).toBe('Fast delivery and hot food');
    expect(typeof res.body.ratedAt).toBe('string');

    await app.close();
  });

  it('rejects rating before selection is completed', async () => {
    const menu = await menuService.createMenu('Italian');
    await menuService.createItem(menu.id, 'Pizza', 'Stone oven');
    const item = await prisma.menuItem.findFirstOrThrow({ where: { menuId: menu.id } });
    const poll = await pollService.startPoll('Lunch?', 10);
    await pollService.castVote(poll.id, menu.id, 'alice@example.com');
    const finishedPoll = await pollService.endPoll(poll.id);
    const selection = await foodSelectionService.startFoodSelection(finishedPoll.id, 10);
    const order = await foodSelectionService.placeOrder(selection.id, 'alice@example.com', item.id);
    const app = await buildApp();
    await app.ready();

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders/${order.id}/rating`)
      .send({ nickname: 'alice@example.com', rating: 3 })
      .expect(400);

    expect(res.body).toEqual({ error: 'Meals can be rated only after delivery confirmation' });

    await app.close();
  });

  it('exports own orders and ratings as xlsx', async () => {
    const { selectionId, orderId } = await createCompletedSelectionWithOrder('alice@example.com');
    await foodSelectionService.rateOrder(selectionId, orderId, 'alice@example.com', 5, 'Would order again');
    const app = await buildApp();
    await app.ready();

    const res = await supertest(app.server)
      .get('/api/food-selections/export/mine')
      .query({ nickname: 'alice@example.com' })
      .buffer(true)
      .parse((stream, callback) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toContain('.xlsx');

    const workbook = new ExcelJS.Workbook();
    const bytes = Uint8Array.from(res.body as Uint8Array);
    await workbook.xlsx.load(bytes.buffer);
    const sheet = workbook.getWorksheet('Orders');
    expect(sheet).toBeDefined();
    expect(sheet?.rowCount).toBeGreaterThanOrEqual(2);
    expect(String(sheet?.getRow(2).getCell(5).value ?? '')).toContain('Pad Thai');
    expect(String(sheet?.getRow(2).getCell(7).value ?? '')).toContain('5');
    expect(String(sheet?.getRow(2).getCell(8).value ?? '')).toContain('Would order again');

    await app.close();
  });

  it('rejects a too-long feedback comment', async () => {
    const { selectionId, orderId } = await createCompletedSelectionWithOrder('alice@example.com');
    const app = await buildApp();
    await app.ready();

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selectionId}/orders/${orderId}/rating`)
      .send({ nickname: 'alice@example.com', rating: 4, feedbackComment: 'x'.repeat(301) })
      .expect(400);

    expect(res.body).toEqual({ error: 'Feedback comment must be 300 characters or fewer' });

    await app.close();
  });
});
