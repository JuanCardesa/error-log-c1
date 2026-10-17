import { defineConfig, devices } from '@playwright/test';

import { LOCALE_COOKIE } from './src/lib/i18n';

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
    // La interfaz arranca en inglés. Estas pruebas se escribieron sobre la española y la
    // fijan con la misma cookie que guarda Ajustes; `language.spec.ts` prueba el inglés.
    storageState: {
      cookies: [{
        name: LOCALE_COOKIE, value: 'es', domain: 'localhost', path: '/',
        expires: -1, httpOnly: false, secure: false, sameSite: 'Lax',
      }],
      origins: [],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  globalSetup: './e2e/globalSetup.ts',

});
