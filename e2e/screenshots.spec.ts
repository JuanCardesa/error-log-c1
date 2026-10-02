import { test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { seedDemoNotebook } from '../src/lib/db/demoNotebook';
import { saveNotebookAnnotation } from '../src/lib/db/notebookRepo';
import { notebookNote } from '../src/lib/db/schema';
import { studyAnchor } from '../src/lib/notebook/annotations';
import { notebookStudyText } from '../src/lib/notebook/studyMarkdown';
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
      const text = notebookStudyText(note.contentMarkdown);
      const quote = 'si el complemento necesita una preposición, la oración enfática también la necesita.';
      const start = text.indexOf(quote);
      if (start < 0) throw new Error('Falta la regla que se resalta en la captura');
      saveNotebookAnnotation(db, {
        noteId: note.id, uid: note.uid, expectedRevision: note.revision,
        anchor: studyAnchor(text, start, start + quote.length),
        command: { kind: 'highlight', enabled: true },
      }, new Date().toISOString());
      readerPath = notebookNoteHref(note);
    } finally {
      db.$client.close();
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(readerPath);
    await page.waitForLoadState('networkidle');
    // Keep the linked correction visible: it is the reason to show this note in the README.
    await page.screenshot({ path: 'docs/screenshots/notebook-lector.png', fullPage: true });

    await page.goto('/notebook?q=preposici%C3%B3n');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'docs/screenshots/notebook-busqueda.png', fullPage: false });
  });
});
