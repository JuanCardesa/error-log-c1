import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { loadDataset } from '../src/lib/db/load';
import { createNotebookNote, deleteNotebookNote, getNotebookNote } from '../src/lib/db/notebookRepo';
import { CSV_EXPORTS } from '../src/lib/export/dump';
import { LOCALE_COOKIE } from '../src/lib/i18n';
import { notebookNoteFileName } from '../src/lib/notebook/export';
import type { NotebookNote } from '../src/lib/notebook/types';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';
import { readZipEntries } from './zip';

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

test('recorre las secciones y sus vistas secundarias en inglés', async ({ page }) => {
  await page.goto('/registrar');
  const navigation = page.getByRole('navigation', { name: 'Sections' });

  await navigation.getByRole('link', { name: 'Errors', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Errors' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Category', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'False certainties', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search false certainties' })).toBeVisible();

  await navigation.getByRole('link', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Progress views' })
    .getByRole('link', { name: 'Reading & Use of English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Accuracy by part and week', exact: true })).toBeVisible();

  await navigation.getByRole('link', { name: 'Anki', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Anki views' }).getByRole('link', { name: 'Reviews', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Reviews in Anki', exact: true })).toBeVisible();

  await navigation.getByRole('link', { name: 'Notebook', exact: true }).click();
  await expect(page.getByRole('link', { name: 'New note', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Import .md', exact: true })).toBeVisible();

  await navigation.getByRole('link', { name: 'Writing', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Import Writing', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Status' }).getByRole('link', { name: /^Awaiting \(\d+\)$/ })).toBeVisible();
  await page.getByRole('link', { name: 'Rewrites', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Rewrite period' })).toBeVisible();

  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Export data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CSV reports', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download full data as JSON' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download the notebook as a ZIP' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

async function expectLanguage(page: Page, locale: 'en' | 'es', title: string) {
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: locale === 'en' ? 'Sections' : 'Secciones' })).toBeVisible();
}

test('Atrás y Adelante actualizan las vistas visitadas al cambiar de idioma sin recargar', async ({ page }) => {
  await page.goto('/registrar');
  await page.evaluate(() => { (window as Window & { sinRecarga?: boolean }).sinRecarga = true; });
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Errors', exact: true }).click();
  await expectLanguage(page, 'en', 'Errors');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();

  for (const locale of ['es', 'en'] as const) {
    await page.getByRole('radio', { name: locale === 'es' ? 'Español' : 'English' }).click();
    await expectLanguage(page, locale, locale === 'es' ? 'Ajustes' : 'Settings');
    await page.goBack();
    await expectLanguage(page, locale, locale === 'es' ? 'Errores' : 'Errors');
    // El título viene del servidor; el botón usa el contexto de cliente.
    await expect(page.getByRole('button', { name: locale === 'es' ? 'Categoría' : 'Category', exact: true })).toBeVisible();
    await page.goBack();
    await expectLanguage(page, locale, locale === 'es' ? 'Sesiones' : 'Sessions');
    await expect(page.getByRole('button', { name: locale === 'es' ? /Nueva sesión manual/ : /New manual session/ })).toBeVisible();
    await page.goForward();
    await expectLanguage(page, locale, locale === 'es' ? 'Errores' : 'Errors');
    await page.goForward();
    await expectLanguage(page, locale, locale === 'es' ? 'Ajustes' : 'Settings');
    expect(await page.evaluate(() => (window as Window & { sinRecarga?: boolean }).sinRecarga)).toBe(true);
  }
});

/** Solo cambia el instante de la descarga; las fechas de los datos se comparan intactas. */
function withoutExportTime(text: string): string {
  const { exportedAt, ...data } = JSON.parse(text) as Record<string, unknown>;
  expect(exportedAt).toEqual(expect.any(String));
  expect(new Date(String(exportedAt)).toISOString()).toBe(exportedAt);
  return JSON.stringify(data);
}

test('cambiar la preferencia no altera JSON, CSV, Markdown ni el contenido del ZIP', async ({ page }) => {
  const files = ['dump.json', ...CSV_EXPORTS.map((key) => `${key}.csv`), `notebook-${String(note.id)}.md`, 'notebook.zip'];
  const download = async (file: string) => {
    const response = await page.request.get(`/exportar/${file}`);
    expect(response.ok(), file).toBe(true);
    return {
      type: response.headers()['content-type'],
      disposition: response.headers()['content-disposition'],
      body: await response.body(),
    };
  };

  await page.goto('/ajustes');
  await expectLanguage(page, 'en', 'Settings');
  const english = new Map<string, Awaited<ReturnType<typeof download>>>();
  for (const file of files) english.set(file, await download(file));

  await page.getByRole('radio', { name: 'Español' }).click();
  await expectLanguage(page, 'es', 'Ajustes');
  for (const file of files) {
    const before = english.get(file);
    if (before === undefined) throw new Error(`Falta la descarga inglesa de ${file}`);
    const after = await download(file);
    expect(after.type, file).toBe(before.type);
    expect(after.disposition, file).toBe(before.disposition);

    if (file === 'dump.json') {
      expect(withoutExportTime(after.body.toString('utf8'))).toBe(withoutExportTime(before.body.toString('utf8')));
      expect(after.body.toString('utf8')).toContain(JSON.stringify(note.contentMarkdown));
    } else if (file === 'notebook.zip') {
      // El contenedor tiene fechas de generación; comparamos rutas y todos sus ficheros.
      const enEntries = readZipEntries(before.body);
      const esEntries = readZipEntries(after.body);
      const manifest = 'Notebook/manifest.json';
      for (const entries of [enEntries, esEntries]) {
        expect(entries.get(`Notebook/${notebookNoteFileName(note)}`)?.toString('utf8')).toContain(note.contentMarkdown);
        const content = entries.get(manifest);
        if (content === undefined) throw new Error('El ZIP debe contener su manifiesto');
        entries.set(manifest, Buffer.from(withoutExportTime(content.toString('utf8'))));
      }
      expect(esEntries).toEqual(enEntries);
    } else {
      // Incluye cabeceras CSV, BOM, valores internos y todos los bytes del Markdown.
      expect(after.body, file).toEqual(before.body);
    }
  }
});
