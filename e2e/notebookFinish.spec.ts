import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { createNotebookNote, saveNotebookNote } from '../src/lib/db/notebookRepo';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

test('termina con cambios pendientes y actualiza lector visitado y listado', async ({ page }) => {
  const db = createDb(E2E_DB);
  let oldHref: string;
  try {
    const original = createNotebookNote(db, {
      uid: randomUUID(), title: 'Antes de editar', folderId: null,
      tags: [], contentMarkdown: '## Regla antigua\n\nTexto anterior.',
    }, new Date().toISOString()).note;
    oldHref = notebookNoteHref(original);
  } finally { db.$client.close(); }

  await page.goto(oldHref);
  await expect(page.getByRole('heading', { level: 1, name: 'Antes de editar' })).toBeVisible();
  await page.getByRole('link', { name: 'Editar' }).click();
  await page.getByRole('textbox', { name: 'Título' }).fill('Después de editar');
  await page.getByRole('textbox', { name: 'Contenido Markdown' }).fill('## Regla nueva\n\nTexto actualizado.');
  await page.getByRole('button', { name: 'Terminar edición' }).click();
  await expect(page).toHaveURL(/\/notebook\/\d+-[^/]+$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Después de editar' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Regla nueva' })).toBeVisible();
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Después de editar' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Antes de editar' })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Después de editar' })).toBeVisible();
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(oldHref);
  await expect(page.getByRole('heading', { level: 1, name: 'Después de editar' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Regla nueva' })).toBeVisible();
});

test('espera una escritura en vuelo antes de finalizar', async ({ page }) => {
  const db = createDb(E2E_DB);
  let href: string;
  try {
    const note = createNotebookNote(db, {
      uid: randomUUID(), title: 'Esperar guardado', folderId: null, tags: [], contentMarkdown: 'Versión inicial',
    }, new Date().toISOString()).note;
    href = `${notebookNoteHref(note)}/editar`;
  } finally { db.$client.close(); }
  await page.goto(href);
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toBeEnabled();
  let intercepted = false;
  let notifySent!: () => void;
  let release!: () => void;
  const sent = new Promise<void>((resolve) => { notifySent = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/notebook/**/editar', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) { await route.continue(); return; }
    intercepted = true;
    const response = await route.fetch();
    notifySent();
    await gate;
    await route.fulfill({ response });
  });
  await page.getByRole('textbox', { name: 'Contenido Markdown' }).fill('Versión terminada');
  await sent;
  await page.getByRole('button', { name: 'Terminar edición' }).click();
  await expect(page.getByText('Finalizando…')).toBeVisible();
  release();
  await expect(page).toHaveURL(/\/notebook\/\d+-[^/]+$/u);
  await expect(page.getByText('Versión terminada')).toBeVisible();
});

test('conserva el borrador al salir, volver y recargar antes de terminar', async ({ page }) => {
  await page.goto('/notebook/nuevo');
  await page.getByRole('textbox', { name: 'Título' }).fill('Borrador de navegación');
  await page.getByRole('textbox', { name: 'Contenido Markdown' }).fill('Texto pendiente de confirmar.');
  await page.getByRole('textbox', { name: /Etiquetas/u }).fill('duplicada, duplicada');
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await page.getByRole('link', { name: 'Volver a Notebook' }).click();
  await expect(page.getByRole('heading', { name: 'Borradores locales pendientes (1)' })).toBeVisible();
  await page.getByRole('link', { name: 'Abrir borrador' }).click();
  await page.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toHaveValue('Texto pendiente de confirmar.');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Borrador recuperable' })).toBeVisible();
  await page.getByRole('button', { name: 'Recuperar borrador' }).click();
  await page.getByRole('textbox', { name: /Etiquetas/u }).fill('');
  await page.getByRole('button', { name: 'Terminar edición' }).click();
  await expect(page).toHaveURL(/\/notebook\/\d+-[^/]+$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Borrador de navegación' })).toBeVisible();
  await page.getByRole('link', { name: 'Notebook', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Borradores locales pendientes/u })).toHaveCount(0);
});

test('conserva copia local si aparece un conflicto al finalizar', async ({ page }) => {
  const db = createDb(E2E_DB);
  let href: string;
  let noteId: number;
  let uid: string;
  try {
    const note = createNotebookNote(db, {
      uid: randomUUID(), title: 'Edición simultánea', folderId: null, tags: [], contentMarkdown: 'Mi versión',
    }, new Date().toISOString()).note;
    href = `${notebookNoteHref(note)}/editar`;
    noteId = note.id;
    uid = note.uid;
  } finally { db.$client.close(); }

  await page.goto(href);
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toBeEnabled();
  const other = createDb(E2E_DB);
  try {
    saveNotebookNote(other, {
      id: noteId, uid, expectedRevision: 1, title: 'Edición simultánea',
      folderId: null, tags: [], contentMarkdown: 'Versión remota',
    }, new Date().toISOString());
  } finally { other.$client.close(); }
  await page.getByRole('button', { name: 'Terminar edición' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'cambió en otra pestaña' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toHaveValue('Mi versión');
  await expect.poll(() => page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith('errorlog:notebook:draft:note:')).length)).toBe(1);
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await page.reload();
  await page.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toHaveValue('Mi versión');
  await expect(page.getByRole('alert').filter({ hasText: 'cambió en otra pestaña' })).toBeVisible();
});

test('una nota guardada automáticamente aparece al volver por la navegación general', async ({ page }) => {
  await page.goto('/notebook');
  await page.getByRole('link', { name: 'Nuevo apunte' }).click();
  await page.getByRole('textbox', { name: 'Título' }).fill('Navegación tras autosave');
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Más' }).click();
  await page.getByRole('menuitem', { name: 'Notebook' }).click();
  await expect(page.getByRole('link', { name: 'Navegación tras autosave' })).toBeVisible();
});
