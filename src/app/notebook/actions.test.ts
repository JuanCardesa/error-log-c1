import { revalidatePath } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb, getDb, type Db } from '@/lib/db/client';
import type * as DbClient from '@/lib/db/client';
import { migrate } from '@/lib/db/migrate';
import { getNotebookNote } from '@/lib/db/notebookRepo';
import {
  createFolderAction,
  createNoteAction,
  deleteFolderAction,
  deleteNoteAction,
  getNoteAction,
  getNoteOutlineAction,
  saveNoteAction,
  searchNotesAction,
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
    expect(await getNoteAction({ id, uid: 'd8766760-f8e8-4f34-b739-d07113f30d6c' }))
      .toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await getNoteOutlineAction({ id })).toEqual({
      ok: true,
      data: { revision: 1, headings: [{ depth: 2, text: 'Must have', slug: 'nb-must-have' }] },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/notebook');
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
