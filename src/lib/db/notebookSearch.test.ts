import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db } from './client';
import { migrate } from './migrate';
import {
  createNotebookFolder, createNotebookNote, deleteNotebookNote, getNotebookNote, saveNotebookNote,
} from './notebookRepo';
import { rebuildNotebookSearch, searchNotebookHits, searchNotebookNotes } from './notebookSearch';

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

function search(query: string, changes: { folderId?: number | null; tag?: string | null; page?: number } = {}) {
  return searchNotebookNotes(db, { query, folderId: null, tag: null, page: 1, ...changes });
}

function addNote(n: number, title: string, contentMarkdown: string, tags: string[] = [], folderId: number | null = null) {
  return createNotebookNote(db, {
    uid: `9c8de1e3-03e6-42ec-a098-${String(n).padStart(12, '0')}`,
    title, contentMarkdown, tags, folderId,
  }, NOW).note;
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

describe('consulta paginada Notebook', () => {
  it('prioriza título exacto, título parcial, tag y cuerpo', () => {
    const body = addNote(1, 'Deducciones', 'Must **have** happened');
    const tagged = addNote(2, 'Grammar', 'Otro texto', ['must have']);
    const partial = addNote(3, 'Must have happened', 'Otro texto');
    const exact = addNote(4, 'Must have', 'Otro texto');
    expect(search('must have').items.map((row) => row.id))
      .toEqual([exact.id, partial.id, tagged.id, body.id]);
  });

  it('resuelve consultas cortas, acentos, comillas, porcentajes y apóstrofos', () => {
    const note = addNote(1, 'Deducción', 'Can’t have: 50%_value y "must have"');
    for (const query of ['de', 'deduccion', "can't have", '50%_', '"must have"']) {
      expect(search(query).items.map((row) => row.id), query).toEqual([note.id]);
    }
    expect(search('no existe').items).toEqual([]);
  });

  it('filtra por carpeta raíz con subcarpetas y por etiqueta exacta', () => {
    const root = createNotebookFolder(db, { name: 'Grammar', parentId: null }, NOW);
    const child = createNotebookFolder(db, { name: 'Modals', parentId: root.id }, NOW);
    const elsewhere = createNotebookFolder(db, { name: 'Vocabulary', parentId: null }, NOW);
    const rootNote = addNote(1, 'Root note', 'Must have', ['part4'], root.id);
    const childNote = addNote(2, 'Child note', 'Must have', ['part4'], child.id);
    addNote(3, 'Wrong tag', 'Must have', ['part2'], child.id);
    addNote(4, 'Elsewhere', 'Must have', ['part4'], elsewhere.id);
    expect(search('must have', { folderId: root.id, tag: 'PART4' }).items.map((row) => row.id))
      .toEqual([childNote.id, rootNote.id]);
    expect(search('must have', { folderId: child.id, tag: 'part4' }).items.map((row) => row.id))
      .toEqual([childNote.id]);
    expect(search('', { folderId: 999 }).items).toEqual([]);
  });

  it('filtra también la agrupación virtual Sin carpeta', () => {
    const folder = createNotebookFolder(db, { name: 'Grammar', parentId: null }, NOW);
    const unfiled = addNote(1, 'Libre', 'Must have');
    addNote(2, 'En carpeta', 'Must have', [], folder.id);
    expect(searchNotebookNotes(db, {
      query: 'must have', folderId: null, unfiledOnly: true, tag: null, page: 1,
    }).items.map((note) => note.id)).toEqual([unfiled.id]);
  });

  it('enriquece solo la página visible con fragmento y apartado del cuerpo', () => {
    const body = addNote(1, 'Grammar', [
      '## Regla',
      'Otro texto.',
      '',
      '## Regla',
      'La deducción usa must **have**.',
    ].join('\n'));
    const title = addNote(2, 'Must have', 'Texto distinto');
    const tagged = addNote(3, 'Otro', 'Texto distinto', ['must have']);
    const page = searchNotebookHits(db, { query: 'must have', folderId: null, tag: null, page: 1 });
    expect(page.items.map((hit) => hit.note.id)).toEqual([title.id, tagged.id, body.id]);
    expect(page.items.map((hit) => hit.matchedIn)).toEqual(['title', 'tag', 'body']);
    expect(page.items[0]?.excerpt).toBeNull();
    expect(page.items[1]?.excerpt).toBeNull();
    expect(page.items[2]?.excerpt?.heading?.slug).toBe('nb-regla-1');
    const excerpt = page.items[2]?.excerpt;
    expect(excerpt?.text.slice(excerpt.match.start, excerpt.match.end)).toBe('must have');
  });

  it('devuelve 20 filas y una señal de página siguiente', () => {
    for (let i = 1; i <= 21; i += 1) addNote(i, `Note ${String(i)}`, 'Must have');
    expect(search('must have')).toMatchObject({ hasMore: true });
    expect(search('must have').items).toHaveLength(20);
    expect(search('must have', { page: 2 })).toMatchObject({ hasMore: false });
    expect(search('must have', { page: 2 }).items).toHaveLength(1);
    expect(search('must have', { page: Number.MAX_SAFE_INTEGER }).items).toEqual([]);
  });
});
