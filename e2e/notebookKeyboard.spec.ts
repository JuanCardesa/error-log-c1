import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { loadDataset } from '../src/lib/db/load';
import { createNotebookFolder, createNotebookNote, deleteNotebookNote } from '../src/lib/db/notebookRepo';
import { createError, deleteError } from '../src/lib/db/repo';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

/**
 * Notebook se maneja sin ratón: el índice y las pestañas del editor ya aparecen en sus
 * propios specs, y aquí quedan los sitios donde el teclado se puede perder —el envoltorio
 * de una tabla, un formulario dentro de un `details` y el Escape con un selector abierto
 * dentro del panel del error—, más el diálogo modal de borrado.
 */

const TABLE_NOTE = [
  '| Forma | Ejemplo en contexto | Qué comunica | Registro | Error típico |',
  '| --- | --- | --- | --- | --- |',
  '| must have | He must have left the keys at the office last night. | Deducción casi segura. | Neutro | Usar "must had". |',
  '| might have | They might have missed the last train home tonight. | Posibilidad abierta. | Informal | Sustituirlo por "may be". |',
].join('\n');

test('el envoltorio de una tabla entra en el orden de tabulación y se desplaza con el teclado', async ({ page }) => {
  const db = createDb(E2E_DB);
  let href: string;
  try {
    const note = createNotebookNote(db, {
      uid: randomUUID(), title: `Tabla con teclado ${randomUUID().slice(0, 8)}`, folderId: null, tags: [],
      contentMarkdown: TABLE_NOTE,
    }, new Date().toISOString()).note;
    href = notebookNoteHref(note);
  } finally { db.$client.close(); }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(href);
  const table = page.getByRole('region', { name: 'Tabla del apunte' });
  await expect(table).toHaveAttribute('tabindex', '0');

  // Desde las acciones del apunte se llega tabulando, sin saltos ni trampas de foco.
  await page.getByRole('link', { name: 'Exportar .md' }).focus();
  let reached = false;
  for (let step = 0; step < 15 && !reached; step += 1) {
    await page.keyboard.press('Tab');
    reached = await table.evaluate((element) => element === document.activeElement);
  }
  expect(reached, 'el envoltorio de la tabla no recibe el foco al tabular').toBe(true);

  for (let press = 0; press < 5; press += 1) await page.keyboard.press('ArrowRight');
  await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
});

test('se crea una carpeta sin tocar el ratón, abriendo el desplegable con Enter', async ({ page }) => {
  const name = `Teclado ${randomUUID().slice(0, 8)}`;
  await page.goto('/notebook');
  const summary = page.locator('summary').filter({ hasText: 'Organizar carpetas' });
  await summary.focus();
  await page.keyboard.press('Enter');

  const createForm = page.getByRole('heading', { name: 'Nueva carpeta' }).locator('..');
  await expect(createForm).toBeVisible();
  await createForm.getByRole('textbox', { name: 'Nombre' }).focus();
  await page.keyboard.type(name);
  // Enter en el campo envía el formulario: no hace falta alcanzar el botón.
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/carpeta=\d+/u);
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Directorio de Notebook' }).getByRole('link', { name })).toBeVisible();
});

test('Escape cierra primero el selector de apuntes y después el panel del error', async ({ page }) => {
  const db = createDb(E2E_DB);
  let errorId: number;
  let noteId: number;
  let noteUid: string;
  let noteRevision: number;
  const title = `Apunte con teclado ${randomUUID().slice(0, 8)}`;
  try {
    const sample = loadDataset(db).errors[0];
    if (sample === undefined) throw new Error('Falta un error en el seed');
    const { id: _id, createdAt: _createdAt, ...base } = sample;
    errorId = createError(db, {
      ...base, itemRef: 'kbd-1', prompt: 'Frase para el selector con teclado',
      myAnswer: 'mi respuesta', correctAnswer: 'la corrección con teclado', confidence: 'DUDABA',
    }).id;
    const note = createNotebookNote(db, {
      uid: randomUUID(), title, folderId: null, tags: [], contentMarkdown: '## Apartado\n\nTexto.',
    }, new Date().toISOString()).note;
    noteId = note.id;
    noteUid = note.uid;
    noteRevision = note.revision;
  } finally { db.$client.close(); }

  try {
    await page.goto(`/errores?error=${String(errorId)}`);
    const panel = page.getByRole('complementary', { name: 'Detalle del error' });
    const links = panel.getByRole('region', { name: 'Apuntes vinculados' });
    const open = links.getByRole('button', { name: 'Vincular apunte' });
    await open.focus();
    await page.keyboard.press('Enter');

    const search = links.getByRole('searchbox', { name: 'Buscar apuntes' });
    await expect(search).toBeVisible();
    await search.focus();
    await page.keyboard.type(title);
    await expect(links.getByRole('list', { name: 'Apuntes encontrados' }).getByRole('button', { name: title })).toBeVisible();

    // Primer Escape: se cierra el selector y el panel sigue abierto detrás.
    await page.keyboard.press('Escape');
    await expect(search).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(open).toBeFocused();

    // Segundo Escape: ahora sí se cierra el panel del error.
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  } finally {
    const cleanup = createDb(E2E_DB);
    try {
      deleteError(cleanup, errorId);
      deleteNotebookNote(cleanup, { id: noteId, uid: noteUid, expectedRevision: noteRevision });
    } finally { cleanup.$client.close(); }
  }
});

test('las pestañas del editor siguen el patrón de foco único con Inicio y Fin', async ({ page }) => {
  const db = createDb(E2E_DB);
  let href: string;
  try {
    const note = createNotebookNote(db, {
      uid: randomUUID(), title: `Pestañas ${randomUUID().slice(0, 8)}`, folderId: null, tags: [],
      contentMarkdown: '## Apartado\n\nTexto.',
    }, new Date().toISOString()).note;
    href = notebookNoteHref(note);
  } finally { db.$client.close(); }

  await page.goto(`${href}/editar`);
  const edit = page.getByRole('tab', { name: 'Editar' });
  const preview = page.getByRole('tab', { name: 'Vista previa' });
  // Solo la pestaña activa está en el orden de tabulación; a la otra se llega con flechas.
  await expect(edit).toHaveAttribute('tabindex', '0');
  await expect(preview).toHaveAttribute('tabindex', '-1');

  await edit.focus();
  await page.keyboard.press('End');
  await expect(preview).toHaveAttribute('aria-selected', 'true');
  await expect(preview).toBeFocused();
  await expect(edit).toHaveAttribute('tabindex', '-1');
  await expect(page.getByRole('tabpanel', { name: 'Vista previa' })).toBeVisible();

  await page.keyboard.press('Home');
  await expect(edit).toHaveAttribute('aria-selected', 'true');
  await expect(edit).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toBeVisible();
});

test('el diálogo de borrar carpeta se cancela con Escape y devuelve el foco al disparador', async ({ page }) => {
  const db = createDb(E2E_DB);
  let folderId: number;
  const name = `Carpeta modal ${randomUUID().slice(0, 8)}`;
  try {
    folderId = createNotebookFolder(db, { name, parentId: null }, new Date().toISOString()).id;
  } finally { db.$client.close(); }

  await page.goto(`/notebook?carpeta=${String(folderId)}`);
  await page.locator('summary').filter({ hasText: 'Organizar carpetas' }).click();
  const trigger = page.getByRole('button', { name: 'Borrar carpeta…' });
  await trigger.click();

  const dialog = page.getByRole('alertdialog', { name: `Borrar ${name}` });
  await expect(dialog).toBeVisible();
  // El foco empieza en la opción segura, dentro del diálogo.
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();

  // Y confirmar desde el teclado sí la borra.
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Borrar carpeta' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/notebook$/u);
  await expect(page.getByRole('navigation', { name: 'Directorio de Notebook' }).getByRole('link', { name })).toHaveCount(0);
});
