import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './demo-e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 }, actionTimeout: 10_000,
    locale: 'es-ES', timezoneId: 'Europe/Madrid', trace: 'retain-on-failure' },
});
