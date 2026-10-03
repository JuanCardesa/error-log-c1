import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { createNotebookNote, deleteNotebookNote, getNotebookNote, saveNotebookNote } from '../src/lib/db/notebookRepo';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

function seedNote() {
  const db = createDb(E2E_DB);
  try {
    return createNotebookNote(db, {
      uid: randomUUID(), title: 'Autosave', folderId: null, tags: [], contentMarkdown: 'Original',
    }, new Date().toISOString()).note;
  } finally { db.$client.close(); }
}

test('guarda al quedar inactivo y serializa un cambio escrito durante la petición', async ({ page }) => {
  const note = seedNote();
  await page.goto(`${notebookNoteHref(note)}/editar`);
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
  const body = page.getByRole('textbox', { name: 'Contenido Markdown' });
  await body.fill('Primera escritura');
  await sent;
  await body.fill('Segunda escritura');
  await expect(body).toHaveValue('Segunda escritura');
  release();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  const db = createDb(E2E_DB);
  try {
    expect(getNotebookNote(db, note.id)).toMatchObject({ contentMarkdown: 'Segunda escritura', revision: 3 });
  } finally { db.$client.close(); }
});

test('reconcilia una respuesta perdida sin repetir la escritura confirmada', async ({ page }) => {
  const note = seedNote();
  await page.goto(`${notebookNoteHref(note)}/editar`);
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toBeEnabled();
  let intercepted = false;
  await page.route('**/notebook/**/editar', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) { await route.continue(); return; }
    intercepted = true;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('textbox', { name: 'Contenido Markdown' }).fill('Respuesta perdida');
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  const db = createDb(E2E_DB);
  try {
    expect(getNotebookNote(db, note.id)).toMatchObject({ contentMarkdown: 'Respuesta perdida', revision: 2 });
  } finally { db.$client.close(); }
});

test('reintenta con la misma revisión cuando la petición nunca llegó al servidor', async ({ page }) => {
  const note = seedNote();
  await page.goto(`${notebookNoteHref(note)}/editar`);
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toBeEnabled();
  let intercepted = false;
  await page.route('**/notebook/**/editar', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) { await route.continue(); return; }
    intercepted = true;
    await route.abort('failed');
  });
  await page.getByRole('textbox', { name: 'Contenido Markdown' }).fill('Guardado tras reintento');
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  const db = createDb(E2E_DB);
  try {
    expect(getNotebookNote(db, note.id)).toMatchObject({ contentMarkdown: 'Guardado tras reintento', revision: 2 });
  } finally { db.$client.close(); }
});

test('reconcilia un alta con respuesta perdida mediante su UID', async ({ page }) => {
  await page.goto('/notebook/nuevo');
  let intercepted = false;
  await page.route('**/notebook/nuevo', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) { await route.continue(); return; }
    intercepted = true;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('textbox', { name: 'Título' }).fill('Alta reconciliada');
  await expect(page).toHaveURL(/\/notebook\/\d+-alta-reconciliada\/editar$/u);
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  const id = Number(/\/notebook\/(\d+)-/u.exec(page.url())?.[1]);
  const db = createDb(E2E_DB);
  try {
    expect(getNotebookNote(db, id)).toMatchObject({ title: 'Alta reconciliada', revision: 1 });
  } finally { db.$client.close(); }
});

test('no recrea automáticamente un alta incierta recuperada tras recarga', async ({ page }) => {
  await page.goto('/notebook/nuevo');
  let intercepted = false;
  await page.route('**/notebook/nuevo', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) { await route.continue(); return; }
    intercepted = true;
    await route.abort('failed');
  });
  await page.getByRole('textbox', { name: 'Título' }).fill('Alta incierta');
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo confirmar el último guardado' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('errorlog:notebook:draft:new:'));
    return key === undefined ? false : (JSON.parse(localStorage.getItem(key) ?? '{}') as { createAttempted?: boolean }).createAttempted === true;
  })).toBe(true);
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await page.reload();
  await page.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo confirmar si este borrador ya se creó' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar ahora' })).toBeDisabled();
  await page.getByRole('button', { name: 'Conservar como nuevo apunte' }).click();
  await expect(page).toHaveURL(/\/notebook\/\d+-alta-incierta\/editar$/u);
  await page.goto('/notebook');
  await expect(page.getByRole('heading', { name: 'Borradores locales pendientes (1)' })).toBeVisible();
});

test('detiene autosave al detectar conflicto o borrado y conserva el texto local', async ({ page }) => {
  const note = seedNote();
  await page.goto(`${notebookNoteHref(note)}/editar`);
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toBeEnabled();
  let db = createDb(E2E_DB);
  try {
    saveNotebookNote(db, { id: note.id, uid: note.uid, expectedRevision: note.revision,
      title: note.title, folderId: null, tags: [], contentMarkdown: 'Cambio remoto' }, new Date().toISOString());
  } finally { db.$client.close(); }
  const body = page.getByRole('textbox', { name: 'Contenido Markdown' });
  await body.fill('Cambio local');
  await expect(page.getByRole('alert').filter({ hasText: 'cambió en otra pestaña' })).toBeVisible();
  await expect(body).toHaveValue('Cambio local');
  await expect(page.getByRole('button', { name: 'Guardar ahora' })).toBeDisabled();
  await page.getByRole('button', { name: 'Conservar como nuevo apunte' }).click();
  await expect(body).toHaveValue('Cambio local');
  await expect(page).toHaveURL(/\/notebook\/\d+-autosave\/editar$/u);
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  db = createDb(E2E_DB);
  try {
    expect(getNotebookNote(db, note.id)).toMatchObject({ contentMarkdown: 'Cambio remoto', revision: 2 });
  } finally { db.$client.close(); }

  const deleted = seedNote();
  await page.goto(`${notebookNoteHref(deleted)}/editar`);
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toBeEnabled();
  db = createDb(E2E_DB);
  try {
    deleteNotebookNote(db, { id: deleted.id, uid: deleted.uid, expectedRevision: deleted.revision });
  } finally { db.$client.close(); }
  await page.getByRole('textbox', { name: 'Contenido Markdown' }).fill('Texto tras borrado');
  await expect(page.getByRole('alert').filter({ hasText: 'fue borrado' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Contenido Markdown' })).toHaveValue('Texto tras borrado');
  await expect(page.getByRole('button', { name: 'Guardar ahora' })).toBeDisabled();
});
