import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { studyAnchor, type StudyCommand } from '../notebook/annotations';
import { notebookStudyText } from '../notebook/studyMarkdown';
import type { NotebookNote } from '../notebook/types';
import { createDb, type Db } from './client';
import { migrate } from './migrate';
import { createNotebookNote, deleteNotebookNote, getNotebookNote, listNotebookAnnotations, saveNotebookAnnotation, saveNotebookNote } from './notebookRepo';
import { notebookJsonChunks, notebookZipEntries } from './notebookExport';

let db: Db;
let note: NotebookNote;
const at = '2026-09-30T12:00:00.000Z';
beforeEach(() => {
  db = createDb(':memory:');
  migrate(db);
  note = createNotebookNote(db, { uid: randomUUID(), title: 'Study', folderId: null, tags: [],
    contentMarkdown: '# Heading\n\nOne **important concept** here.\n\n`code`' }, at).note;
});
afterEach(() => { db.$client.close(); });

function mark(quote: string, command: StudyCommand = { kind: 'highlight', enabled: true }) {
  const text = notebookStudyText(note.contentMarkdown);
  const start = text.indexOf(quote);
  return saveNotebookAnnotation(db, { noteId: note.id, uid: note.uid, expectedRevision: note.revision,
    anchor: studyAnchor(text, start, start + quote.length), command }, at);
}
function edit(contentMarkdown: string) {
  note = saveNotebookNote(db, { id: note.id, uid: note.uid, title: note.title, folderId: note.folderId,
    tags: [...note.tags], expectedRevision: note.revision, contentMarkdown }, at);
}

describe('persistencia de marcas', () => {
  it('guarda, combina y elimina formato sin modificar el Markdown ni su revisión', () => {
    mark('important concept');
    mark('concept', { kind: 'color', color: 'blue' });
    expect(listNotebookAnnotations(db, note.id)).toHaveLength(2);
    expect(getNotebookNote(db, note.id)).toEqual(note);
    mark('important', { kind: 'clear' });
    expect(listNotebookAnnotations(db, note.id).map((item) => item.anchor.exact).sort()).toEqual([' concept', 'concept']);
    deleteNotebookNote(db, { id: note.id, uid: note.uid, expectedRevision: note.revision });
    expect(listNotebookAnnotations(db, note.id)).toEqual([]);
  });

  it('recoloca al insertar texto; conserva como huérfana una marca cuyo texto desaparece', () => {
    const before = mark('important concept')[0]!;
    edit(`Introduction.\n\n${note.contentMarkdown}`);
    const withIntroduction = note.contentMarkdown;
    expect(listNotebookAnnotations(db, note.id)[0]).toMatchObject({ orphaned: false, anchor: { start: before.anchor.start + 14 } });
    edit('# Heading\n\nOne changed phrase here.');
    expect(listNotebookAnnotations(db, note.id)[0]).toMatchObject({ id: before.id, orphaned: true });
    edit(withIntroduction);
    expect(listNotebookAnnotations(db, note.id)[0]?.orphaned).toBe(false);
  });

  it('rechaza revisión antigua, UID ajeno, código, rangos incorrectos y citas manipuladas sin escribir', () => {
    const text = notebookStudyText(note.contentMarkdown);
    const input = { noteId: note.id, uid: note.uid, expectedRevision: 1,
      anchor: studyAnchor(text, 0, 7), command: { kind: 'highlight', enabled: true } as const };
    expect(() => saveNotebookAnnotation(db, { ...input, expectedRevision: 2 }, at)).toThrow(/Recarga/);
    expect(() => saveNotebookAnnotation(db, { ...input, uid: randomUUID() }, at)).toThrow(/eliminado/);
    expect(() => saveNotebookAnnotation(db, { ...input, anchor: { ...input.anchor, exact: 'fake' } }, at)).toThrow(/Selecciona/);
    expect(() => mark('\uFFFC')).toThrow(/Selecciona/);
    expect(() => saveNotebookAnnotation(db, { ...input, anchor: { ...input.anchor, end: 999999 } }, at)).toThrow(/Selecciona/);
    expect(listNotebookAnnotations(db, note.id)).toEqual([]);
  });

  it('exporta marcas en JSON y conserva Markdown/ZIP sin marcas', () => {
    const marks = mark('important concept');
    const dump = JSON.parse([...notebookJsonChunks(db)].join('')) as { annotations: unknown[] };
    expect(dump.annotations).toEqual(marks);
    const entry = notebookZipEntries(db, new Date(at)).find((item) => item.kind === 'note');
    const markdown = entry?.kind === 'note' ? entry.read() : '';
    expect(markdown).toContain(note.contentMarkdown);
    expect(markdown).not.toContain('<mark');
    migrate(db);
    expect(listNotebookAnnotations(db, note.id)).toEqual(marks);
  });
});
