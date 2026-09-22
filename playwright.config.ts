import { defineConfig, devices } from '@playwright/test';

import { FAKE_ANKI_PORT, FAKE_ANKI_URL } from './e2e/fakeAnki';
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

  webServer: [
    // El doble de AnkiConnect. La app solo puede hablar con el porque `ankiConfig`
    // ignora `ANKI_CONNECT_URL` cuando ERRORLOG_E2E esta puesto.
    {
      command: 'pnpm exec tsx e2e/fakeAnki.run.ts',
      port: FAKE_ANKI_PORT,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm build && pnpm exec next start --hostname 127.0.0.1 --port ${String(PORT)}`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      // La app sirve la base desechable, no la del usuario.
      env: { DB_FILE_OVERRIDE: E2E_DB, ERRORLOG_E2E: '1', ERRORLOG_ANKI_FAKE_URL: FAKE_ANKI_URL },
    },
  ],
});
