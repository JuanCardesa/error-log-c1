import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { setErrorNoteLink } from '../src/lib/db/notebookLinkRepo';
import { createNotebookFolder, createNotebookNote, deleteNotebookFolder, deleteNotebookNote, getNotebookNote, saveNotebookNote } from '../src/lib/db/notebookRepo';
import { notebookNoteFileName } from '../src/lib/notebook/export';
import type { NotebookNote } from '../src/lib/notebook/types';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

const notes: number[] = [];
const folders: number[] = [];

function seedNote(contentMarkdown = 'Versión inicial', folderId: number | null = null): NotebookNote {
  const db = createDb(E2E_DB);
  try {
    const { note } = createNotebookNote(db, {
      uid: randomUUID(), title: `TEST review ${randomUUID()}`, folderId, tags: ['review'], contentMarkdown,
    }, new Date().toISOString());
    notes.push(note.id);
    return note;
  } finally { db.$client.close(); }
}

function readNote(id: number) {
  const db = createDb(E2E_DB);
  try { return getNotebookNote(db, id); } finally { db.$client.close(); }
}

test.afterEach(() => {
  const db = createDb(E2E_DB);
  try {
    for (const id of notes.splice(0)) {
      const note = getNotebookNote(db, id);
      if (note !== null) deleteNotebookNote(db, { id, uid: note.uid, expectedRevision: note.revision });
    }
    for (const id of folders.splice(0).reverse()) deleteNotebookFolder(db, id);
  } finally { db.$client.close(); }
});

test('borra desde el lector con confirmación y conserva el error vinculado', async ({ page }) => {
  const note = seedNote('## Regla\n\nTexto para borrar.');
  const db = createDb(E2E_DB);
  let errorId: number;
  try {
    errorId = (db.$client.prepare('SELECT id FROM error_row LIMIT 1').get() as { id: number }).id;
    setErrorNoteLink(db, { errorId, noteId: note.id, headingSlug: 'nb-regla' }, new Date().toISOString());
  } finally { db.$client.close(); }
  const href = notebookNoteHref(note);
  await page.goto(href);
  const remove = page.getByRole('button', { name: 'Borrar apunte…', exact: true });
  await remove.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(readNote(note.id)).not.toBeNull();
  await remove.click();
  await dialog.getByRole('button', { name: 'Borrar apunte', exact: true }).click();
  await expect(page).toHaveURL('/notebook');
  expect(readNote(note.id)).toBeNull();
  const check = createDb(E2E_DB);
  try {
    expect(check.$client.prepare('SELECT id FROM error_row WHERE id = ?').get(errorId)).toBeDefined();
    expect(check.$client.prepare('SELECT * FROM notebook_error_link WHERE note_id = ?').all(note.id)).toEqual([]);
    expect(check.$client.prepare('SELECT rowid FROM notebook_note_fts WHERE rowid = ?').get(note.id)).toBeUndefined();
  } finally { check.$client.close(); }
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
});

test('un borrado obsoleto pide revisar el apunte y no borra cambios ajenos', async ({ page }) => {
  const note = seedNote();
  await page.goto(notebookNoteHref(note));
  await page.getByRole('button', { name: 'Borrar apunte…', exact: true }).click();
  const db = createDb(E2E_DB);
  try {
    saveNotebookNote(db, { id: note.id, uid: note.uid, expectedRevision: note.revision,
      title: note.title, folderId: null, tags: [...note.tags], contentMarkdown: 'Edición posterior' }, new Date().toISOString());
  } finally { db.$client.close(); }
  await page.getByRole('alertdialog').getByRole('button', { name: 'Borrar apunte', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'El apunte ha cambiado' })).toBeVisible();
  expect(readNote(note.id)?.contentMarkdown).toBe('Edición posterior');
});

test('un fallo de transporte al borrar permite reintentar sin perder el apunte', async ({ page }) => {
  const note = seedNote();
  const href = notebookNoteHref(note);
  await page.goto(href);
  // Corta cada intento mientras `offline`: el diálogo no reintenta solo, y Next puede
  // repetir la peticion de la accion, asi que un unico corte no garantiza el fallo.
  let offline = true;
  await page.route(`**${href}`, async (route) => {
    if (offline && route.request().method() === 'POST') { await route.abort('failed'); return; }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Borrar apunte…', exact: true }).click();
  const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'Borrar apunte', exact: true });
  await confirm.click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo confirmar el borrado' })).toBeVisible();
  expect(readNote(note.id)).not.toBeNull();
  offline = false;
  await confirm.click();
  await expect(page).toHaveURL('/notebook');
  expect(readNote(note.id)).toBeNull();
});

test('si falla la lectura actual del editor se puede reintentar antes de editar', async ({ page }) => {
  const note = seedNote();
  const href = `${notebookNoteHref(note)}/editar`;
  let offline = true;
  await page.route(`**${href}`, async (route) => {
    if (offline && route.request().method() === 'POST') { await route.abort('failed'); return; }
    await route.continue();
  });
  await page.goto(href);
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo cargar la versión actual' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toHaveCount(0);
  offline = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toHaveValue(note.contentMarkdown);
  expect(readNote(note.id)?.revision).toBe(1);
});

test('volver con Atrás tras autosave carga la revisión actual y permite seguir editando', async ({ page }) => {
  const note = seedNote();
  await page.goto(`${notebookNoteHref(note)}/editar`);
  const body = page.getByRole('textbox', { name: 'Contenido Markdown' });
  await body.fill('Versión guardada antes de salir');
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  expect(readNote(note.id)?.revision).toBe(2);
  await page.getByRole('link', { name: 'Errores', exact: true }).click();
  await expect(page).toHaveURL('/errores');
  await page.goBack();
  await expect(body).toHaveValue('Versión guardada antes de salir');
  await body.fill('Versión guardada después de volver');
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  expect(readNote(note.id)).toMatchObject({ revision: 3, contentMarkdown: 'Versión guardada después de volver' });
  await expect(page.getByText(/cambió en otra pestaña/u)).toHaveCount(0);
});

test('volver al editor conserva el borrador pendiente de validación', async ({ page }) => {
  const note = seedNote();
  await page.goto(`${notebookNoteHref(note)}/editar`);
  await page.getByRole('textbox', { name: /Etiquetas/u }).fill('review, review');
  await page.getByRole('textbox', { name: 'Contenido Markdown' }).fill('Borrador que aún no se puede guardar');
  await page.getByRole('link', { name: 'Errores', exact: true }).click();
  await expect(page).toHaveURL('/errores');
  await page.goBack();
  await page.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toHaveValue('Borrador que aún no se puede guardar');
  await page.getByRole('textbox', { name: /Etiquetas/u }).fill('review');
  await page.getByRole('button', { name: 'Terminar edición' }).click();
  await expect(page).toHaveURL(notebookNoteHref(note));
  expect(readNote(note.id)?.contentMarkdown).toBe('Borrador que aún no se puede guardar');
});

test('los filtros siguen la navegación y una carpeta incluye descendientes sin texto', async ({ page }) => {
  const db = createDb(E2E_DB);
  let rootId: number;
  let childId: number;
  const rootName = `TEST tree ${randomUUID()}`;
  try {
    const at = new Date().toISOString();
    rootId = createNotebookFolder(db, { name: rootName, parentId: null }, at).id;
    childId = createNotebookFolder(db, { name: 'Hija', parentId: rootId }, at).id;
    folders.push(rootId, childId);
  } finally { db.$client.close(); }
  const rootNote = seedNote('conditionals', rootId);
  const childNote = seedNote('conditionals', childId);
  const outside = seedNote('conditionals');
  await page.goto('/notebook?tag=review');
  const directory = page.getByRole('navigation', { name: 'Directorio de Notebook' });
  await directory.getByRole('link', { name: rootName, exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Carpeta', exact: true })).toHaveValue(String(rootId));
  await expect(page.getByRole('textbox', { name: 'Etiqueta' })).toHaveValue('');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  const results = page.locator('section[aria-labelledby="notebook-list-title"]');
  await expect(results.getByRole('link', { name: rootNote.title, exact: true })).toBeVisible();
  await expect(results.getByRole('link', { name: childNote.title, exact: true })).toBeVisible();
  await expect(results.getByRole('link', { name: outside.title, exact: true })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Buscar apuntes' }).fill('conditionals');
  await expect(page).toHaveURL(/q=conditionals/u);
  await expect(results.getByRole('link', { name: childNote.title, exact: true })).toBeVisible();
  await directory.getByRole('link', { name: 'Sin carpeta', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Carpeta', exact: true })).toHaveValue('sin-carpeta');
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Carpeta', exact: true })).toHaveValue(String(rootId));
});

test('el índice desplegable navega sin ocupar una columna permanente', async ({ page }) => {
  const note = seedNote(Array.from({ length: 15 }, (_, i) => `## Apartado ${String(i)}\n\n${'Explicación de la regla. '.repeat(60)}`).join('\n\n'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(notebookNoteHref(note));
  await page.locator('summary').filter({ hasText: 'En esta nota' }).click();
  const toc = page.getByRole('navigation', { name: 'Índice del apunte' });
  await toc.getByRole('link', { name: 'Apartado 8', exact: true }).click();
  await expect(page).toHaveURL(/#nb-apartado-8$/u);
  await expect.poll(async () => {
    const box = await toc.boundingBox();
    return box !== null && box.y + box.height < 0;
  }).toBe(true);
  await expect(toc.getByRole('link', { name: 'Apartado 8', exact: true })).toHaveAttribute('aria-current', 'location');
});

test('exporta Unicode por HTTP y conserva el nombre en la descarga del navegador', async ({ page, request }) => {
  const original = seedNote('# Unicode\n\nContenido íntegro.');
  const db = createDb(E2E_DB);
  let note: NotebookNote;
  try {
    note = saveNotebookNote(db, { id: original.id, uid: original.uid, expectedRevision: 1,
      title: `中文 Ελληνικά ${'a'.repeat(45)}𠀀 final`, folderId: null, tags: [], contentMarkdown: original.contentMarkdown }, new Date().toISOString());
  } finally { db.$client.close(); }
  const response = await request.get(`/exportar/notebook-${String(note.id)}.md`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-disposition']).toContain("filename*=UTF-8''");
  expect(await response.text()).toContain(note.title);
  await page.goto(notebookNoteHref(note));
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Exportar .md' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(notebookNoteFileName(note));
  expect(readFileSync(await download.path(), 'utf8').endsWith(note.contentMarkdown)).toBe(true);
});
