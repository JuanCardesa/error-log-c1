import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { expect, test, type Browser, type Response } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { loadDataset } from '../src/lib/db/load';
import { createNotebookNote } from '../src/lib/db/notebookRepo';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

/**
 * Rendimiento de Notebook que se puede comprobar sin cronómetro (TASK 7.2). Los tiempos
 * los da `pnpm bench:notebook`; aquí, lo que los explica.
 *
 * Qué JavaScript descarga cada pantalla. El lector se pinta en el servidor: no
 * necesita ni el parser de Markdown ni el renderizador, que solo el editor debe traer para
 * su vista previa. Tampoco el panel del error, que solo normaliza una consulta.
 *
 * Se comprueba buscando en los scripts descargados una cadena que delata cada pieza; que
 * el editor sí las contenga demuestra que las marcas siguen valiendo tras actualizar
 * dependencias. Los tamaños se anotan, pero no se fijan: dependen de la versión de Next.
 */

const MARKERS = {
  /** Nombre de token de micromark-extension-gfm-table: el parser que usa remark-gfm. */
  parser: 'tableDelimiterRow',
  /** Etiqueta de las tablas en `MarkdownRenderer`: react-markdown y sus componentes. */
  renderer: 'Tabla del apunte',
  /** Prefijo de los borradores locales del editor. */
  editor: 'errorlog:notebook:draft:',
} as const;

type Piece = keyof typeof MARKERS;

interface Loaded {
  readonly has: (piece: Piece) => boolean;
  readonly kib: number;
  readonly gzipKib: number;
}

/** Cada ruta en un contexto limpio: sin caché, se ven todos los scripts que pide. */
async function load(browser: Browser, path: string): Promise<Loaded> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const bodies: Array<Promise<string>> = [];
    page.on('response', (response: Response) => {
      if (response.request().resourceType() === 'script') bodies.push(response.text().catch(() => ''));
    });
    await page.goto(path, { waitUntil: 'networkidle' });
    const scripts = await Promise.all(bodies);
    const bytes = scripts.reduce((total, body) => total + Buffer.byteLength(body), 0);
    const gzip = scripts.reduce((total, body) => total + gzipSync(body).length, 0);
    return {
      has: (piece) => scripts.some((body) => body.includes(MARKERS[piece])),
      kib: bytes / 1024,
      gzipKib: gzip / 1024,
    };
  } finally { await context.close(); }
}

test('el lector y el panel del error no descargan el parser, el renderizador ni el editor', async ({ browser }) => {
  const db = createDb(E2E_DB);
  let href: string;
  let errorId: number;
  try {
    const note = createNotebookNote(db, {
      uid: randomUUID(), title: `Apunte del bundle ${randomUUID().slice(0, 8)}`, folderId: null, tags: [],
      contentMarkdown: '## Apartado\n\n| Forma | Uso |\n| --- | --- |\n| must have | deducción |\n\nTexto con **formato**.',
    }, new Date().toISOString()).note;
    href = notebookNoteHref(note);
    errorId = loadDataset(db).errors[0]?.id ?? 0;
  } finally { db.$client.close(); }

  const editor = await load(browser, `${href}/editar`);
  const reader = await load(browser, href);
  const home = await load(browser, '/notebook');
  const panel = await load(browser, `/errores?error=${String(errorId)}`);

  // Las marcas siguen siendo válidas: el editor trae las tres piezas.
  for (const piece of Object.keys(MARKERS) as Piece[]) expect(editor.has(piece), `editor sin ${piece}`).toBe(true);

  for (const piece of Object.keys(MARKERS) as Piece[]) expect(reader.has(piece), `lector con ${piece}`).toBe(false);
  expect(home.has('parser')).toBe(false);
  expect(home.has('renderer')).toBe(false);
  expect(panel.has('parser')).toBe(false);
  expect(panel.has('renderer')).toBe(false);
  // El lector descarga bastante menos que el editor.
  expect(reader.kib).toBeLessThan(editor.kib);

  for (const [name, loaded] of Object.entries({ lector: reader, editor, portada: home, 'panel del error': panel })) {
    test.info().annotations.push({
      type: 'bundle',
      description: `${name}: ${loaded.kib.toFixed(0)} KiB de JS (${loaded.gzipKib.toFixed(0)} KiB gzip)`,
    });
  }
});

test('el editor solo pinta la vista previa cuando está a la vista', async ({ page }) => {
  const db = createDb(E2E_DB);
  let href: string;
  try {
    href = notebookNoteHref(createNotebookNote(db, {
      uid: randomUUID(), title: `Vista previa perezosa ${randomUUID().slice(0, 8)}`, folderId: null, tags: [],
      contentMarkdown: '## Apartado\n\nTexto con **formato**.',
    }, new Date().toISOString()).note);
  } finally { db.$client.close(); }

  // Oculta se volvía a parsear en cada pulsación: en un apunte de 75 KiB, 146 ms por tecla.
  await page.goto(`${href}/editar`);
  const preview = page.locator('#notebook-panel-preview');
  await page.getByRole('textbox', { name: 'Contenido Markdown' }).fill('## Otro apartado\n\nMás texto.');
  await expect(preview.locator('article')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Vista previa' }).click();
  await expect(preview.getByRole('heading', { name: 'Otro apartado' })).toBeVisible();
  await page.getByRole('tab', { name: 'Editar' }).click();
  await expect(preview.locator('article')).toHaveCount(0);
});
