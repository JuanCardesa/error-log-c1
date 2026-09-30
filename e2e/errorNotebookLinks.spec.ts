import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { loadDataset } from '../src/lib/db/load';
import { setErrorNoteLink } from '../src/lib/db/notebookLinkRepo';
import { createNotebookFolder, createNotebookNote, getNotebookNote, saveNotebookNote } from '../src/lib/db/notebookRepo';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

test('vincula un apartado desde Sesiones y lo revisa en Errores y Falsas certezas', async ({ page }) => {
  const db = createDb(E2E_DB);
  let errorId: number;
  let sessionId: number;
  let noteId: number;
  let noteHref: string;
  const title = `Apunte del error ${randomUUID().slice(0, 8)}`;
  try {
    const data = loadDataset(db);
    const error = data.errors.find((item) => item.correctAnswer === 'the meeting had to be called off');
    if (error === undefined) throw new Error('Falta el error de prueba');
    errorId = error.id;
    sessionId = error.sessionId;
    const note = createNotebookNote(db, {
      uid: randomUUID(), title, folderId: null, tags: ['grammar'],
      contentMarkdown: '## Apartado inicial\n\nLa regla.\n\n## Repetido\n\n## Repetido',
    }, new Date().toISOString()).note;
    noteId = note.id;
    noteHref = notebookNoteHref(note);
  } finally { db.$client.close(); }

  await page.goto(`/registrar?s=${String(sessionId)}&error=${String(errorId)}`);
  const links = page.getByRole('region', { name: 'Apuntes vinculados' });
  await expect(links.getByText('Este error aún no tiene apuntes vinculados.')).toBeVisible();
  await links.getByRole('button', { name: 'Vincular apunte' }).click();
  await links.getByRole('searchbox', { name: 'Buscar apuntes' }).fill(title);
  await links.getByRole('list', { name: 'Apuntes encontrados' }).getByRole('button', { name: title }).click();
  const section = links.getByRole('combobox', { name: 'Apartado' });
  await expect(section.getByRole('option', { name: 'Repetido' })).toHaveCount(0);
  await section.selectOption({ label: 'Apartado inicial' });
  await links.getByRole('button', { name: 'Guardar vínculo' }).click();
  await expect(links.getByRole('link', { name: title })).toHaveAttribute('href', `${noteHref}#nb-apartado-inicial`);

  await page.goto(`/errores?error=${String(errorId)}`);
  await expect(links.getByRole('link', { name: title })).toHaveAttribute('href', `${noteHref}#nb-apartado-inicial`);

  const writeDb = createDb(E2E_DB);
  try {
    const note = getNotebookNote(writeDb, noteId);
    if (note === null) throw new Error('Falta el apunte de prueba');
    saveNotebookNote(writeDb, {
      id: note.id, uid: note.uid, expectedRevision: note.revision,
      title: note.title, folderId: note.folderId, tags: [...note.tags],
      contentMarkdown: '## Apartado nuevo\n\nLa regla cambió.\n\n## Repetido\n\n## Repetido',
    }, new Date().toISOString());
  } finally { writeDb.$client.close(); }

  await page.goto(`/certezas?error=${String(errorId)}`);
  await expect(links.getByText('Apartado cambiado · El vínculo al apunte se conserva.')).toBeVisible();
  await expect(links.getByRole('link', { name: title })).toHaveAttribute('href', noteHref);
  await links.getByRole('button', { name: 'Elegir apartado' }).click();
  await links.getByRole('combobox', { name: 'Apartado' }).selectOption({ label: 'Apartado nuevo' });
  await links.getByRole('button', { name: 'Guardar vínculo' }).click();
  await expect(links.getByRole('link', { name: title })).toHaveAttribute('href', `${noteHref}#nb-apartado-nuevo`);
  await links.getByRole('button', { name: 'Desvincular' }).click();
  await expect(links.getByText('Este error aún no tiene apuntes vinculados.')).toBeVisible();
});

test('el vínculo sobrevive a renombrar y mover el apunte, con su apartado', async ({ page }) => {
  const db = createDb(E2E_DB);
  let errorId: number;
  let noteId: number;
  let destination: string;
  const title = `Apunte que se muda ${randomUUID().slice(0, 8)}`;
  try {
    const at = new Date().toISOString();
    const origin = createNotebookFolder(db, { name: `Origen ${randomUUID().slice(0, 8)}`, parentId: null }, at);
    destination = `Destino ${randomUUID().slice(0, 8)}`;
    createNotebookFolder(db, { name: destination, parentId: null }, at);
    const error = loadDataset(db).errors.find((item) => item.correctAnswer === 'the meeting had to be called off');
    if (error === undefined) throw new Error('Falta el error de prueba');
    errorId = error.id;
    const note = createNotebookNote(db, {
      uid: randomUUID(), title, folderId: origin.id, tags: [],
      contentMarkdown: '## Regla del apartado\n\nLa explicación.',
    }, at).note;
    noteId = note.id;
    setErrorNoteLink(db, { errorId, noteId, headingSlug: 'nb-regla-del-apartado' }, at);
  } finally { db.$client.close(); }

  const renamed = `${title} revisado`;
  await page.goto(`/notebook/${String(noteId)}/editar`);
  await page.getByRole('textbox', { name: 'Título' }).fill(renamed);
  await page.getByRole('combobox', { name: 'Carpeta' }).selectOption({ label: destination });
  await page.getByRole('button', { name: 'Guardar ahora' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();

  // El vínculo se guardó contra el ID, así que el cambio de título y de carpeta solo
  // cambia la dirección a la que lleva: ni se rompe ni pierde el apartado.
  await page.goto(`/errores?error=${String(errorId)}`);
  const links = page.getByRole('region', { name: 'Apuntes vinculados' });
  await expect(links.getByRole('link', { name: renamed }))
    .toHaveAttribute('href', `${notebookNoteHref({ id: noteId, title: renamed })}#nb-regla-del-apartado`);
  await expect(links.getByText('Apartado: Regla del apartado')).toBeVisible();

  await links.getByRole('link', { name: renamed }).click();
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Ruta del apunte' }).getByRole('link', { name: destination })).toBeVisible();
});
