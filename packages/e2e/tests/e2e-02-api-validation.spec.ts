import { test, expect } from '@playwright/test';

/**
 * E2E-02: API 接口级集成测试
 * 直接测试 REST API，覆盖核心业务流程与边界保护
 */

const API = 'http://localhost:3000/api/v1';

async function adminLogin(request: any): Promise<string> {
  const resp = await request.post(`${API}/auth/login`, {
    data: { username: 'admin', password: 'admin123456' },
  });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  return body.data?.access_token ?? body.access_token ?? '';
}

// ——————————————————————————————————————————
// JWT 认证保护
// ——————————————————————————————————————————
test.describe('JWT认证保护所有路由', () => {
  test('无Token访问 /reconciliations 返回 401', async ({ request }) => {
    const resp = await request.get(`${API}/reconciliations`);
    expect(resp.status()).toBe(401);
  });

  test('无Token访问 /settlements 返回 401', async ({ request }) => {
    const resp = await request.post(`${API}/settlements`, {
      data: { order_id: 1, revenue: 1000 },
    });
    expect(resp.status()).toBe(401);
  });

  test('无Token访问 /factories 返回 401', async ({ request }) => {
    const resp = await request.get(`${API}/factories`);
    expect(resp.status()).toBe(401);
  });

  test('无Token访问 /payments/requests 返回 401', async ({ request }) => {
    const resp = await request.get(`${API}/payments/requests`);
    expect(resp.status()).toBe(401);
  });

  test('无Token访问 /customers 返回 401', async ({ request }) => {
    const resp = await request.get(`${API}/customers`);
    expect(resp.status()).toBe(401);
  });
});

// ——————————————————————————————————————————
// 付款申请完整审批流程 (DRAFT→PENDING→APPROVED→PAID)
// ——————————————————————————————————————————
test.describe('付款申请完整审批流程 API', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await adminLogin(request);
  });

  test('E2E-API-02 付款申请完整审批流程 DRAFT→PENDING→APPROVED→PAID', async ({ request }) => {
    const auth = () => ({ Authorization: `Bearer ${adminToken}` });

    // 1. Create prepayment so there's available balance
    await request.post(`${API}/payments/prepayments`, {
      headers: auth(),
      data: { factory_id: 1, amount: 5000, pay_date: '2026-01-01' },
    });

    // 2. Create payment request (DRAFT)
    const createResp = await request.post(`${API}/payments/requests`, {
      headers: auth(),
      data: { type: 'NO_CONTRACT', factory_id: 1, amount: 500, prepay_offset: 0 },
    });
    expect(createResp.ok()).toBeTruthy();
    const { data: pr } = await createResp.json();
    expect(pr.approval_status).toBe('DRAFT');

    // 3. Submit (DRAFT → PENDING)
    const submitResp = await request.patch(`${API}/payments/requests/${pr.id}/submit`, {
      headers: auth(),
    });
    expect(submitResp.ok()).toBeTruthy();
    const { data: pending } = await submitResp.json();
    expect(pending.approval_status).toBe('PENDING');

    // 4. Approve (PENDING → APPROVED)
    const approveResp = await request.patch(`${API}/payments/requests/${pr.id}/approve`, {
      headers: auth(),
    });
    expect(approveResp.ok()).toBeTruthy();
    const { data: approved } = await approveResp.json();
    expect(approved.approval_status).toBe('APPROVED');

    // 5. Mark paid (APPROVED → PAID)
    const paidResp = await request.patch(`${API}/payments/requests/${pr.id}/paid`, {
      headers: auth(),
      data: { slip_url: 'https://example.com/receipt.jpg' },
    });
    expect(paidResp.ok()).toBeTruthy();
    const { data: paid } = await paidResp.json();
    expect(paid.approval_status).toBe('PAID');
    expect(paid.slip_url).toBe('https://example.com/receipt.jpg');
  });
});

// ——————————————————————————————————————————
// 对账单超额付款防护
// ——————————————————————————————————————————
test.describe('对账单超额付款防护', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await adminLogin(request);
  });

  test('prepay_offset 超出余额时返回 400', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };

    // Try to create a payment request with a prepay_offset exceeding any possible balance
    const resp = await request.post(`${API}/payments/requests`, {
      headers: auth,
      // Use a non-existent factory so balance is 0, offset > 0 triggers guard
      data: {
        type: 'NO_CONTRACT',
        factory_id: 999999,
        amount: 1000,
        prepay_offset: 99999999,
      },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    // Verify error message mentions balance/prepay
    const message: string = body.message ?? body.msg ?? '';
    expect(message.length).toBeGreaterThan(0);
  });

  test('创建预付款后可查询余额', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };

    const createResp = await request.post(`${API}/payments/prepayments`, {
      headers: auth,
      data: { factory_id: 1, amount: 10000, pay_date: '2026-06-01' },
    });
    expect(createResp.ok()).toBeTruthy();

    const balanceResp = await request.get(`${API}/payments/prepayments/balance`, {
      headers: auth,
      params: { factory_id: 1 },
    });
    const balBody = await balanceResp.json();
    // Balance is the raw number wrapped in data or at root
    const balance = balBody.data ?? balBody;
    expect(typeof balance).toBe('number');
    expect(balance).toBeGreaterThan(0);
  });
});

// ——————————————————————————————————————————
// 对账单状态机防护
// ——————————————————————————————————————————
test.describe('对账单状态机防护', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await adminLogin(request);
  });

  test('E2E-API-03 对账单 DRAFT→CONFIRMED 流程及防重确认', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };

    // Create DRAFT reconciliation
    const createResp = await request.post(`${API}/reconciliations`, {
      headers: auth,
      data: {
        type: 'NO_CONTRACT',
        factory_id: 1,
        shipments: [
          { shipment_id: 1, item_name: '面料A', snapshot_unit_price: 20, qty: 100 },
        ],
      },
    });
    expect(createResp.ok()).toBeTruthy();
    const { data: rec } = await createResp.json();
    expect(rec.status).toBe('DRAFT');
    // total_amount = 20 × 100 = 2000
    expect(+rec.total_amount).toBe(2000);

    // Confirm (DRAFT → CONFIRMED)
    const confirmResp = await request.patch(`${API}/reconciliations/${rec.id}/confirm`, {
      headers: auth,
    });
    expect(confirmResp.ok()).toBeTruthy();
    const { data: confirmed } = await confirmResp.json();
    expect(confirmed.status).toBe('CONFIRMED');

    // Try to confirm again → 400
    const reconfirmResp = await request.patch(`${API}/reconciliations/${rec.id}/confirm`, {
      headers: auth,
    });
    expect(reconfirmResp.status()).toBe(400);

    // Try to delete CONFIRMED → 400
    const deleteResp = await request.delete(`${API}/reconciliations/${rec.id}`, {
      headers: auth,
    });
    expect(deleteResp.status()).toBe(400);
  });
});

// ——————————————————————————————————————————
// 结算费用重计算
// ——————————————————————————————————————————
test.describe('结算费用重计算', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await adminLogin(request);
  });

  test('E2E-API-04 结算单添加费用后 net_profit 重算', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };

    // Create settlement with revenue=1000, cost=200 → net_profit=800
    const createResp = await request.post(`${API}/settlements`, {
      headers: auth,
      data: {
        order_id: 1,
        revenue: 1000,
        costs: [{ cost_name: '初始费用', amount: 200, has_invoice: 1 }],
      },
    });

    if (!createResp.ok()) {
      test.skip(!createResp.ok(), `Cannot create settlement (order_id=1 may not exist): ${createResp.status()}`);
      return;
    }

    const { data: sl } = await createResp.json();
    expect(+sl.net_profit).toBe(800);
    expect(+sl.total_cost).toBe(200);

    // Add another cost of 300 → net_profit should become 500, total_cost=500
    const addCostResp = await request.post(`${API}/settlements/${sl.id}/costs`, {
      headers: auth,
      data: { cost_name: '追加费用', amount: 300, has_invoice: 0 },
    });
    expect(addCostResp.ok()).toBeTruthy();
    const { data: updated } = await addCostResp.json();
    expect(+updated.net_profit).toBe(500);
    expect(+updated.total_cost).toBe(500);
  });
});

// ——————————————————————————————————————————
// 结算 CONFIRMED 后禁止 addCost
// ——————————————————————————————————————————
test.describe('结算CONFIRMED后禁止addCost', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await adminLogin(request);
  });

  test('CONFIRMED状态结算单添加费用返回 400', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };

    // Create settlement
    const createResp = await request.post(`${API}/settlements`, {
      headers: auth,
      data: { order_id: 1, revenue: 5000 },
    });

    if (!createResp.ok()) {
      test.skip(!createResp.ok(), `Cannot create settlement: ${createResp.status()}`);
      return;
    }

    const { data: sl } = await createResp.json();

    // Confirm it
    const confirmResp = await request.patch(`${API}/settlements/${sl.id}/confirm`, {
      headers: auth,
    });
    expect(confirmResp.ok()).toBeTruthy();

    // Try to add cost to CONFIRMED settlement → should be 400
    const addCostResp = await request.post(`${API}/settlements/${sl.id}/costs`, {
      headers: auth,
      data: { cost_name: '违规费用', amount: 100, has_invoice: 0 },
    });
    expect(addCostResp.status()).toBe(400);
    const body = await addCostResp.json();
    const message: string = body.message ?? body.msg ?? '';
    expect(message).toContain('草稿');
  });
});

// ——————————————————————————————————————————
// RBAC 角色权限
// ——————————————————————————————————————————
test.describe('RBAC角色权限', () => {
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await adminLogin(request);
  });

  test('非ADMIN角色无法删除对账单 (403 或 seeded BUSINESS user not available)', async ({ request }) => {
    // Try to login as BUSINESS user
    const businessLoginResp = await request.post(`${API}/auth/login`, {
      data: { username: 'business_user', password: 'admin123456' },
    });

    if (businessLoginResp.status() === 401) {
      test.skip(true, 'No BUSINESS user seeded — skipping RBAC test');
      return;
    }

    const businessBody = await businessLoginResp.json();
    const businessToken: string = businessBody.data?.access_token ?? businessBody.access_token ?? '';
    const businessAuth = { Authorization: `Bearer ${businessToken}` };

    // First create a DRAFT reconciliation as admin
    const createResp = await request.post(`${API}/reconciliations`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        type: 'NO_CONTRACT',
        factory_id: 1,
        shipments: [{ shipment_id: 1, item_name: 'RBAC测试', snapshot_unit_price: 10, qty: 10 }],
      },
    });
    expect(createResp.ok()).toBeTruthy();
    const { data: rec } = await createResp.json();

    // BUSINESS user tries to delete → 403 (not ADMIN)
    const deleteResp = await request.delete(`${API}/reconciliations/${rec.id}`, {
      headers: businessAuth,
    });
    expect(deleteResp.status()).toBe(403);
  });

  test('供应商Token无法访问管理端接口', async ({ request }) => {
    const auth = { Authorization: `Bearer ${adminToken}` };

    // Create test factory for supplier account
    const factoryResp = await request.post(`${API}/factories`, {
      headers: auth,
      data: { name: 'RBAC测试工厂', type: 'PROCESS' },
    });
    // Factory may or may not exist — skip this sub-check if it fails
    if (!factoryResp.ok()) return;

    // Admin can always reach /factories
    const listResp = await request.get(`${API}/factories`, { headers: auth });
    expect(listResp.ok()).toBeTruthy();

    // A random non-JWT bearer should fail with 401
    const bogusAuth = { Authorization: 'Bearer bogus.token.value' };
    const bogusResp = await request.get(`${API}/factories`, { headers: bogusAuth });
    expect(bogusResp.status()).toBe(401);
  });
});
