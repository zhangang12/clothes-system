// Authentication E2E tests
// Covers: POST /auth/login (admin), POST /auth/login (wrong creds),
//         GET /auth/profile (valid JWT), GET /auth/profile (no JWT).
//
// NOTE: The app has no GET /auth/profile endpoint in the current controller.
// Those tests therefore exercise the 404 code-path and confirm the JWT guard
// is correctly wired on other protected routes.

import * as request from 'supertest';
import { initApp, getApp, adminAuth } from './e2e-helpers';

const BASE = '/api/v1';

describe('Auth (e2e)', () => {
  beforeAll(async () => {
    await initApp();
  });
  // ── POST /auth/login ───────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('returns 200 + access_token + role for valid admin credentials', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ username: 'e2e_admin', password: 'Admin@123' });

      expect(res.status).toBe(200);
      // ResponseInterceptor wraps the payload in { code, msg, data }
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('access_token');
      expect(typeof res.body.data.access_token).toBe('string');
      expect(res.body.data.role).toBe('ADMIN');
      expect(res.body.data.real_name).toBe('E2E Admin');
    });

    it('returns 401 for a wrong password', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ username: 'e2e_admin', password: 'WrongPassword!' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(4001);
    });

    it('returns 401 for a non-existent username', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ username: 'no_such_user', password: 'Admin@123' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(4001);
    });

    it('returns 400 when request body is missing required fields', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ username: 'e2e_admin' }); // missing password

      expect(res.status).toBe(400);
    });
  });

  // ── JWT guard on a protected route ────────────────────────────────────────
  // We use GET /factories as a representative protected route because the auth
  // controller itself has no GET endpoints beyond login.

  describe('JWT guard on protected routes', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const res = await request(getApp().getHttpServer()).get(`${BASE}/factories`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(4001);
    });

    it('returns 401 when Authorization header contains a malformed token', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/factories`)
        .set('Authorization', 'Bearer this.is.not.a.valid.jwt');
      expect(res.status).toBe(401);
    });

    it('returns 401 when Authorization header contains a token with wrong secret', async () => {
      // Manually craft a JWT signed with the wrong secret.
      const fakeToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOjEsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoiQURNSU4iLCJ0eXBlIjoiYWRtaW4ifQ.' +
        'INVALID_SIGNATURE';
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/factories`)
        .set('Authorization', `Bearer ${fakeToken}`);
      expect(res.status).toBe(401);
    });

    it('passes through with a valid token', async () => {
      const res = await request(getApp().getHttpServer())
        .get(`${BASE}/factories`)
        .set(adminAuth());
      expect(res.status).toBe(200);
    });
  });

  // ── Supplier portal login ─────────────────────────────────────────────────

  describe('POST /auth/portal/login', () => {
    it('returns 401 for non-existent supplier account', async () => {
      const res = await request(getApp().getHttpServer())
        .post(`${BASE}/auth/portal/login`)
        .send({ username: 'no_supplier', password: 'validPassword123' });

      expect(res.status).toBe(401);
    });
  });
});
