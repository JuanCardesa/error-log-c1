import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { loadDataset } from '../src/lib/db/load';
import { setErrorNoteLink } from '../src/lib/db/notebookLinkRepo';
import { createNotebookNote, deleteNotebookNote } from '../src/lib/db/notebookRepo';
import { createError, deleteError } from '../src/lib/db/repo';
import { notebookNoteHref } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

const LINK_COUNT = 21;

test('el lector pagina, desvincula y conserva el apunte al quitar el último error de una página', async ({ page }) => {
  const db = createDb(E2E_DB);
  let noteId = 0;
  let noteUid = '';
  let noteRevision = 0;
  let noteHref = '';
  let noteTitle = '';
  const errorIds: number[] = [];
  let taggedErrorId = 0;
  try {
    const sample = loadDataset(db).errors[0];
    if (sample === undefined) throw new Error('Falta un error en el seed');
    const { id: _id, createdAt: _createdAt, ...base } = sample;

    for (let i = 1; i <= LINK_COUNT; i += 1) {
      const created = createError(db, {
        ...base, itemRef: `rel-${String(i)}`, prompt: `Frase de prueba ${String(i)}`,
        myAnswer: `respuesta ${String(i)}`, correctAnswer: `corrección ${String(i)}`, confidence: 'DUDABA',
      });
      errorIds.push(created.id);
    }

    noteTitle = `Apunte con muchos errores ${randomUUID().slice(0, 8)}`;
    const note = createNotebookNote(db, {
      uid: randomUUID(), title: noteTitle, folderId: null, tags: [],
      contentMarkdown: '## Apartado A\n\nTexto del apunte.\n',
    }, new Date().toISOString()).note;
    noteId = note.id;
    noteUid = note.uid;
    noteRevision = note.revision;
    noteHref = notebookNoteHref(note);

    // El primero creado recibe el timestamp más antiguo: al ordenar por creación
    // descendente queda el último de todos, solo en la segunda página.
    taggedErrorId = errorIds[0]!;
    errorIds.forEach((errorId, index) => {
      const at = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
      setErrorNoteLink(db, { errorId, noteId, headingSlug: index === 0 ? 'nb-apartado-a' : null }, at);
    });
  } finally { db.$client.close(); }

  try {
    await page.goto(noteHref);
    const related = page.getByRole('region', { name: 'Errores relacionados' });
    await expect(related.getByRole('listitem')).toHaveCount(20);
    await expect(related.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await expect(related.getByRole('button', { name: 'Siguiente' })).toBeEnabled();

    // Página 2: el único vínculo con apartado, con su ancla al propio lector.
    await related.getByRole('button', { name: 'Siguiente' }).click();
    await expect(related.getByRole('listitem')).toHaveCount(1);
    await expect(related.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    const lastItem = related.getByRole('listitem').first();
    await expect(lastItem.getByRole('link', { name: /corrección/u })).toHaveAttribute('href', `/errores?error=${String(taggedErrorId)}`);
    await expect(lastItem.getByRole('link', { name: 'Apartado: Apartado A' })).toHaveAttribute('href', '#nb-apartado-a');

    // Desvincular el único error de la página 2 la deja vacía: vuelve sola a la página 1.
    await lastItem.getByRole('button', { name: 'Desvincular' }).click();
    await expect(related.getByRole('listitem')).toHaveCount(20);
    await expect(related.getByRole('button', { name: 'Siguiente' })).toHaveCount(0);
    await expect(related.getByRole('button', { name: 'Anterior' })).toHaveCount(0);

    // Desvincular uno más desde la página 1, ya sin paginación.
    await related.getByRole('listitem').first().getByRole('button', { name: 'Desvincular' }).click();
    await expect(related.getByRole('listitem')).toHaveCount(19);

    // El apunte sobrevive a ambas desvinculaciones: recargar conserva su título y contenido.
    await page.reload();
    await expect(page.getByRole('heading', { name: noteTitle, level: 1 })).toBeVisible();
    await expect(page.getByText('Texto del apunte.')).toBeVisible();
    await expect(related.getByRole('listitem')).toHaveCount(19);
  } finally {
    const cleanupDb = createDb(E2E_DB);
    try {
      for (const errorId of errorIds) deleteError(cleanupDb, errorId);
      deleteNotebookNote(cleanupDb, { id: noteId, uid: noteUid, expectedRevision: noteRevision });
    } finally { cleanupDb.$client.close(); }
  }
});
