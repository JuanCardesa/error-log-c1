import { defineConfig, devices } from '@playwright/test';

import { E2E_DB } from './e2e/globalSetup';

const PORT = 3210;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] !== undefined ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] !== undefined ? 'github' : 'list',

  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  globalSetup: './e2e/globalSetup.ts',

  webServer: {
    command: `pnpm build && pnpm exec next start --port ${String(PORT)}`,
    port: PORT,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 180_000,
    // La app sirve la base desechable, no la del usuario.
    env: { DB_FILE_OVERRIDE: E2E_DB },
  },
});
