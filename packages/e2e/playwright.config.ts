import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  fullyParallel: false,
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter api dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter web dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-h5',
      use: { ...devices['Pixel 5'], baseURL: process.env.PORTAL_URL ?? 'http://localhost:5174' },
    },
  ],
});
