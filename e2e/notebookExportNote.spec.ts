import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { createDb } from '../src/lib/db/client';
import { createNotebookNote, deleteNotebookNote, getNotebookNote } from '../src/lib/db/notebookRepo';
import { notebookNoteFileName } from '../src/lib/notebook/export';
import { notebookNoteHref, parseNotebookNoteId } from '../src/lib/notebook/urls';
import { E2E_DB } from './globalSetup';

const BODY = '# Modales\n\n## Must have\n\nDeducción — «cita».\n';

test('descarga un apunte como .md y la pantalla de importar lo acepta sin avisos', async ({ page }) => {
  const db = createDb(E2E_DB);
  let noteId = 0;
  let noteUid = '';
  let noteRevision = 0;
  let noteHref = '';
  let fileName = '';
  const title = `Modales exportados ${randomUUID().slice(0, 8)}`;
  try {
    const { note } = createNotebookNote(db, {
      uid: randomUUID(), title, folderId: null, tags: ['part4', 'modales'], contentMarkdown: BODY,
    }, new Date().toISOString());
    noteId = note.id;
    noteUid = note.uid;
    noteRevision = note.revision;
    noteHref = notebookNoteHref(note);
    fileName = notebookNoteFileName(note);
  } finally { db.$client.close(); }

  let copyId: number | null = null;
  try {
    await page.goto(noteHref);
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Exportar .md' }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe(fileName);

    const text = readFileSync(await saved.path(), 'utf8');
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain(`title: "${title}"`);
    expect(text).toContain('  - "part4"');
    expect(text).toContain(`notebook_uid: "${noteUid}"`);
    expect(text.endsWith(`---\n${BODY}`)).toBe(true);

    // Lo exportado vuelve a entrar: title y tags se aplican y la identidad no se copia.
    await page.goto('/notebook/importar');
    await page.getByLabel(/Archivo Markdown/u).setInputFiles({
      name: fileName, mimeType: 'text/markdown', buffer: Buffer.from(text, 'utf8'),
    });
    const form = page.getByRole('form', { name: `Importar ${fileName}` });
    await expect(form.getByLabel(/^Título/u)).toHaveValue(title);
    await expect(form.getByLabel(/^Etiquetas/u)).toHaveValue('part4, modales');
    const notices = form.getByRole('region', { name: 'Antes de importar' });
    await expect(notices.getByText(/no se aplican/u)).toBeVisible();
    await expect(notices.getByText(/frontmatter no|HTML|imagen|enlace/u)).toHaveCount(0);

    await form.getByLabel(/^Título/u).fill(`${title} (copia)`);
    await form.getByRole('button', { name: 'Crear apunte' }).click();
    // La vista previa también tiene un h1 con ese título: primero hay que salir de /importar.
    await expect(page).toHaveURL(/\/notebook\/\d+-modales-exportados/u);
    await expect(page.getByRole('heading', { level: 1, name: `${title} (copia)` })).toBeVisible();
    copyId = parseNotebookNoteId(new URL(page.url()).pathname.split('/').pop() ?? '');
    expect(copyId).not.toBeNull();

    const readDb = createDb(E2E_DB);
    try {
      const copy = copyId === null ? null : getNotebookNote(readDb, copyId);
      expect(copy?.uid).not.toBe(noteUid);
      expect(copy?.contentMarkdown).toBe(BODY);
      expect(copy?.tags).toEqual(['part4', 'modales']);
    } finally { readDb.$client.close(); }
  } finally {
    const cleanup = createDb(E2E_DB);
    try {
      const copy = copyId === null ? null : getNotebookNote(cleanup, copyId);
      if (copy !== null) deleteNotebookNote(cleanup, { id: copy.id, uid: copy.uid, expectedRevision: copy.revision });
      deleteNotebookNote(cleanup, { id: noteId, uid: noteUid, expectedRevision: noteRevision });
    } finally { cleanup.$client.close(); }
  }
});
