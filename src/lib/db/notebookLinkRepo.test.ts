import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { NotebookNote } from '../notebook/types';
import { createDb, type Db } from './client';
import { migrate } from './migrate';
import {
  getErrorNoteLinks, listNoteErrorLinks, removeErrorNoteLink, setErrorNoteLink,
} from './notebookLinkRepo';
import { createNotebookNote, deleteNotebookNote, getNotebookNote, saveNotebookNote } from './notebookRepo';

const NOW = '2026-09-29T10:00:00.000Z';
let db: Db;
let sessionId: number;

beforeEach(() => {
  db = createDb(':memory:');
  migrate(db);
  sessionId = Number(db.$client.prepare(`INSERT INTO session
    (date, kind, paper, part, source, items_total, items_correct)
    VALUES ('2026-09-29', 'DRILL', 'RUOE', 4, 'LIBRO', 5, 4)`).run().lastInsertRowid);
});
afterEach(() => db.$client.close());

function error(): number {
  return Number(db.$client.prepare(`INSERT INTO error_row
    (session_id, prompt, correct_answer, cause, category, confidence, rule_note)
    VALUES (?, 'I must have...', 'must have', 'DESCONOCIMIENTO', 'ESTRUCTURA',
      'DUDABA', 'Usar modal perfecto para deducciones pasadas')`)
    .run(sessionId).lastInsertRowid);
}

function note(markdown = '# Must have\n\n## Might have\n\nTexto'): NotebookNote {
  return createNotebookNote(db, {
    uid: randomUUID(), title: 'Past modal verbs', folderId: null, tags: [], contentMarkdown: markdown,
  }, NOW).note;
}

describe('vínculos entre errores y apuntes', () => {
  it('vincula un apartado validado, actualiza el par sin duplicarlo y permite desvincular', () => {
    const errorId = error();
    const saved = note();
    const first = setErrorNoteLink(db, { errorId, noteId: saved.id, headingSlug: 'nb-must-have' }, NOW);
    expect(first).toMatchObject({
      errorId, noteId: saved.id, headingSlug: 'nb-must-have', headingText: 'Must have', createdAt: NOW,
    });
    expect(getErrorNoteLinks(db, errorId)).toMatchObject([{
      link: first, note: { id: saved.id, title: saved.title }, headingStatus: 'valid',
    }]);
    const changed = setErrorNoteLink(db, { errorId, noteId: saved.id, headingSlug: 'nb-might-have' },
      '2026-09-29T11:00:00.000Z');
    expect(changed).toMatchObject({ headingSlug: 'nb-might-have', headingText: 'Might have', createdAt: NOW });
    expect(getErrorNoteLinks(db, errorId)).toHaveLength(1);
    const wholeNote = setErrorNoteLink(db, { errorId, noteId: saved.id, headingSlug: null }, NOW);
    expect(wholeNote).toMatchObject({ headingSlug: null, headingText: null, createdAt: NOW });
    expect(getErrorNoteLinks(db, errorId)[0]?.headingStatus).toBe('none');
    expect(removeErrorNoteLink(db, { errorId, noteId: saved.id })).toEqual(wholeNote);
    expect(getErrorNoteLinks(db, errorId)).toEqual([]);
    expect(getNotebookNote(db, saved.id)).toEqual(saved);
    expect(() => removeErrorNoteLink(db, { errorId, noteId: saved.id })).toThrow(/no encontrado/);
  });

  it('rechaza extremos y apartados inexistentes o ambiguos', () => {
    const errorId = error();
    const saved = note('## Must have\n\n```md\n# False heading\n```\n\n## must have');
    expect(() => setErrorNoteLink(db, { errorId: 9999, noteId: saved.id, headingSlug: null }, NOW))
      .toThrow(/no encontrado/);
    expect(() => setErrorNoteLink(db, { errorId, noteId: 9999, headingSlug: null }, NOW))
      .toThrow(/no encontrado/);
    expect(() => setErrorNoteLink(db, { errorId, noteId: saved.id, headingSlug: 'nb-false-heading' }, NOW))
      .toThrow(/ya no existe/);
    expect(() => setErrorNoteLink(db, { errorId, noteId: saved.id, headingSlug: 'nb-must-have' }, NOW))
      .toThrow(/inequívoco/);
    expect(getErrorNoteLinks(db, errorId)).toEqual([]);
  });

  it('conserva la relación si el apartado cambia, desaparece o se duplica', () => {
    const errorId = error();
    const initial = note();
    const link = setErrorNoteLink(db, { errorId, noteId: initial.id, headingSlug: 'nb-must-have' }, NOW);
    let saved = saveNotebookNote(db, {
      uid: initial.uid, id: initial.id, expectedRevision: 1, title: initial.title,
      folderId: null, tags: [], contentMarkdown: '## Renamed',
    }, NOW);
    expect(getErrorNoteLinks(db, errorId)[0]).toMatchObject({ link, headingStatus: 'changed' });
    saved = saveNotebookNote(db, {
      uid: saved.uid, id: saved.id, expectedRevision: 2, title: saved.title,
      folderId: null, tags: [], contentMarkdown: '## Must have\n\n## must have',
    }, NOW);
    expect(listNoteErrorLinks(db, saved.id, 1).items[0]).toMatchObject({ link, headingStatus: 'changed' });
    expect(() => setErrorNoteLink(db, { errorId, noteId: saved.id, headingSlug: 'nb-must-have' }, NOW))
      .toThrow(/inequívoco/);
    expect(getErrorNoteLinks(db, errorId)).toHaveLength(1);
  });

  it('pagina la consulta inversa y deja actuar las cascadas sin borrar el otro extremo', () => {
    const saved = note();
    const errors = [error(), error(), error()] as const;
    for (const errorId of errors) setErrorNoteLink(db, { errorId, noteId: saved.id, headingSlug: null }, NOW);
    const first = listNoteErrorLinks(db, saved.id, 1, 2);
    expect(first.items.map((item) => item.error.id)).toEqual([errors[2], errors[1]]);
    expect(first.hasMore).toBe(true);
    expect(listNoteErrorLinks(db, saved.id, 2, 2).items.map((item) => item.error.id)).toEqual([errors[0]]);
    expect(() => listNoteErrorLinks(db, saved.id, 0)).toThrow(/Página inválida/);
    db.$client.prepare('DELETE FROM error_row WHERE id = ?').run(errors[1]);
    expect(listNoteErrorLinks(db, saved.id, 1).items.map((item) => item.error.id))
      .toEqual([errors[2], errors[0]]);
    expect(getNotebookNote(db, saved.id)).not.toBeNull();
    deleteNotebookNote(db, { id: saved.id, uid: saved.uid, expectedRevision: 1 });
    expect(db.$client.prepare('SELECT * FROM notebook_error_link').all()).toEqual([]);
    expect(db.$client.prepare('SELECT count(*) AS n FROM error_row').get()).toEqual({ n: 2 });
    expect(() => listNoteErrorLinks(db, saved.id, 1)).toThrow(/no encontrado/);
    expect(() => setErrorNoteLink(db, { errorId: errors[0], noteId: saved.id, headingSlug: null }, NOW))
      .toThrow(/no encontrado/);
  });
});
