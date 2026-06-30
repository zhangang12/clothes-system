import { test, expect } from '@playwright/test';

/**
 * E2E-01: 完整业务链路
 * 创建工厂 → 创建客户 → 开样衣 → 报价 → 建订单 → 发合同 → 供应商确认 → 对账 → 付款 → 结算
 */
test.describe('E2E-01: 完整业务链路', () => {
  test.skip(process.env.CI === 'true', 'E2E tests run in Phase 8');

  test('管理员登录后可访问工作台', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[placeholder="请输入用户名"]', 'admin');
    await page.fill('[placeholder="请输入密码"]', 'admin123456');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  // TODO Phase 8: implement full chain test
});
