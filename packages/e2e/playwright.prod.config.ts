import { defineConfig, devices } from '@playwright/test';

// 针对已部署环境的只读验收（默认打生产）。与 playwright.config.ts 的区别：
// 不拉起本地 api/web、不做 global-setup 造数，测试仅浏览不落库。
export default defineConfig({
  testDir: './prod',
  timeout: 60000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://123.57.87.30',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
