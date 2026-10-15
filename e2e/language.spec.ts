import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { loadDataset } from '../src/lib/db/load';
import { createNotebookNote, deleteNotebookNote, getNotebookNote } from '../src/lib/db/notebookRepo';
import { LOCALE_COOKIE } from '../src/lib/i18n';
import type { NotebookNote } from '../src/lib/notebook/types';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

/**
 * Idioma de la interfaz. El resto de pruebas fija el español con la cookie de Ajustes;
 * aquí se parte de un navegador sin preferencia, como una instalación nueva, y además
 * en español: el idioma del navegador no decide el de la app.
 */
test.use({ storageState: { cookies: [], origins: [] }, locale: 'es-ES' });

let note: NotebookNote;

test.beforeEach(() => {
  const db = createDb(E2E_DB);
  try {
    note = createNotebookNote(db, {
      uid: randomUUID(), title: `Modales en pasado ${randomUUID().slice(0, 8)}`, folderId: null, tags: ['gramática'],
      contentMarkdown: '## Deducción\n\nLa regla se escribió en español y así se queda.',
    }, new Date().toISOString()).note;
  } finally { db.$client.close(); }
});

test.afterEach(() => {
  const db = createDb(E2E_DB);
  try {
    const current = getNotebookNote(db, note.id);
    if (current !== null) deleteNotebookNote(db, { id: current.id, uid: current.uid, expectedRevision: current.revision });
  } finally { db.$client.close(); }
});

test('sin preferencia, la interfaz está en inglés y el contenido del usuario no cambia', async ({ page }) => {
  await page.goto('/registrar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1, name: 'Sessions' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Errors', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /New manual session/ })).toBeVisible();

  // Un apunte escrito en español se lee tal cual; solo cambian los controles.
  await page.goto(notebookNoteHref(note));
  await expect(page.getByRole('heading', { level: 1, name: note.title })).toBeVisible();
  await expect(page.getByText('La regla se escribió en español y así se queda.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Tags' }).getByText('gramática')).toBeVisible();

  // Lo mismo en un error guardado: etiquetas en inglés, su regla como se escribió.
  const db = createDb(E2E_DB);
  let error;
  try { error = loadDataset(db).errors[0]; } finally { db.$client.close(); }
  if (error === undefined) throw new Error('la base de pruebas trae errores');
  await page.goto(`/errores?error=${String(error.id)}`);
  const panel = page.getByRole('complementary', { name: 'Error details' });
  await expect(panel.getByText('Rule', { exact: true })).toBeVisible();
  await expect(panel.getByText(error.ruleNote)).toBeVisible();
});

test('se cambia a español en Ajustes al momento, se conserva al recargar y se vuelve al inglés', async ({ page, context }) => {
  await page.goto('/registrar');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const english = page.getByRole('radio', { name: 'English' });
  const spanish = page.getByRole('radio', { name: 'Español' });
  await expect(english).toHaveAttribute('aria-checked', 'true');

  // Una marca en `window` sobrevive solo si no se recarga la página.
  await page.evaluate(() => { (window as Window & { sinRecarga?: boolean }).sinRecarga = true; });
  await spanish.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Sesiones', exact: true })).toBeVisible();
  await expect(spanish).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => (window as Window & { sinRecarga?: boolean }).sinRecarga)).toBe(true);

  // La preferencia dura: cookie de un año, y la página recargada sale ya en español.
  const cookie = (await context.cookies()).find((item) => item.name === LOCALE_COOKIE);
  expect(cookie?.value).toBe('es');
  expect(cookie?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 3600);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();

  // Otras vistas también cambian; el apunte sigue igual.
  await page.goto(notebookNoteHref(note));
  await expect(page.getByRole('link', { name: 'Editar', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: note.title })).toBeVisible();

  await page.goto('/ajustes');
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
});

test('los mensajes del servidor llegan en el idioma elegido', async ({ page }) => {
  await page.goto('/registrar');
  await page.getByRole('button', { name: /New manual session/ }).click();
  const drawer = page.getByRole('complementary', { name: 'New session' });
  await drawer.getByLabel('Items attempted').fill('5');
  await drawer.getByLabel('Correct', { exact: true }).fill('8');
  await drawer.getByRole('button', { name: 'Create session' }).click();
  await expect(drawer.getByText('You can’t get more items right than you attempted')).toBeVisible();
});
