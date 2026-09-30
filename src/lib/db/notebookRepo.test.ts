import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db } from './client';
import { migrate } from './migrate';
import {
  createNotebookFolder,
  createNotebookNote,
  deleteNotebookFolder,
  deleteNotebookNote,
  getNotebookFolder,
  getNotebookNote,
  getNotebookNoteByUid,
  listNotebookFolders,
  listNotebookNotes,
  listRecentNotebookNotes,
  saveNotebookNote,
  updateNotebookFolder,
} from './notebookRepo';
import { notebookNote } from './schema';

const NOW = '2026-09-29T07:00:00.000Z';
const UID = '9c8de1e3-03e6-42ec-a098-ac0db92331d0';
let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrate(db);
});

function noteInput(changes: Record<string, unknown> = {}) {
  return {
    uid: UID,
    title: 'Past modal verbs',
    folderId: null,
    tags: ['part4'],
    contentMarkdown: '# Must have\nExample',
    ...changes,
  };
}

describe('repositorio de apuntes Notebook', () => {
  it('crea una vez por UID y devuelve la fila ya confirmada al reintentar', () => {
    const first = createNotebookNote(db, noteInput(), NOW);
    expect(first).toMatchObject({ created: true, note: { uid: UID, revision: 1 } });
    const retry = createNotebookNote(db, noteInput({ title: 'Cambio posterior' }), NOW);
    expect(retry).toEqual({ note: first.note, created: false });
    expect(getNotebookNote(db, first.note.id)).toEqual(first.note);
    expect(getNotebookNoteByUid(db, UID)).toEqual(first.note);
  });

  it('solo guarda la revisión y UID esperados', () => {
    const first = createNotebookNote(db, noteInput(), NOW).note;
    const saved = saveNotebookNote(db, {
      ...noteInput({ title: 'Updated' }), id: first.id, expectedRevision: 1,
    }, '2026-09-29T08:00:00.000Z');
    expect(saved).toMatchObject({
      id: first.id, uid: UID, title: 'Updated', revision: 2,
      updatedAt: '2026-09-29T08:00:00.000Z', createdAt: NOW,
    });
    expect(() => saveNotebookNote(db, {
      ...noteInput({ title: 'Stale' }), id: first.id, expectedRevision: 1,
    }, NOW)).toThrow(expect.objectContaining({ code: 'CONFLICT', current: saved }));
    expect(() => saveNotebookNote(db, {
      ...noteInput({ uid: 'd8766760-f8e8-4f34-b739-d07113f30d6c' }),
      id: first.id, expectedRevision: 2,
    }, NOW)).toThrow(expect.objectContaining({ code: 'CONFLICT', current: saved }));
    expect(getNotebookNote(db, first.id)).toEqual(saved);
  });

  it('rechaza carpeta inexistente sin escribir o cambiar la revisión', () => {
    expect(() => createNotebookNote(db, noteInput({ folderId: 999 }), NOW))
      .toThrow(expect.objectContaining({ code: 'INVALID_PARENT' }));
    const first = createNotebookNote(db, noteInput(), NOW).note;
    expect(() => saveNotebookNote(db, {
      ...noteInput({ folderId: 999 }), id: first.id, expectedRevision: 1,
    }, NOW)).toThrow(expect.objectContaining({ code: 'INVALID_PARENT' }));
    expect(getNotebookNote(db, first.id)).toEqual(first);
  });

  it('lista resúmenes paginados y recientes sin cargar el cuerpo', () => {
    const grammar = create('Grammar');
    createNotebookNote(db, noteInput({
      uid: 'd8766760-f8e8-4f34-b739-d07113f30d6a', folderId: grammar.id, title: 'B',
    }), NOW);
    createNotebookNote(db, noteInput({
      uid: 'd8766760-f8e8-4f34-b739-d07113f30d6b', folderId: grammar.id, title: 'A',
    }), NOW);
    createNotebookNote(db, noteInput({
      uid: 'd8766760-f8e8-4f34-b739-d07113f30d6c', folderId: grammar.id, title: 'C',
    }), NOW);
    expect(listNotebookNotes(db, grammar.id, 1, 2)).toMatchObject({
      items: [{ title: 'A' }, { title: 'B' }], hasMore: true,
    });
    expect(listNotebookNotes(db, grammar.id, 2, 2)).toMatchObject({
      items: [{ title: 'C' }], hasMore: false,
    });
    expect(listNotebookNotes(db, null, 1).items).toEqual([]);
    expect(listRecentNotebookNotes(db, 1)).toHaveLength(1);
    expect('contentMarkdown' in listRecentNotebookNotes(db, 1)[0]!).toBe(false);
  });

  it('borra solo con revisión vigente y distingue desaparición', () => {
    const first = createNotebookNote(db, noteInput(), NOW).note;
    const saved = saveNotebookNote(db, {
      ...noteInput(), id: first.id, expectedRevision: 1,
    }, NOW);
    expect(() => deleteNotebookNote(db, {
      id: first.id, uid: UID, expectedRevision: 1,
    })).toThrow(expect.objectContaining({ code: 'CONFLICT', current: saved }));
    deleteNotebookNote(db, { id: first.id, uid: UID, expectedRevision: 2 });
    expect(getNotebookNote(db, first.id)).toBeNull();
    expect(() => deleteNotebookNote(db, {
      id: first.id, uid: UID, expectedRevision: 2,
    })).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});
afterEach(() => db.$client.close());

function create(name: string, parentId: number | null = null) {
  return createNotebookFolder(db, { name, parentId }, NOW);
}

describe('repositorio de carpetas Notebook', () => {
  it('crea y lista carpetas con nombres normalizados', () => {
    const grammar = create(' Grammar ');
    const modal = create('Modal verbs', grammar.id);
    const vocabulary = create('Vocabulary');
    expect(grammar).toMatchObject({ name: 'Grammar', nameKey: 'grammar', parentId: null });
    expect(getNotebookFolder(db, modal.id)).toMatchObject({ name: 'Modal verbs', parentId: grammar.id });
    expect(listNotebookFolders(db).map((row) => row.id)).toEqual([
      grammar.id, vocabulary.id, modal.id,
    ]);
    expect(getNotebookFolder(db, 999)).toBeNull();
  });

  it('rechaza nombres equivalentes en el mismo nivel pero los permite en otro', () => {
    const grammar = create('Café');
    expect(() => create('Cafe\u0301')).toThrow(/Ya existe/);
    expect(() => create('Café', grammar.id)).not.toThrow();
  });

  it('rechaza padres inexistentes, tercer nivel y ciclos', () => {
    expect(() => create('Huérfana', 999)).toThrow(/padre/);
    const root = create('Grammar');
    const child = create('Modal verbs', root.id);
    expect(() => create('Third level', child.id)).toThrow(/padre/);
    expect(() => updateNotebookFolder(db, {
      id: root.id, name: root.name, parentId: child.id,
    }, NOW)).toThrow(/padre|subcarpetas/);
    expect(() => updateNotebookFolder(db, {
      id: child.id, name: child.name, parentId: child.id,
    }, NOW)).toThrow(/propio padre/);
    expect(getNotebookFolder(db, root.id)?.parentId).toBeNull();
  });

  it('renombra y mueve una hoja entre raíz y subcarpeta', () => {
    const grammar = create('Grammar');
    const child = create('Modal verbs');
    const moved = updateNotebookFolder(db, {
      id: child.id, name: ' Modal deduction ', parentId: grammar.id,
    }, '2026-09-29T08:00:00.000Z');
    expect(moved).toMatchObject({
      name: 'Modal deduction', nameKey: 'modal deduction', parentId: grammar.id,
      updatedAt: '2026-09-29T08:00:00.000Z', createdAt: NOW,
    });
    expect(updateNotebookFolder(db, {
      id: child.id, name: 'Modal deduction', parentId: null,
    }, NOW).parentId).toBeNull();
    expect(() => updateNotebookFolder(db, {
      id: 999, name: 'Missing', parentId: null,
    }, NOW)).toThrow(/no encontrada/);
  });

  it('no borra carpetas con subcarpetas o apuntes', () => {
    const root = create('Grammar');
    const child = create('Modal verbs', root.id);
    expect(() => deleteNotebookFolder(db, root.id)).toThrow(/contiene/);
    db.insert(notebookNote).values({
      uid: '9c8de1e3-03e6-42ec-a098-ac0db92331d0',
      folderId: child.id,
      title: 'Past modal verbs',
      contentMarkdown: '',
      tags: [],
      createdAt: NOW,
      updatedAt: NOW,
    }).run();
    expect(() => deleteNotebookFolder(db, child.id)).toThrow(/contiene/);
    db.delete(notebookNote).run();
    deleteNotebookFolder(db, child.id);
    deleteNotebookFolder(db, root.id);
    expect(listNotebookFolders(db)).toEqual([]);
    expect(() => deleteNotebookFolder(db, root.id)).toThrow(/no encontrada/);
  });
});
