import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { createNotebookFolder, createNotebookNote, deleteNotebookNote } from '../src/lib/db/notebookRepo';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

/**
 * Notebook se lee en el portátil, en la tableta y en el móvil. Lo que se comprueba es la
 * misma propiedad que en mobile.spec.ts —ninguna pantalla obliga a desplazarse en
 * horizontal— sobre el contenido que más tira del ancho: una tabla de cinco columnas,
 * una URL sin espacios, un bloque de código largo y un título de apunte que no cabe.
 *
 * El índice ocupa una columna en escritorio y se despliega en pantallas más estrechas.
 */

const VIEWPORTS = [
  { label: 'escritorio', width: 1440, height: 900 },
  { label: 'tableta', width: 834, height: 1112 },
  { label: 'móvil', width: 390, height: 844 },
] as const;

const LONG_URL = 'https://example.com/gramatica/modales/perfectos/deducciones-sobre-el-pasado-sin-un-solo-espacio-en-toda-la-ruta';

const CONTENT = [
  '# Deducciones sobre el pasado con modales perfectos',
  '',
  'Referencia: <' + LONG_URL + '>.',
  '',
  'El identificador interno es `deduccionesSobreElPasadoConModalesPerfectosYSusMatices` en el glosario.',
  '',
  '## Tabla de contraste',
  '',
  '| Forma | Ejemplo en contexto | Qué comunica | Registro | Error típico |',
  '| --- | --- | --- | --- | --- |',
  '| must have + participio | He must have left the keys at the office last night. | Deducción casi segura sobre el pasado. | Neutro | Usar "must had" en lugar del participio. |',
  '| can\'t have + participio | She can\'t have finished the whole report in ten minutes. | Imposibilidad deducida, no prohibición. | Neutro | Confundirlo con "mustn\'t have". |',
  '| might have + participio | They might have missed the last train home. | Posibilidad abierta, sin compromiso. | Informal | Sustituirlo por "may be" en pasado. |',
  '',
  '## Bloque de código',
  '',
  '```',
  'const deduccion = "must have left the keys at the office last night without telling anyone at all";',
  '```',
  '',
  '## Cierre',
  '',
  'Una última explicación para que el apunte tenga altura suficiente y el índice deba seguir el scroll.',
].join('\n');

let noteHref = '';

test.beforeAll(() => {
  const db = createDb(E2E_DB);
  try {
    const at = new Date().toISOString();
    const parent = createNotebookFolder(db, { name: `Gramática avanzada ${randomUUID().slice(0, 8)}`, parentId: null }, at);
    const child = createNotebookFolder(db, { name: 'Modales perfectos y su contraste', parentId: parent.id }, at);
    const note = createNotebookNote(db, {
      uid: randomUUID(),
      title: 'Deducciones sobre el pasado con modales perfectos',
      folderId: child.id,
      tags: ['modales-perfectos', 'deducciones', 'part4'],
      contentMarkdown: CONTENT,
    }, at).note;
    noteHref = notebookNoteHref(note);
  } finally { db.$client.close(); }
});

/** Píxeles que la página desborda a lo ancho; 0 o menos significa que se lee sin arrastrarla. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const viewport of VIEWPORTS) {
  test(`las pantallas de Notebook se leen sin desplazamiento horizontal en ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const routes = [
      '/notebook',
      '/notebook?q=deducci%C3%B3n',
      noteHref,
      `${noteHref}/editar`,
      '/notebook/nuevo',
      '/notebook/importar',
    ];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      const overflow = await horizontalOverflow(page);
      expect(overflow, `${route} desborda ${String(overflow)}px en ${viewport.label}`).toBeLessThanOrEqual(0);
    }
  });
}

test('el índice es lateral en escritorio y desplegable en tableta y móvil', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(noteHref);
  const toc = page.getByRole('navigation', { name: 'Índice del apunte' });
  await expect(toc).toHaveCount(1);
  await expect(toc.getByRole('link', { name: 'Tabla de contraste' })).toBeVisible();
  await expect(page.locator('article').getByRole('navigation', { name: 'Índice del apunte' })).toHaveCount(0);
  await expect(page.locator('[data-study-content]').getByRole('navigation', { name: 'Índice del apunte' })).toHaveCount(0);

  for (const { label, width, height } of [
    { label: 'tableta', width: 834, height: 1112 },
    { label: 'móvil', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(noteHref);
    // Cerrado no hay índice a la vista: en ese ancho el sitio es del texto.
    await expect(toc, `el índice sigue abierto en ${label}`).toHaveCount(0);
    await page.locator('summary').filter({ hasText: 'En esta nota' }).click();
    await expect(toc).toHaveCount(1);
    await toc.getByRole('link', { name: 'Cierre' }).click();
    await expect(page).toHaveURL(/#nb-cierre$/u);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  }
});

test('entre 1024 y 1279 el índice cerrado queda encima del folio en la columna lectora', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(noteHref);
  const summary = page.locator('summary').filter({ hasText: 'En esta nota' });
  const article = page.locator('article');
  await expect(summary).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Índice del apunte' })).toHaveCount(0);
  const [tocBox, articleBox] = await Promise.all([summary.boundingBox(), article.boundingBox()]);
  if (tocBox === null || articleBox === null) throw new Error('Falta el índice o el folio');
  expect(tocBox.y + tocBox.height).toBeLessThan(articleBox.y);
  expect(tocBox.x).toBeGreaterThanOrEqual(articleBox.x);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('sin encabezados no se reserva la columna del índice', async ({ page }) => {
  const db = createDb(E2E_DB);
  const plain = createNotebookNote(db, {
    uid: randomUUID(), title: 'Apunte sin apartados', folderId: null, tags: [], contentMarkdown: 'Solo texto.',
  }, new Date().toISOString()).note;
  db.$client.close();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(noteHref);
    const withToc = await page.locator('article').boundingBox();
    await page.goto(notebookNoteHref(plain));
    await expect(page.getByRole('navigation', { name: 'Índice del apunte' })).toHaveCount(0);
    const withoutToc = await page.locator('article').boundingBox();
    if (withToc === null || withoutToc === null) throw new Error('Falta el folio');
    expect(withoutToc.width).toBeGreaterThan(withToc.width);
  } finally {
    const cleanup = createDb(E2E_DB);
    try { deleteNotebookNote(cleanup, { id: plain.id, uid: plain.uid, expectedRevision: plain.revision }); }
    finally { cleanup.$client.close(); }
  }
});

test('una tabla ancha se desplaza dentro de su envoltorio sin arrastrar el apunte', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(noteHref);
  const table = page.getByRole('region', { name: 'Tabla del apunte' });
  await expect(table).toBeVisible();

  // La tabla no cabe: quien scrollea es su envoltorio, no la página.
  expect(await table.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await table.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  expect(await table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
