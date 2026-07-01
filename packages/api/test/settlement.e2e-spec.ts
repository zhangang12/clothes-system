// Settlement E2E tests
// Covers: create (net_profit calculated), add costs (recalculates net_profit),
//         confirm (DRAFT→CONFIRMED), guard on adding cost to CONFIRMED (400),
//         delete DRAFT (200), delete CONFIRMED (400), add receipt (allowed even after confirm).

import * as request from 'supertest';
import { initApp, getApp, adminAuth, financeAuth } from './e2e-helpers';
import { CustomerGrade } from '@i9/types';

const BASE = '/api/v1';

describe('Settlements (e2e)', () => {
  // Prerequisite data created once for all settlement tests.
  let customerId: number;
  let orderId: number;

  // IDs for cleanup.
  const createdSettlementIds: number[] = [];

  const tag = `settle-${Date.now()}`;

  beforeAll(async () => {
    await initApp();

    // Create a customer.
    const custRes = await request(getApp().getHttpServer())
      .post(`${BASE}/customers`)
      .set(adminAuth())
      .send({
        name: `SettleCustomer-${tag}`,
        grade: CustomerGrade.A,
        currency: 'USD',
      });
    expect(custRes.status).toBe(201);
    customerId = custRes.body.data.id;

    // Create an order belonging to that customer.
    const orderRes = await request(getApp().getHttpServer())
      .post(`${BASE}/orders`)
      .set(adminAuth())
      .send({
        customer_id: customerId,
        style_name: `SettleOrder-${tag}`,
        qty_total: 200,
        currency: 'USD',
        unit_price: 15,
      });
    expect(orderRes.status).toBe(201);
    orderId = orderRes.body.data.id;
  });

  afterAll(async () => {
    // Best-effort cleanup – only DRAFT settlements can be deleted.
    for (const id of createdSettlementIds) {
      await request(getApp().getHttpServer())
        .delete(`${BASE}/settlements/${id}`)
        .set(adminAuth());
    }
    // Clean up order and customer.
    if (orderId) {
      await request(getApp().getHttpServer())
        .delete(`${BASE}/orders/${orderId}`)
        .set(adminAuth());
    }
    if (customerId) {
      await request(getApp().getHttpServer())
        .delete(`${BASE}/customers/${customerId}`)
        .set(adminAuth());
    }
  });

  // ── POST /settlements ──────────────────────────────────────────────────────

  describe('POST /settlements', () => {
    it('returns 401 without a token', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .send({ order_id: orderId, revenue: 3000 });

      expect(res.status).toBe(401);
    });

    it('creates a DRAFT settlement with net_profit = revenue - total_cost (201)', async () => {
      const payload = {
        order_id: orderId,
        revenue: 3000,
        costs: [
          { cost_name: 'Fabric cost',    amount: 800, has_invoice: 1 },
          { cost_name: 'Labor cost',     amount: 600, has_invoice: 1 },
          { cost_name: 'Shipping cost',  amount: 100, has_invoice: 0 },
        ],
        description: 'e2e settlement',
      };

      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data.status).toBe('DRAFT');
      expect(Number(res.body.data.revenue)).toBe(3000);
      // total_cost = 800 + 600 + 100 = 1500
      expect(Number(res.body.data.total_cost)).toBe(1500);
      // net_profit = 3000 - 1500 = 1500
      expect(Number(res.body.data.net_profit)).toBe(1500);
      expect(res.body.data.settlement_no).toBeTruthy();
      expect(res.body.data.id).toBeDefined();

      createdSettlementIds.push(res.body.data.id);
    });

    it('creates a settlement with no costs (net_profit = revenue)', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send({ order_id: orderId, revenue: 2000 });

      expect(res.status).toBe(201);
      expect(Number(res.body.data.revenue)).toBe(2000);
      expect(Number(res.body.data.total_cost)).toBe(0);
      expect(Number(res.body.data.net_profit)).toBe(2000);

      createdSettlementIds.push(res.body.data.id);
    });

    it('allows FINANCE role to create a settlement', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(financeAuth())
        .send({ order_id: orderId, revenue: 500 });

      expect(res.status).toBe(201);
      createdSettlementIds.push(res.body.data.id);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send({ revenue: 1000 }); // missing order_id

      expect(res.status).toBe(400);
    });

    it('returns 400 when cost amount is not positive', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send({
          order_id: orderId,
          revenue: 1000,
          costs: [{ cost_name: 'Bad cost', amount: -50 }],
        });

      expect(res.status).toBe(400);
    });
  });

  // ── GET /settlements ───────────────────────────────────────────────────────

  describe('GET /settlements', () => {
    it('returns 200 + paginated list', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/settlements`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    });

    it('filters by status=DRAFT', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/settlements?status=DRAFT`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      (res.body.data as any[]).forEach((item) => {
        expect(item.status).toBe('DRAFT');
      });
    });

    it('filters by order_id', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/settlements?order_id=${orderId}`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      (res.body.data as any[]).forEach((item) => {
        expect(item.order_id).toBe(orderId);
      });
    });
  });

  // ── GET /settlements/:id ───────────────────────────────────────────────────

  describe('GET /settlements/:id', () => {
    let settlementId: number;

    beforeAll(async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send({
          order_id: orderId,
          revenue: 1000,
          costs: [{ cost_name: 'Ops', amount: 100 }],
        });
      expect(res.status).toBe(201);
      settlementId = res.body.data.id;
      createdSettlementIds.push(settlementId);
    });

    it('returns 200 + detail with costs and receipts arrays', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/settlements/${settlementId}`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(settlementId);
      expect(Array.isArray(res.body.data.costs)).toBe(true);
      expect(res.body.data.costs).toHaveLength(1);
      expect(res.body.data.costs[0].cost_name).toBe('Ops');
      expect(Array.isArray(res.body.data.receipts)).toBe(true);
    });

    it('returns 404 for a non-existent settlement', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/settlements/999999999`)
        .set(adminAuth());

      expect(res.status).toBe(404);
    });
  });

  // ── POST /settlements/:id/costs ────────────────────────────────────────────

  describe('POST /settlements/:id/costs', () => {
    let settlementId: number;

    beforeAll(async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send({ order_id: orderId, revenue: 4000 });
      expect(res.status).toBe(201);
      settlementId = res.body.data.id;
      createdSettlementIds.push(settlementId);
    });

    it('adds a cost line and recalculates net_profit (200)', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements/${settlementId}/costs`)
        .set(adminAuth())
        .send({ cost_name: 'Extra freight', amount: 250, has_invoice: 0 });

      expect(res.status).toBe(201);
      // net_profit = 4000 - 250 = 3750
      expect(Number(res.body.data.net_profit)).toBe(3750);
      expect(Number(res.body.data.total_cost)).toBe(250);
    });

    it('adding a second cost further reduces net_profit', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements/${settlementId}/costs`)
        .set(adminAuth())
        .send({ cost_name: 'Duty', amount: 150 });

      expect(res.status).toBe(201);
      // net_profit = 4000 - 250 - 150 = 3600
      expect(Number(res.body.data.net_profit)).toBe(3600);
      expect(Number(res.body.data.total_cost)).toBe(400);
    });

    it('returns 400 when cost amount is not positive', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements/${settlementId}/costs`)
        .set(adminAuth())
        .send({ cost_name: 'Zero cost', amount: 0 });

      expect(res.status).toBe(400);
    });

    it('returns 400 when trying to add cost to a CONFIRMED settlement', async () => {
      // Confirm the settlement first.
      await request(getApp().getHttpServer())
        .patch(`${BASE}/settlements/${settlementId}/confirm`)
        .set(adminAuth());

      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements/${settlementId}/costs`)
        .set(adminAuth())
        .send({ cost_name: 'Late cost', amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });
  });

  // ── POST /settlements/:id/receipts ─────────────────────────────────────────

  describe('POST /settlements/:id/receipts', () => {
    let settlementId: number;

    beforeAll(async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send({ order_id: orderId, revenue: 5000 });
      expect(res.status).toBe(201);
      settlementId = res.body.data.id;
      createdSettlementIds.push(settlementId);
    });

    it('adds a receipt on a DRAFT settlement (201)', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements/${settlementId}/receipts`)
        .set(adminAuth())
        .send({ amount: 2000, receipt_date: '2026-03-10', remark: 'First installment' });

      expect(res.status).toBe(201);
      // addReceipt returns void → ResponseInterceptor wraps `undefined` as { code:0, msg:'ok', data:undefined }
      expect(res.body.code).toBe(0);
    });

    it('adds a receipt on a CONFIRMED settlement (allowed) (201)', async () => {
      // Confirm first.
      await request(getApp().getHttpServer())
        .patch(`${BASE}/settlements/${settlementId}/confirm`)
        .set(adminAuth());

      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements/${settlementId}/receipts`)
        .set(adminAuth())
        .send({ amount: 3000, receipt_date: '2026-04-15' });

      expect(res.status).toBe(201);
    });

    it('verifies that receipts appear in the detail response', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/settlements/${settlementId}`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.data.receipts.length).toBeGreaterThanOrEqual(2);
    });

    it('returns 400 when receipt date is not a valid ISO date string', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements/${settlementId}/receipts`)
        .set(adminAuth())
        .send({ amount: 100, receipt_date: 'bad-date' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when receipt amount is not positive', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements/${settlementId}/receipts`)
        .set(adminAuth())
        .send({ amount: -50, receipt_date: '2026-05-01' });

      expect(res.status).toBe(400);
    });
  });

  // ── PATCH /settlements/:id/confirm ─────────────────────────────────────────

  describe('PATCH /settlements/:id/confirm', () => {
    let settlementId: number;

    beforeAll(async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send({ order_id: orderId, revenue: 1500 });
      expect(res.status).toBe(201);
      settlementId = res.body.data.id;
      // Do NOT push to createdSettlementIds – will be CONFIRMED.
    });

    it('transitions DRAFT → CONFIRMED (200)', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/settlements/${settlementId}/confirm`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CONFIRMED');
      expect(res.body.data.confirmed_at).toBeTruthy();
    });

    it('returns 400 when trying to confirm an already-CONFIRMED settlement', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/settlements/${settlementId}/confirm`)
        .set(adminAuth());

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });

    it('allows FINANCE role to confirm', async () => {
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send({ order_id: orderId, revenue: 800 });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;

      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/settlements/${id}/confirm`)
        .set(financeAuth());

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CONFIRMED');
    });
  });

  // ── DELETE /settlements/:id ────────────────────────────────────────────────

  describe('DELETE /settlements/:id', () => {
    it('soft-deletes a DRAFT settlement (200)', async () => {
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send({ order_id: orderId, revenue: 700 });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;

      const delRes = await request(getApp().getHttpServer())
        .delete(`${BASE}/settlements/${id}`)
        .set(adminAuth());

      expect(delRes.status).toBe(200);

      // The settlement should now be invisible.
      const getRes = await request(getApp().getHttpServer())
        .get(`${BASE}/settlements/${id}`)
        .set(adminAuth());
      expect(getRes.status).toBe(404);
    });

    it('returns 400 when trying to delete a CONFIRMED settlement', async () => {
      // Create + confirm.
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send({ order_id: orderId, revenue: 600 });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;

      await request(getApp().getHttpServer())
        .patch(`${BASE}/settlements/${id}/confirm`)
        .set(adminAuth());

      const delRes = await request(getApp().getHttpServer())
        .delete(`${BASE}/settlements/${id}`)
        .set(adminAuth());

      expect(delRes.status).toBe(400);
      expect(delRes.body.code).toBe(1001);
    });

    it('returns 403 when FINANCE role tries to delete', async () => {
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/settlements`)
        .set(adminAuth())
        .send({ order_id: orderId, revenue: 400 });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;
      createdSettlementIds.push(id);

      const res = await request(getApp().getHttpServer())
        .delete(`${BASE}/settlements/${id}`)
        .set(financeAuth());

      expect(res.status).toBe(403);
    });

    it('returns 404 for a non-existent settlement id', async () => {
      const res = await request(getApp().getHttpServer())
        .delete(`${BASE}/settlements/999999999`)
        .set(adminAuth());

      expect(res.status).toBe(404);
    });
  });
});
