import { test } from '@playwright/test';

/**
 * Capturas para el README. No es una prueba: se ejecuta con `pnpm screenshots` y
 * sobrescribe docs/screenshots/. Va aparte para no ensuciar la suite de e2e.
 */

const SHOTS = [
  { path: '/registrar', file: 'registrar.png' },
  { path: '/informe', file: 'informe.png' },
  { path: '/ruoe', file: 'ruoe.png' },
  { path: '/anki', file: 'anki.png' },
] as const;

test.describe('capturas', () => {
  test.skip(process.env['SHOOT'] === undefined, 'solo con SHOOT=1');

  for (const shot of SHOTS) {
    test(`captura ${shot.file}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(shot.path);
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        path: `docs/screenshots/${shot.file}`,
        fullPage: true,
      });
    });
  }
});
