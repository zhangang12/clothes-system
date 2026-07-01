import { request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API = 'http://localhost:3000/api/v1';
const STATE_FILE = path.join(__dirname, 'e2e-test-state.json');

async function globalSetup() {
  const ctx = await request.newContext();

  // 1. Login as admin
  const loginResp = await ctx.post(`${API}/auth/login`, {
    data: { username: 'admin', password: 'admin123456' },
  });

  if (!loginResp.ok()) {
    const body = await loginResp.text();
    throw new Error(`E2E global-setup: admin login failed (${loginResp.status()}): ${body}`);
  }

  const loginBody = await loginResp.json();
  const adminToken: string = loginBody.data?.access_token ?? loginBody.access_token ?? '';
  if (!adminToken) {
    throw new Error('E2E global-setup: no access_token in login response');
  }

  const auth = { Authorization: `Bearer ${adminToken}` };

  // 2. Create test factory (E2E测试工厂) — ignore 409 duplicate
  let factoryId: number | null = null;
  const factoryResp = await ctx.post(`${API}/factories`, {
    headers: auth,
    data: {
      name: 'E2E测试工厂',
      short_name: 'E2E厂',
      type: 'MATERIAL',
      contact_name: 'E2E联系人',
      contact_phone: '13800000001',
    },
  });

  if (factoryResp.ok()) {
    const factoryBody = await factoryResp.json();
    factoryId = factoryBody.data?.id ?? factoryBody.id ?? null;
  } else if (factoryResp.status() === 409) {
    // Already exists — look it up
    const listResp = await ctx.get(`${API}/factories`, {
      headers: auth,
      params: { keyword: 'E2E测试工厂', page: 1, size: 5 },
    });
    if (listResp.ok()) {
      const listBody = await listResp.json();
      const items: any[] = listBody.data?.items ?? listBody.items ?? [];
      const found = items.find((f: any) => f.name === 'E2E测试工厂');
      factoryId = found?.id ?? null;
    }
  } else {
    console.warn(`E2E global-setup: factory creation returned ${factoryResp.status()}, continuing without factory seed`);
  }

  // 3. Create test customer — ignore 409 duplicate
  let customerId: number | null = null;
  const customerResp = await ctx.post(`${API}/customers`, {
    headers: auth,
    data: {
      name: 'E2E测试客户',
      short_name: 'E2E客',
      grade: 'A',
      currency: 'USD',
      payment_method: 'T/T',
      country: 'US',
    },
  });

  if (customerResp.ok()) {
    const customerBody = await customerResp.json();
    customerId = customerBody.data?.id ?? customerBody.id ?? null;
  } else if (customerResp.status() === 409) {
    const listResp = await ctx.get(`${API}/customers`, {
      headers: auth,
      params: { keyword: 'E2E测试客户', page: 1, size: 5 },
    });
    if (listResp.ok()) {
      const listBody = await listResp.json();
      const items: any[] = listBody.data?.items ?? listBody.items ?? [];
      const found = items.find((c: any) => c.name === 'E2E测试客户');
      customerId = found?.id ?? null;
    }
  } else {
    console.warn(`E2E global-setup: customer creation returned ${customerResp.status()}, continuing without customer seed`);
  }

  // 4. Persist state for use in tests
  const state = {
    adminToken,
    factoryId,
    customerId,
    seededAt: new Date().toISOString(),
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  console.log('E2E global-setup complete:', state);

  await ctx.dispose();
}

export default globalSetup;
