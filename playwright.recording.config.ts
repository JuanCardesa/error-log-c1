import { defineConfig } from '@playwright/test';

import { LOCALE_COOKIE } from './src/lib/i18n';

export default defineConfig({
  testDir: './demo-e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 }, actionTimeout: 10_000,
    locale: 'es-ES', timezoneId: 'Europe/Madrid', trace: 'retain-on-failure',
    // La demo se grabó con la interfaz en español: se fija como lo haría Ajustes.
    storageState: {
      cookies: [{
        name: LOCALE_COOKIE, value: 'es', domain: '127.0.0.1', path: '/',
        expires: -1, httpOnly: false, secure: false, sameSite: 'Lax',
      }],
      origins: [],
    } },
});
