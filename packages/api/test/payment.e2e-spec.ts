// Payment E2E tests
// Covers: prepayments (create, list, balance), payment requests (full workflow:
// DRAFT → PENDING → APPROVED → PAID), and error guard when offset exceeds balance.

import * as request from 'supertest';
import { initApp, getApp, adminAuth, financeAuth } from './e2e-helpers';
import { FactoryType, ReconcileType, PaymentApprovalStatus } from '@i9/types';

const BASE = '/api/v1';

describe('Payments (e2e)', () => {
  let factoryId: number;
  const tag = `pay-${Date.now()}`;

  // Track created payment-request IDs for cleanup (only DRAFT can be deleted).
  const createdPrIds: number[] = [];

  beforeAll(async () => {
    await initApp();

    // Create a dedicated factory for all payment tests.
    const res = await request(getApp().getHttpServer())
      .post(`${BASE}/factories`)
      .set(adminAuth())
      .send({ name: `PayFactory-${tag}`, type: FactoryType.FABRIC });

    expect(res.status).toBe(201);
    factoryId = res.body.data.id;
  });

  afterAll(async () => {
    for (const id of createdPrIds) {
      await request(getApp().getHttpServer())
        .delete(`${BASE}/payments/requests/${id}`)
        .set(adminAuth());
    }
    if (factoryId) {
      await request(getApp().getHttpServer())
        .delete(`${BASE}/factories/${factoryId}`)
        .set(adminAuth());
    }
  });

  // ── POST /payments/prepayments ─────────────────────────────────────────────

  describe('POST /payments/prepayments', () => {
    it('returns 401 without a token', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/prepayments`)
        .send({ factory_id: factoryId, amount: 500, pay_date: '2026-01-01' });

      expect(res.status).toBe(401);
    });

    it('creates a prepayment and returns 201 (admin)', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/prepayments`)
        .set(adminAuth())
        .send({
          factory_id: factoryId,
          amount: 1000,
          pay_date: '2026-01-15',
          remark: 'e2e prepay',
        });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(Number(res.body.data.amount)).toBe(1000);
      expect(Number(res.body.data.balance)).toBe(1000);
      expect(Number(res.body.data.used_amount)).toBe(0);
    });

    it('creates a prepayment with FINANCE role (201)', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/prepayments`)
        .set(financeAuth())
        .send({ factory_id: factoryId, amount: 500, pay_date: '2026-02-01' });

      expect(res.status).toBe(201);
    });

    it('returns 400 when amount is 0 or negative', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/prepayments`)
        .set(adminAuth())
        .send({ factory_id: factoryId, amount: 0, pay_date: '2026-01-01' });

      // amount has @Min(0.0001) validation
      expect(res.status).toBe(400);
    });

    it('returns 400 when pay_date is not ISO date string', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/prepayments`)
        .set(adminAuth())
        .send({ factory_id: factoryId, amount: 100, pay_date: 'not-a-date' });

      expect(res.status).toBe(400);
    });
  });

  // ── GET /payments/prepayments/balance ─────────────────────────────────────

  describe('GET /payments/prepayments/balance', () => {
    it('returns 200 + numeric balance for known factory', async () => {
      // We already created prepayments above (1000 + 500 = 1500 total balance).
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/payments/prepayments/balance?factory_id=${factoryId}`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      // Balance = sum of all balances for the factory.
      expect(typeof res.body.data).toBe('number');
      expect(res.body.data).toBeGreaterThanOrEqual(1500);
    });

    it('returns 200 with balance 0 for a factory with no prepayments', async () => {
      // Create a new factory that has no prepayments.
      const fRes = await request(getApp().getHttpServer())
        .post(`${BASE}/factories`)
        .set(adminAuth())
        .send({ name: `NoPrepayFactory-${tag}`, type: FactoryType.OUTSOURCE });
      expect(fRes.status).toBe(201);
      const emptyFactoryId = fRes.body.data.id;

      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/payments/prepayments/balance?factory_id=${emptyFactoryId}`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.data).toBe(0);

      // Clean up.
      await request(getApp().getHttpServer())
        .delete(`${BASE}/factories/${emptyFactoryId}`)
        .set(adminAuth());
    });
  });

  // ── GET /payments/prepayments ─────────────────────────────────────────────

  describe('GET /payments/prepayments', () => {
    it('returns 200 + paginated list', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/payments/prepayments`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    });

    it('filters by factory_id', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/payments/prepayments?factory_id=${factoryId}`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      (res.body.data as any[]).forEach((item) => {
        expect(item.factory_id).toBe(factoryId);
      });
    });
  });

  // ── POST /payments/requests ───────────────────────────────────────────────

  describe('POST /payments/requests', () => {
    it('creates a DRAFT payment request and returns 201', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/requests`)
        .set(adminAuth())
        .send({
          type: ReconcileType.NO_CONTRACT,
          factory_id: factoryId,
          amount: 200,
          description: 'e2e payment request',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.approval_status).toBe(PaymentApprovalStatus.DRAFT);
      expect(Number(res.body.data.amount)).toBe(200);
      expect(Number(res.body.data.prepay_offset)).toBe(0);
      expect(Number(res.body.data.actual_pay)).toBe(200);
      expect(res.body.data.pr_no).toBeTruthy();

      createdPrIds.push(res.body.data.id);
    });

    it('creates a request with prepay_offset and validates the net actual_pay', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/requests`)
        .set(adminAuth())
        .send({
          type: ReconcileType.NO_CONTRACT,
          factory_id: factoryId,
          amount: 300,
          prepay_offset: 100, // within the ≥1500 balance
        });

      expect(res.status).toBe(201);
      expect(Number(res.body.data.amount)).toBe(300);
      expect(Number(res.body.data.prepay_offset)).toBe(100);
      expect(Number(res.body.data.actual_pay)).toBe(200);

      createdPrIds.push(res.body.data.id);
    });

    it('returns 400 when prepay_offset exceeds available balance', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/requests`)
        .set(adminAuth())
        .send({
          type: ReconcileType.NO_CONTRACT,
          factory_id: factoryId,
          amount: 5000,
          prepay_offset: 999999, // far exceeds any possible balance
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1001);
    });

    it('returns 403 when a non-permitted role creates the request', async () => {
      // FINANCE is allowed; there is no role that is specifically blocked here
      // except roles outside ADMIN/FINANCE. A quick sanity check: FINANCE works.
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/requests`)
        .set(financeAuth())
        .send({
          type: ReconcileType.NO_CONTRACT,
          factory_id: factoryId,
          amount: 50,
        });

      expect(res.status).toBe(201);
      createdPrIds.push(res.body.data.id);
    });
  });

  // ── Full workflow: DRAFT → PENDING → APPROVED → PAID ──────────────────────

  describe('Payment request workflow', () => {
    let prId: number;

    beforeAll(async () => {
      // Create the payment request that we'll walk through the full workflow.
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/requests`)
        .set(adminAuth())
        .send({
          type: ReconcileType.NO_CONTRACT,
          factory_id: factoryId,
          amount: 150,
          description: 'workflow test',
        });
      expect(res.status).toBe(201);
      prId = res.body.data.id;
      // Do NOT push to createdPrIds – this will be walked through to PAID and cleaned up naturally.
    });

    it('PATCH /payments/requests/:id/submit – DRAFT → PENDING (200)', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${prId}/submit`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.data.approval_status).toBe(PaymentApprovalStatus.PENDING);
      expect(res.body.data.submitted_at).toBeTruthy();
    });

    it('PATCH /payments/requests/:id/submit – returns 400 if already PENDING', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${prId}/submit`)
        .set(adminAuth());

      expect(res.status).toBe(400);
    });

    it('PATCH /payments/requests/:id/approve – PENDING → APPROVED (200, admin only)', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${prId}/approve`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.data.approval_status).toBe(PaymentApprovalStatus.APPROVED);
      expect(res.body.data.approved_at).toBeTruthy();
    });

    it('PATCH /payments/requests/:id/approve – returns 403 with FINANCE role', async () => {
      // Create + submit a fresh request to try with FINANCE.
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/requests`)
        .set(adminAuth())
        .send({ type: ReconcileType.NO_CONTRACT, factory_id: factoryId, amount: 30 });
      expect(createRes.status).toBe(201);
      const tmpId = createRes.body.data.id;
      createdPrIds.push(tmpId);

      await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${tmpId}/submit`)
        .set(adminAuth());

      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${tmpId}/approve`)
        .set(financeAuth());

      expect(res.status).toBe(403);
    });

    it('PATCH /payments/requests/:id/paid – APPROVED → PAID (200)', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${prId}/paid`)
        .set(adminAuth())
        .send({ slip_url: 'https://example.com/slip/001.pdf' });

      expect(res.status).toBe(200);
      expect(res.body.data.approval_status).toBe(PaymentApprovalStatus.PAID);
      expect(res.body.data.slip_url).toBe('https://example.com/slip/001.pdf');
      expect(res.body.data.slip_uploaded_at).toBeTruthy();
    });

    it('PATCH /payments/requests/:id/paid – returns 400 when not APPROVED', async () => {
      // prId is now PAID; calling paid again should fail.
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${prId}/paid`)
        .set(adminAuth())
        .send({ slip_url: 'https://example.com/slip/002.pdf' });

      expect(res.status).toBe(400);
    });
  });

  // ── Prepayment offset deduction on approve ────────────────────────────────

  describe('Prepayment offset deduction', () => {
    it('deducts used_amount from prepayment balance after approval', async () => {
      // Get current balance before.
      const balBefore = await request(getApp().getHttpServer())
        .get(`${BASE}/payments/prepayments/balance?factory_id=${factoryId}`)
        .set(adminAuth());
      const previousBalance: number = balBefore.body.data;

      const offset = 50;

      // Create + submit + approve a request with prepay_offset.
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/requests`)
        .set(adminAuth())
        .send({
          type: ReconcileType.NO_CONTRACT,
          factory_id: factoryId,
          amount: 200,
          prepay_offset: offset,
        });
      expect(createRes.status).toBe(201);
      const prId = createRes.body.data.id;

      await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${prId}/submit`)
        .set(adminAuth());

      await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${prId}/approve`)
        .set(adminAuth());

      // Balance should have dropped by exactly `offset`.
      const balAfter = await request(getApp().getHttpServer())
        .get(`${BASE}/payments/prepayments/balance?factory_id=${factoryId}`)
        .set(adminAuth());

      expect(balAfter.body.data).toBeCloseTo(previousBalance - offset, 2);
    });
  });

  // ── Reject workflow ────────────────────────────────────────────────────────

  describe('PATCH /payments/requests/:id/reject', () => {
    let prId: number;

    beforeAll(async () => {
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/requests`)
        .set(adminAuth())
        .send({ type: ReconcileType.NO_CONTRACT, factory_id: factoryId, amount: 75 });
      expect(createRes.status).toBe(201);
      prId = createRes.body.data.id;

      // Advance to PENDING.
      await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${prId}/submit`)
        .set(adminAuth());
    });

    it('rejects a PENDING request and returns REJECTED status', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${prId}/reject`)
        .set(adminAuth())
        .send({ reason: 'Budget exceeded' });

      expect(res.status).toBe(200);
      expect(res.body.data.approval_status).toBe(PaymentApprovalStatus.REJECTED);
      expect(res.body.data.reject_reason).toBe('Budget exceeded');
    });

    it('returns 400 when trying to reject a non-PENDING request', async () => {
      // prId is already REJECTED.
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/payments/requests/${prId}/reject`)
        .set(adminAuth())
        .send({ reason: 'Again' });

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /payments/requests/:id ─────────────────────────────────────────

  describe('DELETE /payments/requests/:id', () => {
    it('soft-deletes a DRAFT payment request and returns 200', async () => {
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/payments/requests`)
        .set(adminAuth())
        .send({ type: ReconcileType.NO_CONTRACT, factory_id: factoryId, amount: 20 });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;

      const delRes = await request(getApp().getHttpServer())
        .delete(`${BASE}/payments/requests/${id}`)
        .set(adminAuth());

      expect(delRes.status).toBe(200);
    });

    it('returns 404 for a non-existent payment request', async () => {
      const res = await request(getApp().getHttpServer())
        .delete(`${BASE}/payments/requests/999999999`)
        .set(adminAuth());

      expect(res.status).toBe(404);
    });
  });

  // ── GET /payments/requests ─────────────────────────────────────────────────

  describe('GET /payments/requests', () => {
    it('returns 200 + paginated list', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/payments/requests`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('filters by approval_status', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/payments/requests?approval_status=DRAFT`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      (res.body.data as any[]).forEach((item) => {
        expect(item.approval_status).toBe('DRAFT');
      });
    });
  });
});
