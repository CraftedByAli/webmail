import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT || 3200;
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end tests run the real Next.js app against the in-memory mock mail
 * provider, so CI needs no Mailcow. Set E2E_BASE_URL to test a deployed
 * instance instead (credentials via E2E_EMAIL / E2E_PASSWORD).
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.js/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.js/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Production build so the tests exercise the real CSP and bundling.
        command: process.env.E2E_DEV
          ? `npx next dev --port ${PORT}`
          : `npx next build && npx next start --port ${PORT}`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: {
          MAIL_PROVIDER: 'mock',
          ALLOW_MOCK_PROVIDER: 'true',
          SESSION_SECRET: 'e2e-secret-0123456789abcdef0123456789abcdef',
          APP_URL: baseURL,
          DATABASE_PATH: './data/e2e.db',
          UPLOAD_DIR: './data/e2e-uploads',
          LOG_LEVEL: 'warn',
          MAIL_IMAP_HOST: 'imap.test',
          MAIL_SMTP_HOST: 'smtp.test',
          ADMIN_EMAILS: 'test@example.com',
        },
      },
});
