import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { createNotebookNote, deleteNotebookNote, getNotebookNote, setNotebookNoteFavorite } from '../src/lib/db/notebookRepo';
import type { NotebookNote } from '../src/lib/notebook/types';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

let note: NotebookNote;

test.beforeEach(() => {
  const db = createDb(E2E_DB);
  try {
    note = createNotebookNote(db, {
      uid: randomUUID(), title: `Favorito ${randomUUID().slice(0, 8)}`,
      folderId: null, tags: [], contentMarkdown: '## Una regla\n\nTexto para editar.',
    }, new Date().toISOString()).note;
  } finally { db.$client.close(); }
});

test.afterEach(() => {
  const db = createDb(E2E_DB);
  try {
    const current = getNotebookNote(db, note.id);
    if (current !== null) deleteNotebookNote(db, {
      id: current.id, uid: current.uid, expectedRevision: current.revision,
    });
  } finally { db.$client.close(); }
});

test('marca desde el lector y aparece en el directorio y la vista Favoritos', async ({ page }) => {
  await page.goto(notebookNoteHref(note));
  const toggle = page.getByRole('button', { name: 'Favorito', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const directory = page.getByRole('navigation', { name: 'Directorio de Notebook' });
  await expect(directory.getByRole('link', { name: note.title })).toBeVisible();
  await directory.getByRole('link', { name: /Favoritos/ }).first().click();
  await expect(page).toHaveURL(/vista=favoritos/);
  await expect(page.getByRole('heading', { name: 'Favoritos' })).toBeVisible();
  await expect(page.getByRole('region').getByRole('link', { name: note.title })).toBeVisible();
  await expect(directory.getByRole('link', { name: /Favoritos/ }).first()).toHaveAttribute('aria-current', 'page');

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(notebookNoteHref(note));
    await page.screenshot({ path: `test-results/notebook-lector-${String(width)}.png`, fullPage: true });
    await page.goto('/notebook');
    await page.screenshot({ path: `test-results/notebook-portada-${String(width)}.png`, fullPage: true });
  }
});

test('desmarca desde una fila y conserva el estado confirmado', async ({ page }) => {
  const db = createDb(E2E_DB);
  try { setNotebookNoteFavorite(db, { id: note.id, favorite: true }, new Date().toISOString()); }
  finally { db.$client.close(); }
  await page.goto(`/notebook?q=${encodeURIComponent(note.title)}`);
  const toggle = page.getByRole('button', { name: `Favorito: «${note.title}»` });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/notebook?vista=favoritos');
  await expect(page.getByRole('link', { name: note.title })).toHaveCount(0);
});

test('se puede marcar con el teclado', async ({ page }) => {
  await page.goto(`/notebook?vista=favoritos&q=${encodeURIComponent(note.title)}`);
  await expect(page.getByRole('heading', { name: 'Resultados de búsqueda' })).toBeVisible();
  const toggle = page.getByRole('button', { name: `Favorito: «${note.title}»` });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('una vista desconocida da 404', async ({ page }) => {
  await page.goto('/notebook?vista=desconocida');
  await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
});

test('marcar en otra pestaña no crea conflicto al seguir editando', async ({ page, context }) => {
  const editor = await context.newPage();
  try {
    await editor.goto(`${notebookNoteHref(note)}/editar`);
    const body = editor.getByRole('textbox', { name: 'Contenido Markdown' });
    await expect(body).toHaveValue(note.contentMarkdown);
    await page.goto(notebookNoteHref(note));
    const toggle = page.getByRole('button', { name: 'Favorito', exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await body.fill('## Una regla\n\nTexto posterior al favorito.');
    await expect(editor.getByText('Guardado', { exact: true })).toBeVisible();
    await expect(editor.getByRole('alert').filter({ hasText: 'cambió en otra pestaña' })).toHaveCount(0);
    const db = createDb(E2E_DB);
    try { expect(getNotebookNote(db, note.id)).toMatchObject({ revision: 2, contentMarkdown: '## Una regla\n\nTexto posterior al favorito.', favoritedAt: expect.any(String) }); }
    finally { db.$client.close(); }
  } finally { await editor.close(); }
});

test('un fallo de la acción conserva la marca anterior y muestra un aviso', async ({ page }) => {
  const href = notebookNoteHref(note);
  await page.goto(href);
  await page.route(`**${href}`, async (route) => {
    if (route.request().method() === 'POST') { await route.abort('failed'); return; }
    await route.continue();
  });
  const toggle = page.getByRole('button', { name: 'Favorito', exact: true });
  await toggle.click();
  await expect(page.getByRole('status').filter({ hasText: 'No se pudo confirmar el cambio de favorito' })).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const db = createDb(E2E_DB);
  try { expect(getNotebookNote(db, note.id)?.favoritedAt).toBeNull(); }
  finally { db.$client.close(); }
});
