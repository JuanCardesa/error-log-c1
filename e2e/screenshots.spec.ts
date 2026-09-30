import { test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { seedDemoNotebook } from '../src/lib/db/demoNotebook';
import { notebookNote } from '../src/lib/db/schema';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

/**
 * Capturas para el README. No es una prueba: se ejecuta con `pnpm screenshots` y
 * sobrescribe docs/screenshots/. Va aparte para no ensuciar la suite de e2e.
 */

const SHOTS = [
  { path: '/registrar', file: 'registrar.png' },
  { path: '/errores', file: 'errores.png' },
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
        fullPage: false,
      });
    });
  }

  test('capturas de Notebook: lector y búsqueda', async ({ page }) => {
    const db = createDb(E2E_DB);
    let readerPath: string;
    try {
      seedDemoNotebook(db, new Date().toISOString());
      const note = db.select().from(notebookNote).all()
        .find((item) => item.title === 'Oraciones enfáticas con it');
      if (note === undefined) throw new Error('Falta el apunte de la captura');
      readerPath = notebookNoteHref(note);
    } finally {
      db.$client.close();
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(readerPath);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'docs/screenshots/notebook-lector.png', fullPage: false });

    await page.goto('/notebook?q=preposici%C3%B3n');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'docs/screenshots/notebook-busqueda.png', fullPage: false });
  });
});
