// Factory E2E tests
// Covers CRUD operations, role-based access control, and soft-delete.

import * as request from 'supertest';
import { initApp, getApp, adminAuth, financeAuth } from './e2e-helpers';
import { FactoryType } from '@i9/types';

const BASE = '/api/v1';

describe('Factories (e2e)', () => {
  // IDs of resources created in this suite – cleaned up in afterAll.
  const createdIds: number[] = [];

  // A unique tag appended to names so parallel test runs don't clash.
  const tag = `e2e-${Date.now()}`;

  beforeAll(async () => {
    await initApp();
  });

  afterAll(async () => {
    // Soft-delete all factories created during this suite.
    for (const id of createdIds) {
      await request(getApp().getHttpServer())
        .delete(`${BASE}/factories/${id}`)
        .set(adminAuth());
    }
  });

  // ── GET /factories ─────────────────────────────────────────────────────────

  describe('GET /factories', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(getApp().getHttpServer()).get(`${BASE}/factories`);
      expect(res.status).toBe(401);
    });

    it('returns 200 + paginated result for authenticated user', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/factories`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      // ResponseInterceptor unpacks PageResult: data = items array, total present
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    });

    it('accepts pagination query params', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/factories?page=1&size=5`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.size).toBe(5);
    });

    it('filters by keyword', async () => {
      // Create a factory first so we have something to match.
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/factories`)
        .set(adminAuth())
        .send({ name: `KeywordSearch-${tag}`, type: FactoryType.MATERIAL });

      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;
      createdIds.push(id);

      const searchRes = await request(getApp().getHttpServer())
        .get(`${BASE}/factories?keyword=${encodeURIComponent(`KeywordSearch-${tag}`)}`)
        .set(adminAuth());

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.some((f: any) => f.id === id)).toBe(true);
    });
  });

  // ── POST /factories ────────────────────────────────────────────────────────

  describe('POST /factories', () => {
    it('returns 403 when called with FINANCE role (not permitted)', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/factories`)
        .set(financeAuth())
        .send({ name: `ShouldFail-${tag}`, type: FactoryType.MATERIAL });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(4003);
    });

    it('creates a factory and returns 201 + entity (admin role)', async () => {
      const payload = {
        name: `Test Factory ${tag}`,
        short_name: 'TF',
        type: FactoryType.PROCESS,
        contact_name: 'Zhang San',
        contact_phone: '13800138000',
        address: '上海市测试路1号',
        bank_name: 'Test Bank',
        bank_account: '1234567890',
        tax_no: 'TX12345678',
        remark: 'e2e test factory',
      };

      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/factories`)
        .set(adminAuth())
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toMatchObject({
        name: payload.name,
        type: FactoryType.PROCESS,
        status: 1,
        deleted: 0,
      });
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.factory_no).toMatch(/^CN\d+$/);

      createdIds.push(res.body.data.id);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/factories`)
        .set(adminAuth())
        .send({ name: `Missing Type ${tag}` }); // `type` is required

      expect(res.status).toBe(400);
    });

    it('returns 400 when type is not a valid enum value', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/factories`)
        .set(adminAuth())
        .send({ name: `Bad Type ${tag}`, type: 'INVALID_TYPE' });

      expect(res.status).toBe(400);
    });
  });

  // ── GET /factories/:id ────────────────────────────────────────────────────

  describe('GET /factories/:id', () => {
    let factoryId: number;

    beforeAll(async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/factories`)
        .set(adminAuth())
        .send({ name: `GetById-${tag}`, type: FactoryType.BOTH });

      expect(res.status).toBe(201);
      factoryId = res.body.data.id;
      createdIds.push(factoryId);
    });

    it('returns 200 + factory detail', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/factories/${factoryId}`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(factoryId);
      expect(res.body.data).toHaveProperty('factory_no');
    });

    it('returns 404 for a non-existent factory id', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/factories/999999999`)
        .set(adminAuth());

      expect(res.status).toBe(404);
      expect(res.body.code).toBe(4004);
    });
  });

  // ── PUT /factories/:id ────────────────────────────────────────────────────

  describe('PUT /factories/:id', () => {
    let factoryId: number;

    beforeAll(async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/factories`)
        .set(adminAuth())
        .send({ name: `ToUpdate-${tag}`, type: FactoryType.MATERIAL });

      expect(res.status).toBe(201);
      factoryId = res.body.data.id;
      createdIds.push(factoryId);
    });

    it('updates the factory and returns 200 with new values', async () => {
      const res = await request(getApp().getHttpServer())
        .put(`${BASE}/factories/${factoryId}`)
        .set(adminAuth())
        .send({ name: `Updated-${tag}`, type: FactoryType.MATERIAL });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe(`Updated-${tag}`);
    });

    it('returns 403 when FINANCE role tries to update', async () => {
      const res = await request(getApp().getHttpServer())
        .put(`${BASE}/factories/${factoryId}`)
        .set(financeAuth())
        .send({ name: `FinanceTryUpdate-${tag}`, type: FactoryType.MATERIAL });

      expect(res.status).toBe(403);
    });
  });

  // ── PATCH /factories/:id/status ───────────────────────────────────────────

  describe('PATCH /factories/:id/status', () => {
    let factoryId: number;

    beforeAll(async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/factories`)
        .set(adminAuth())
        .send({ name: `ToggleStatus-${tag}`, type: FactoryType.MATERIAL });

      expect(res.status).toBe(201);
      factoryId = res.body.data.id;
      createdIds.push(factoryId);
    });

    it('toggles status from 1 to 0 (admin)', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/factories/${factoryId}/status`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(0);
    });

    it('toggles status back to 1 on a second call', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/factories/${factoryId}/status`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(1);
    });

    it('returns 403 when FINANCE role tries to toggle status', async () => {
      const res = await request(getApp().getHttpServer())
        .patch(`${BASE}/factories/${factoryId}/status`)
        .set(financeAuth());

      expect(res.status).toBe(403);
    });
  });

  // ── DELETE /factories/:id ─────────────────────────────────────────────────

  describe('DELETE /factories/:id', () => {
    it('soft-deletes a factory and returns 200 (admin)', async () => {
      // Create a factory just for deletion.
      const createRes = await request(getApp().getHttpServer())
        .post(`${BASE}/factories`)
        .set(adminAuth())
        .send({ name: `ToDelete-${tag}`, type: FactoryType.MATERIAL });

      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;

      const delRes = await request(getApp().getHttpServer())
        .delete(`${BASE}/factories/${id}`)
        .set(adminAuth());

      expect(delRes.status).toBe(200);

      // The factory should now be invisible.
      const getRes = await request(getApp().getHttpServer())
        .get(`${BASE}/factories/${id}`)
        .set(adminAuth());
      expect(getRes.status).toBe(404);
    });

    it('returns 403 when FINANCE role tries to delete', async () => {
      // We have at least one factory in createdIds by now.
      const id = createdIds[0];
      const res = await request(getApp().getHttpServer())
        .delete(`${BASE}/factories/${id}`)
        .set(financeAuth());

      expect(res.status).toBe(403);
    });
  });

  // ── GET /factories/select ─────────────────────────────────────────────────

  describe('GET /factories/select', () => {
    it('returns an array of enabled factories', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/factories/select`)
        .set(adminAuth());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Each item should expose the minimal select fields.
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty('id');
        expect(res.body.data[0]).toHaveProperty('name');
        expect(res.body.data[0]).toHaveProperty('type');
      }
    });
  });
});
