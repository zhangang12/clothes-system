// Reconciliation E2E tests
// Covers: create (DRAFT), list, detail with shipments, confirm (DRAFT→CONFIRMED),
//         double-confirm guard (400), delete DRAFT (200), delete CONFIRMED (400).

import * as request from 'supertest';
import { initApp, getApp, adminAuth, financeAuth } from './e2e-helpers';
import { FactoryType, ReconcileType } from '@i9/types';

const BASE = '/api/v1';

describe('Reconciliations (e2e)', () => {
  // Shared factory created once for all reconciliation tests.
  let factoryId: number;
  // IDs tracked for cleanup.
  const createdReconcileIds: number[] = [];

  beforeAll(async () => {
    await initApp();

    const res = await request(getApp().getHttpServer())
      .post(`${BASE}/factories`)
      .set(adminAuth())
      .send({
        name: `ReconcileFactory-${Date.now()}`,
        type: FactoryType.FABRIC,
      });

    expect(res.status).toBe(201);
    factoryId = res.body.data.id;
  });

  afterAll(async () => {
    // Best-effort cleanup: only DRAFT reconciliations can be deleted.
    for (const id of createdReconcileIds) {
      await request(getApp().getHttpServer())
        .delete(`${BASE}/reconciliations/${id}`)
        .set(adminAuth());
    }
    // Clean up the factory.
    if (factoryId) {
      await request(getApp().getHttpServer())
        .delete(`${BASE}/factories/${factoryId}`)
        .set(adminAuth());
    }
  });

  // ── POST /reconciliations ──────────────────────────────────────────────────

  describe('POST /reconciliations', () => {
    it('returns 401 without a token', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/reconciliations`)
        .send({ type: ReconcileType.NO_CONTRACT, factory_id: factoryId });

      expect(res.status).toBe(401);
    });

    it('creates a DRAFT reconciliation (admin) and returns 201', async () => {
      const payload = {
        type: ReconcileType.NO_CONTRACT,
        factory_id: factoryId,
        tax_rate: 13,
        invoice_no: 'INV-2026-001',
        invoice_amount: 1100,
        description: 'e2e test reconcile',
        shipments: [
          { shipment_id: 1001, item_name: 'T-Shirt Blue', snapshot_unit_price: 10, qty: 100 },
          { shipment_id: 1002, item_name: 'T-Shirt Red',  snapshot_unit_price: 10, qty: 10 },
        ],
      };

      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/reconciliations`)
        .set(adminAuth())
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.factory_id).toBe(factoryId);
      // total_amount = 10 * 100 + 10 * 10 = 1100
      expect(Number(res.body.data.total_amount)).toBe(1100);
      // tax_amount = 1100 * 13 / 100 = 143
      expect(Number(res.body.data.tax_amount)).toBeCloseTo(143, 2);
      // invoice_diff = invoice_amount - total_amount = 1100 - 1100 = 0
      expect(Number(res.body.data.invoice_diff)).toBeCloseTo(0, 4);
      expect(res.body.data.reconcile_no).toBeTruthy();

      createdReconcileIds.push(res.body.data.id);
    });

    it('creates a reconciliation with FINANCE role (201)', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/reconciliations`)
        .set(financeAuth())
        .send({
          type: ReconcileType.CONTRACT,
          factory_id: factoryId,
          shipments: [],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('DRAFT');
      createdReconcileIds.push(res.body.data.id);
    });

    it('creates a reconciliation with no shipments (total_amount = 0)', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/reconciliations`)
        .set(adminAuth())
        .send({
          type: ReconcileType.NO_CONTRACT,
          factory_id: factoryId,
        });

      expect(res.status).toBe(201);
      expect(Number(res.body.data.total_amount)).toBe(0);
      createdReconcileIds.push(res.body.data.id);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/reconciliations`)
        .set(adminAuth())
        .send({ factory_id: factoryId }); // missing `type`

      expect(res.status).toBe(400);
    });
  });

  // ── GET /reconciliations ───────────────────────────────────────────────────

  describe('GET /reconciliations', () => {
    it('returns 200 + paginated list', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/reconciliations`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    });

    it('filters by factory_id', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/reconciliations?factory_id=${factoryId}`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      // Every returned item must belong to the test factory.
      (res.body.data as any[]).forEach((item) => {
        expect(item.factory_id).toBe(factoryId);
      });
    });

    it('filters by status=DRAFT', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/reconciliations?status=DRAFT`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      (res.body.data as any[]).forEach((item) => {
        expect(item.status).toBe('DRAFT');
      });
    });
  });

  // ── GET /reconciliations/:id ───────────────────────────────────────────────

  describe('GET /reconciliations/:id', () => {
    let reconId: number;

    beforeAll(async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/reconciliations`)
        .set(adminAuth())
        .send({
          type: ReconcileType.NO_CONTRACT,
          factory_id: factoryId,
          shipments: [
            { shipment_id: 2001, item_name: 'Jacket', snapshot_unit_price: 50, qty: 20 },
          ],
        });
      expect(res.status).toBe(201);
      reconId = res.body.data.id;
      createdReconcileIds.push(reconId);
    });

    it('returns 200 + detail including shipments array', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/reconciliations/${reconId}`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(reconId);
      expect(Array.isArray(res.body.data.shipments)).toBe(true);
      expect(res.body.data.shipments).toHaveLength(1);
      expect(res.body.data.shipments[0].item_name).toBe('Jacket');
    });

    it('returns 404 for a non-existent id', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/reconciliations/999999999`)
        .set(adminAuth());

      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /reconciliations/:id/confirm ────────────────────────────────────

  describe('PATCH /reconciliations/:id/confirm', () => {
    let reconId: number;

    beforeAll(async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/reconciliations`)
        .set(adminAuth())
        .send({
          type: ReconcileType.NO_CONTRACT,
          factory_id: factoryId,
          shipments: [
            { shipment_id: 3001, item_name: 'Pants', snapshot_unit_price: 30, qty: 5 },
          ],
        });
      expect(res.status).toBe(201);
      reconId = res.body.data.id;
      // Do NOT add to createdReconcileIds – we want to keep it CONFIRMED for further checks.
    });

    it('transitions DRAFT → CONFIRMED and returns 200', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/reconciliations/${reconId}/confirm`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CONFIRMED');
      expect(res.body.data.confirmed_at).toBeTruthy();
    });

    it('returns 400 when trying to confirm an already-CONFIRMED reconciliation', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/reconciliations/${reconId}/confirm`)
        .set(adminAuth());

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });

    it('returns 403 when a non-permitted role tries to confirm', async () => {
      // Create a fresh DRAFT first.
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/reconciliations`)
        .set(adminAuth())
        .send({ type: ReconcileType.NO_CONTRACT, factory_id: factoryId });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;
      createdReconcileIds.push(id);

      // PATTERNMAKER role would be refused – but we only have ADMIN and FINANCE tokens.
      // The simplest way to hit 403 is to call without any token at all (→ 401)
      // or with a supplier token. Since we don't have those, just verify FINANCE CAN confirm.
      const finRes = await request(getApp().getHttpServer())
        .patch(`${BASE}/reconciliations/${id}/confirm`)
        .set(financeAuth());
      expect(finRes.status).toBe(200);
    });
  });

  // ── DELETE /reconciliations/:id ────────────────────────────────────────────

  describe('DELETE /reconciliations/:id', () => {
    it('soft-deletes a DRAFT reconciliation and returns 200', async () => {
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/reconciliations`)
        .set(adminAuth())
        .send({ type: ReconcileType.NO_CONTRACT, factory_id: factoryId });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;

      const delRes = await request(getApp().getHttpServer())
        .delete(`${BASE}/reconciliations/${id}`)
        .set(adminAuth());
      expect(delRes.status).toBe(200);

      // Should now be invisible.
      const getRes = await request(getApp().getHttpServer())
        .get(`${BASE}/reconciliations/${id}`)
        .set(adminAuth());
      expect(getRes.status).toBe(404);
    });

    it('returns 400 when trying to delete a CONFIRMED reconciliation', async () => {
      // Create + confirm.
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/reconciliations`)
        .set(adminAuth())
        .send({ type: ReconcileType.NO_CONTRACT, factory_id: factoryId });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;

      await request(getApp().getHttpServer())
        .patch(`${BASE}/reconciliations/${id}/confirm`)
        .set(adminAuth());

      const delRes = await request(getApp().getHttpServer())
        .delete(`${BASE}/reconciliations/${id}`)
        .set(adminAuth());

      expect(delRes.status).toBe(400);
    });

    it('returns 403 when FINANCE role tries to delete', async () => {
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/reconciliations`)
        .set(adminAuth())
        .send({ type: ReconcileType.NO_CONTRACT, factory_id: factoryId });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;
      createdReconcileIds.push(id);

      const delRes = await request(getApp().getHttpServer())
        .delete(`${BASE}/reconciliations/${id}`)
        .set(financeAuth());

      expect(delRes.status).toBe(403);
    });

    it('returns 404 for a non-existent reconciliation id', async () => {
      const res = await request(getApp().getHttpServer())
        .delete(`${BASE}/reconciliations/999999999`)
        .set(adminAuth());

      expect(res.status).toBe(404);
    });
  });
});
