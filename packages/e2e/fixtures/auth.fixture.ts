import { test as base, expect, Page } from '@playwright/test';

interface AuthFixtures {
  adminPage: Page;
}

export const test = base.extend<AuthFixtures>({
  adminPage: async ({ page }, use) => {
    // Navigate to login and authenticate as admin
    await page.goto('/login');
    await page.fill('[placeholder="请输入用户名"]', 'admin');
    await page.fill('[placeholder="请输入密码"]', 'admin123456');
    await page.click('button[type="submit"]');
    // Wait for redirect to dashboard after successful login
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    await use(page);
  },
});

export { expect } from '@playwright/test';
