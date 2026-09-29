import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db } from './client';
import { migrate } from './migrate';
import { createNotebookNote, deleteNotebookNote, getNotebookNote, saveNotebookNote } from './notebookRepo';
import { rebuildNotebookSearch } from './notebookSearch';

const NOW = '2026-09-29T07:00:00.000Z';
const UID = '9c8de1e3-03e6-42ec-a098-ac0db92331d0';
let db: Db;

beforeEach(() => {
  db = createDb(':memory:');
  migrate(db);
});
afterEach(() => db.$client.close());

function input(markdown = 'Must **have** happened') {
  return {
    uid: UID,
    title: 'Deducción pasada',
    folderId: null,
    tags: ['Part4'],
    contentMarkdown: markdown,
  };
}

function indexed(id: number) {
  return db.$client.prepare('SELECT title, body, tags FROM notebook_note_fts WHERE rowid = ?').get(id);
}

describe('índice de búsqueda Notebook', () => {
  it('indexa texto visible, título y tags normalizados al crear', () => {
    const note = createNotebookNote(db, input(), NOW).note;
    expect(indexed(note.id)).toEqual({
      title: 'deduccion pasada', body: 'must have happened', tags: 'part4',
    });
    expect(db.$client.prepare(`SELECT rowid FROM notebook_note_fts
      WHERE notebook_note_fts MATCH '"must have"'`).all())
      .toEqual([{ rowid: note.id }]);
  });

  it('actualiza el índice con la revisión y lo elimina al borrar', () => {
    const first = createNotebookNote(db, input(), NOW).note;
    const saved = saveNotebookNote(db, {
      ...input('Might **have** happened'), id: first.id, expectedRevision: 1,
      title: 'Otra deducción', tags: ['GRAMMAR'],
    }, NOW);
    expect(indexed(first.id)).toEqual({
      title: 'otra deduccion', body: 'might have happened', tags: 'grammar',
    });
    expect(db.$client.prepare(`SELECT rowid FROM notebook_note_fts
      WHERE notebook_note_fts MATCH '"must have"'`).all()).toEqual([]);
    deleteNotebookNote(db, { id: first.id, uid: UID, expectedRevision: saved.revision });
    expect(indexed(first.id)).toBeUndefined();
  });

  it('revierte el guardado si falla la escritura del índice', () => {
    const first = createNotebookNote(db, input(), NOW).note;
    db.$client.exec('DROP TABLE notebook_note_fts');
    expect(() => saveNotebookNote(db, {
      ...input('Texto nuevo'), id: first.id, expectedRevision: 1,
    }, NOW)).toThrow();
    expect(getNotebookNote(db, first.id)).toEqual(first);
  });

  it('reconstruye el índice desde las notas y revierte todo ante datos inválidos', () => {
    const first = createNotebookNote(db, input(), NOW).note;
    const second = createNotebookNote(db, {
      ...input('Can’t have'), uid: 'd8766760-f8e8-4f34-b739-d07113f30d6c',
    }, NOW).note;
    db.$client.prepare('DELETE FROM notebook_note_fts WHERE rowid = ?').run(first.id);
    expect(rebuildNotebookSearch(db)).toBe(2);
    expect(indexed(first.id)).toMatchObject({ body: 'must have happened' });
    db.$client.prepare('UPDATE notebook_note SET tags = ? WHERE id = ?').run('[1]', second.id);
    const snapshot = db.$client.prepare('SELECT rowid, title, body, tags FROM notebook_note_fts ORDER BY rowid').all();
    expect(() => rebuildNotebookSearch(db)).toThrow(/Etiquetas inválidas/);
    expect(db.$client.prepare('SELECT rowid, title, body, tags FROM notebook_note_fts ORDER BY rowid').all())
      .toEqual(snapshot);
  });
});
