import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { createNotebookFolder, createNotebookNote, saveNotebookNote } from '../src/lib/db/notebookRepo';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

test('abre por ID, devuelve 404 para IDs inexistentes y conserva enlaces al renombrar y mover', async ({ page }) => {
  const db = createDb(E2E_DB);
  let oldHref: string;
  let folderId: number;
  try {
    const at = new Date().toISOString();
    const first = createNotebookFolder(db, { name: `Grammar ${randomUUID().slice(0, 8)}`, parentId: null }, at);
    const second = createNotebookFolder(db, { name: `Vocabulary ${randomUUID().slice(0, 8)}`, parentId: null }, at);
    folderId = second.id;
    const { note } = createNotebookNote(db, {
      uid: randomUUID(), title: 'Past modal verbs', folderId: first.id,
      tags: ['grammar'], contentMarkdown: [
        '# Must have',
        'A deduction.',
        '',
        '![pixel](https://tracker.example/pixel.png)',
        '',
        '<script>window.__notebookPwned = true</script>',
      ].join('\n'),
    }, at);
    oldHref = notebookNoteHref(note);
    saveNotebookNote(db, {
      id: note.id, uid: note.uid, expectedRevision: note.revision,
      title: 'Modal verbs in the past', folderId: second.id,
      tags: [...note.tags], contentMarkdown: note.contentMarkdown,
    }, new Date().toISOString());
  } finally { db.$client.close(); }

  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://tracker.example/')) externalRequests.push(request.url());
  });
  await page.goto(oldHref);
  await expect(page.getByRole('heading', { level: 1, name: 'Modal verbs in the past' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Ruta del apunte' }).getByRole('link', { name: /Vocabulary/ })).toHaveAttribute('href', `/notebook?carpeta=${String(folderId)}`);
  await expect(page.getByRole('heading', { name: 'Must have' })).toHaveAttribute('id', 'nb-must-have');
  await expect(page.getByText('![pixel](https://tracker.example/pixel.png)')).toBeVisible();
  expect(await page.locator('img').count()).toBe(0);
  expect(externalRequests).toEqual([]);
  expect(await page.evaluate(() => Reflect.get(window, '__notebookPwned'))).toBeUndefined();

  await page.goto('/notebook/999999999-not-found');
  await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
  await page.goto('/notebook/nuevo');
  await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
});

test('muestra carpetas anidadas, estados vacíos y permite crear y renombrar carpetas', async ({ page }) => {
  await page.goto('/notebook');
  await expect(page.getByRole('heading', { level: 1, name: 'Notebook' })).toBeVisible();
  await page.getByText('Organizar carpetas').click();
  const createForm = page.getByRole('heading', { name: 'Nueva carpeta' }).locator('..');
  await createForm.getByRole('textbox', { name: 'Nombre' }).fill('Grammar');
  await createForm.getByRole('button', { name: 'Crear carpeta' }).click();
  await expect(page).toHaveURL(/carpeta=\d+/);
  await expect(page.getByText('Aquí aún no hay apuntes.')).toBeVisible();

  await page.getByText('Organizar carpetas').click();
  const editForm = page.getByRole('heading', { name: 'Editar Grammar' }).locator('..');
  await editForm.getByRole('textbox', { name: 'Nombre' }).fill('Grammar notes');
  await editForm.getByRole('button', { name: 'Guardar carpeta' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Grammar notes' })).toBeVisible();

  const createSubfolderForm = page.getByRole('heading', { name: 'Nueva carpeta' }).locator('..');
  await createSubfolderForm.getByRole('textbox', { name: 'Nombre' }).fill('Modal verbs');
  await createSubfolderForm.getByRole('button', { name: 'Crear carpeta' }).click();
  await expect(page.getByRole('navigation', { name: 'Directorio de Notebook' }).getByRole('link', { name: 'Modal verbs' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Directorio de Notebook' }).getByRole('button', { name: 'Contraer Grammar notes' }).click();
  await expect(page.getByRole('navigation', { name: 'Directorio de Notebook' }).getByRole('link', { name: 'Modal verbs' })).toBeHidden();
});
