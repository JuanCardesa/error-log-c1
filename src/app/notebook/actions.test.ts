import { revalidatePath } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb, getDb, type Db } from '@/lib/db/client';
import type * as DbClient from '@/lib/db/client';
import { migrate } from '@/lib/db/migrate';
import { getNotebookNote } from '@/lib/db/notebookRepo';
import { NOTEBOOK_IMPORT_MAX_FILE_BYTES } from '@/lib/notebook/schemas';
import { notebookNoteHref } from '@/lib/notebook/urls';
import {
  createFolderAction,
  createNoteAction,
  deleteFolderAction,
  deleteNoteAction,
  finishEditingAction,
  getErrorNoteLinksAction,
  getNoteAction,
  getNoteByUidAction,
  getNoteErrorLinksAction,
  getNoteOutlineAction,
  importMarkdownAction,
  previewMarkdownImportAction,
  saveNoteAction,
  saveStudyAnnotationAction,
  searchNotesAction,
  removeErrorNoteLinkAction,
  setErrorNoteLinkAction,
  updateFolderAction,
} from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db/client', async (importOriginal) => {
  const original = await importOriginal<typeof DbClient>();
  return { ...original, getDb: vi.fn() };
});

const UID = '9c8de1e3-03e6-42ec-a098-ac0db92331d0';
let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrate(db);
  vi.mocked(getDb).mockReturnValue(db);
  vi.mocked(revalidatePath).mockClear();
});
afterEach(() => db.$client.close());

function note(changes: Record<string, unknown> = {}) {
  return {
    uid: UID,
    title: 'Past modal verbs',
    folderId: null,
    tags: ['part4'],
    contentMarkdown: '## Must **have**\nAn example.',
    ...changes,
  };
}

describe('Server Actions Notebook', () => {
  it('valida las marcas y comunica los fallos sin exponer SQLite', async () => {
    expect(await saveStudyAnnotationAction({ noteId: 1, command: { kind: 'color', color: 'script' } }))
      .toMatchObject({ ok: false, code: 'VALIDATION' });
    const created = await createNoteAction(note({ contentMarkdown: 'Study.' }));
    if (!created.ok) throw new Error('No se creó el apunte');
    const input = { noteId: created.data.note.id, uid: UID, expectedRevision: 1,
      anchor: { start: 0, end: 5, exact: 'Study', prefix: '', suffix: '.\n' },
      command: { kind: 'highlight', enabled: true } };
    expect(await saveStudyAnnotationAction(input)).toMatchObject({ ok: true, data: [{ kind: 'highlight' }] });
    expect(await saveStudyAnnotationAction({ ...input, expectedRevision: 2 })).toMatchObject({ ok: false, code: 'CONFLICT' });
    db.$client.exec("CREATE TRIGGER study_failure BEFORE DELETE ON notebook_annotation BEGIN SELECT RAISE(ABORT, 'private database detail'); END");
    const failure = await saveStudyAnnotationAction({ ...input, command: { kind: 'clear' } });
    expect(failure).toMatchObject({ ok: false, code: 'PERSISTENCE' });
    expect(JSON.stringify(failure)).not.toContain('private database detail');
  });
  it('rechaza payloads manipulados antes de acceder a SQLite', async () => {
    const bad = await createNoteAction(note({ id: 55, uid: 'fake', title: ' ', tags: ['X', 'x'] }));
    expect(bad).toMatchObject({ ok: false, code: 'VALIDATION' });
    if (bad.ok) throw new Error('Se aceptó una entrada inválida');
    expect(bad.fieldErrors).toMatchObject({ uid: expect.any(Array), title: expect.any(Array) });
    expect((await createFolderAction({ name: 'Grammar', parentId: 0 })).ok).toBe(false);
    expect((await saveNoteAction({ ...note(), id: 1, expectedRevision: 0 })).ok).toBe(false);
    expect((await deleteNoteAction({ id: 1, uid: UID, expectedRevision: '1' })).ok).toBe(false);
    expect(db.$client.prepare('SELECT count(*) AS n FROM notebook_note').get()).toEqual({ n: 0 });
    expect(getDb).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('crea una vez por UID, lee por identidad y entrega índice con revisión', async () => {
    const created = await createNoteAction(note());
    expect(created).toMatchObject({ ok: true, data: { created: true, note: { uid: UID, revision: 1 } } });
    if (!created.ok) throw new Error('No se creó el apunte');
    const id = created.data.note.id;
    const retried = await createNoteAction(note({ title: 'Sin duplicar' }));
    expect(retried).toEqual({ ok: true, data: { created: false, note: created.data.note } });
    expect(await getNoteAction({ id, uid: UID })).toEqual({ ok: true, data: created.data.note });
    expect(await getNoteByUidAction({ uid: UID })).toEqual({ ok: true, data: created.data.note });
    expect((await getNoteByUidAction({ uid: 'invalid' })).ok).toBe(false);
    expect(await getNoteAction({ id, uid: 'd8766760-f8e8-4f34-b739-d07113f30d6c' }))
      .toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await getNoteOutlineAction({ id })).toEqual({
      ok: true,
      data: { revision: 1, headings: [{ depth: 2, text: 'Must have', slug: 'nb-must-have' }] },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('finaliza una revisión confirmada e invalida el listado y las URLs del lector', async () => {
    const created = await createNoteAction(note());
    if (!created.ok) throw new Error('No se creó el apunte');
    const original = created.data.note;
    const saved = await saveNoteAction({ ...note({ title: 'Nuevo título' }), id: original.id, expectedRevision: 1 });
    if (!saved.ok) throw new Error('No se guardó el apunte');
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(await finishEditingAction({
      id: original.id, uid: UID, expectedRevision: 1, previousTitle: original.title,
    })).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await finishEditingAction({
      id: original.id, uid: 'd8766760-f8e8-4f34-b739-d07113f30d6c',
      expectedRevision: 2,
    })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await finishEditingAction({ id: original.id, uid: UID, expectedRevision: '2' }))
      .toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(await finishEditingAction({
      id: original.id, uid: UID, expectedRevision: 2, previousTitle: original.title,
    })).toEqual({ ok: true, data: saved.data });
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ['/notebook'],
      [notebookNoteHref(saved.data)],
      [notebookNoteHref(original)],
    ]);
  });

  it('conserva la versión actual frente a escrituras y borrados obsoletos', async () => {
    const created = await createNoteAction(note());
    if (!created.ok) throw new Error('No se creó el apunte');
    const id = created.data.note.id;
    vi.mocked(revalidatePath).mockClear();
    const saved = await saveNoteAction({ ...note({ title: 'Updated' }), id, expectedRevision: 1 });
    expect(saved).toMatchObject({ ok: true, data: { title: 'Updated', revision: 2 } });
    expect(revalidatePath).not.toHaveBeenCalled();
    const stale = await saveNoteAction({ ...note({ title: 'Stale' }), id, expectedRevision: 1 });
    expect(stale).toMatchObject({ ok: false, code: 'CONFLICT', current: { title: 'Updated', revision: 2 } });
    const wrongUid = await saveNoteAction({
      ...note({ uid: 'd8766760-f8e8-4f34-b739-d07113f30d6c' }), id, expectedRevision: 2,
    });
    expect(wrongUid).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await deleteNoteAction({ id, uid: UID, expectedRevision: 1 }))
      .toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(getNotebookNote(db, id)).toMatchObject({ title: 'Updated', revision: 2 });
    expect(await deleteNoteAction({ id, uid: UID, expectedRevision: 2 }))
      .toEqual({ ok: true, data: { id } });
    expect(await deleteNoteAction({ id, uid: UID, expectedRevision: 2 }))
      .toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('valida y expone los vínculos con apartados sin aceptar metadatos del cliente', async () => {
    const created = await createNoteAction(note());
    if (!created.ok) throw new Error('No se creó el apunte');
    const sessionId = Number(db.$client.prepare(`INSERT INTO session
      (date, kind, paper, part, source, items_total, items_correct)
      VALUES ('2026-09-29', 'DRILL', 'RUOE', 4, 'LIBRO', 5, 4)`).run().lastInsertRowid);
    const errorId = Number(db.$client.prepare(`INSERT INTO error_row
      (session_id, prompt, correct_answer, cause, category, confidence, rule_note)
      VALUES (?, 'I must have...', 'must have', 'DESCONOCIMIENTO', 'ESTRUCTURA',
        'DUDABA', 'Usar modal perfecto para deducciones pasadas')`).run(sessionId).lastInsertRowid);
    const noteId = created.data.note.id;
    vi.mocked(revalidatePath).mockClear();
    expect(await setErrorNoteLinkAction({ errorId, noteId, headingSlug: 'nb-must-have', headingText: 'Falso' }))
      .toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await setErrorNoteLinkAction({ errorId, noteId, headingSlug: 'nb-inexistente' }))
      .toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await setErrorNoteLinkAction({ errorId: 9999, noteId, headingSlug: null }))
      .toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(revalidatePath).not.toHaveBeenCalled();
    const linked = await setErrorNoteLinkAction({ errorId, noteId, headingSlug: 'nb-must-have' });
    expect(linked).toMatchObject({ ok: true, data: { headingSlug: 'nb-must-have', headingText: 'Must have' } });
    expect(revalidatePath).toHaveBeenCalledWith(notebookNoteHref(created.data.note));
    expect(await getErrorNoteLinksAction({ errorId })).toMatchObject({
      ok: true, data: [{ headingStatus: 'valid', note: { id: noteId } }],
    });
    expect(await getNoteErrorLinksAction({ noteId, page: 1 })).toMatchObject({
      ok: true, data: { items: [{ error: { id: errorId }, headingStatus: 'valid' }], hasMore: false },
    });
    expect(await removeErrorNoteLinkAction({ errorId, noteId })).toMatchObject({
      ok: true, data: { errorId, noteId },
    });
    expect(await getErrorNoteLinksAction({ errorId })).toEqual({ ok: true, data: [] });
    expect(await removeErrorNoteLinkAction({ errorId, noteId })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('crea, mueve y borra carpetas solo cuando están vacías', async () => {
    const root = await createFolderAction({ name: ' Grammar ' });
    if (!root.ok) throw new Error('No se creó la carpeta');
    const child = await createFolderAction({ name: 'Modal verbs', parentId: root.data.id });
    if (!child.ok) throw new Error('No se creó la subcarpeta');
    expect(await createFolderAction({ name: 'Third', parentId: child.data.id }))
      .toMatchObject({ ok: false, code: 'INVALID_PARENT' });
    expect(await updateFolderAction({
      id: child.data.id, name: 'Past modals', parentId: root.data.id,
    })).toMatchObject({ ok: true, data: { name: 'Past modals' } });
    expect(await deleteFolderAction({ id: root.data.id }))
      .toMatchObject({ ok: false, code: 'FOLDER_NOT_EMPTY' });
    expect(await deleteFolderAction({ id: child.data.id }))
      .toEqual({ ok: true, data: { id: child.data.id } });
    expect(await deleteFolderAction({ id: root.data.id }))
      .toEqual({ ok: true, data: { id: root.data.id } });
  });

  it('busca de forma paginada y valida los filtros', async () => {
    expect((await searchNotesAction({ query: 'x', page: 0 })).ok).toBe(false);
    const created = await createNoteAction(note());
    if (!created.ok) throw new Error('No se creó el apunte');
    expect(await searchNotesAction({ query: 'must have', tag: 'PART4', page: 1 }))
      .toMatchObject({
        ok: true,
        data: { items: [{ id: created.data.note.id, title: 'Past modal verbs' }], hasMore: false },
      });
    expect(await searchNotesAction({ query: 'must have', tag: 'wrong', page: 1 }))
      .toMatchObject({ ok: true, data: { items: [] } });
  });

  it('no expone errores internos y revierte una escritura fallida', async () => {
    const created = await createNoteAction(note());
    if (!created.ok) throw new Error('No se creó el apunte');
    const id = created.data.note.id;
    db.$client.exec('DROP TABLE notebook_note_fts');
    const failed = await saveNoteAction({ ...note({ title: 'No persistido' }), id, expectedRevision: 1 });
    expect(failed).toEqual({
      ok: false, code: 'PERSISTENCE', message: 'No se pudo completar la operación. Inténtalo de nuevo.',
    });
    expect(getNotebookNote(db, id)).toEqual(created.data.note);
  });
});

describe('Importación de un .md', () => {
  const IMPORT_UID = '4b1f0c2e-8a57-4c1e-9d7e-2f6a3b5c8d90';
  const FILE = '---\ntitle: Modales\ntags: [part4]\nnotebook_uid: "9c8de1e3-03e6-42ec-a098-ac0db92331d0"\nautor: Ana\n---\n\n# Modales\n\nMust have.\n';

  function upload(text: string, name = 'modales.md'): FormData {
    const form = new FormData();
    form.set('file', new File([text], name, { type: 'text/markdown' }));
    return form;
  }

  async function preview(text = FILE) {
    const result = await previewMarkdownImportAction(upload(text));
    if (!result.ok) throw new Error(result.message);
    return result.data;
  }

  function confirmation(text = FILE, fields: Record<string, string | readonly string[]> = {}, hash?: string) {
    const form = upload(text);
    form.set('uid', IMPORT_UID);
    form.set('title', 'Modales en pasado');
    form.set('folderId', '');
    form.set('contentHash', hash ?? '');
    for (const [key, value] of Object.entries(fields)) {
      form.delete(key);
      for (const item of typeof value === 'string' ? [value] : value) form.append(key, item);
    }
    return form;
  }

  const noteCount = () => (db.$client.prepare('SELECT count(*) AS n FROM notebook_note').get() as { n: number }).n;

  it('la vista previa analiza sin escribir ni invalidar', async () => {
    const draft = await preview();
    expect(draft).toMatchObject({
      fileName: 'modales.md', title: 'Modales', titleSource: 'frontmatter', tags: ['part4'],
      contentMarkdown: '# Modales\n\nMust have.\n', unknownFields: ['autor'], ignoredFields: ['notebook_uid'],
    });
    expect(draft.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(noteCount()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rechaza entradas sin archivo, con otra extensión o demasiado grandes', async () => {
    expect(await previewMarkdownImportAction({ file: 'x' })).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await previewMarkdownImportAction(new FormData())).toMatchObject({
      ok: false, code: 'VALIDATION', fieldErrors: { file: [expect.stringMatching(/Elige un archivo/u)] },
    });
    expect(await previewMarkdownImportAction(upload('x', 'modales.txt'))).toMatchObject({ ok: false, code: 'VALIDATION' });
    const big = new FormData();
    big.set('file', new File([new Uint8Array(NOTEBOOK_IMPORT_MAX_FILE_BYTES + 1)], 'grande.md'));
    expect(await previewMarkdownImportAction(big)).toMatchObject({ ok: false, message: expect.stringMatching(/supera/u) });
  });

  it('crea un apunte nuevo con los metadatos confirmados y el UID de la importación', async () => {
    const { contentHash } = await preview();
    const result = await importMarkdownAction(confirmation(FILE, { tags: ['part4', 'Modales'] }, contentHash));
    if (!result.ok) throw new Error(result.message);
    expect(result.data.created).toBe(true);
    const saved = getNotebookNote(db, 1);
    expect(saved).toMatchObject({
      uid: IMPORT_UID, title: 'Modales en pasado', tags: ['part4', 'modales'], folderId: null,
      contentMarkdown: '# Modales\n\nMust have.\n', revision: 1,
    });
    expect(result.data.href).toBe(notebookNoteHref({ id: 1, title: 'Modales en pasado' }));
    expect(revalidatePath).toHaveBeenCalledWith('/notebook');
  });

  it('repetir la confirmación devuelve el mismo apunte en vez de duplicarlo', async () => {
    const { contentHash } = await preview();
    const first = await importMarkdownAction(confirmation(FILE, {}, contentHash));
    const retry = await importMarkdownAction(confirmation(FILE, {}, contentHash));
    expect(first).toMatchObject({ ok: true, data: { created: true } });
    expect(retry).toMatchObject({ ok: true, data: { created: false } });
    expect(first.ok && retry.ok && retry.data.href === first.data.href).toBe(true);
    expect(noteCount()).toBe(1);
  });

  it('vuelve a leer el archivo y no guarda si cambió desde la vista previa', async () => {
    const { contentHash } = await preview();
    const result = await importMarkdownAction(confirmation(FILE.replace('Must have.', 'Otro texto.'), {}, contentHash));
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION', message: expect.stringMatching(/cambió/u) });
    expect(noteCount()).toBe(0);
  });

  it('valida en servidor los metadatos confirmados', async () => {
    const { contentHash } = await preview();
    const bad = await importMarkdownAction(confirmation(FILE, { title: '  ', uid: 'no-es-uuid', tags: ['a', 'A'] }, contentHash));
    expect(bad).toMatchObject({ ok: false, code: 'VALIDATION' });
    if (bad.ok) throw new Error('Se aceptó una entrada inválida');
    expect(Object.keys(bad.fieldErrors ?? {})).toEqual(expect.arrayContaining(['uid', 'title', 'tags.1']));
    expect(await importMarkdownAction(confirmation(FILE, { folderId: '99' }, contentHash)))
      .toMatchObject({ ok: false, code: 'INVALID_PARENT' });
    expect(await importMarkdownAction(confirmation(FILE, { folderId: 'abc' }, contentHash)))
      .toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(noteCount()).toBe(0);
  });
});
