import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { createDb } from './client';
import { prepareDemo } from './demo';
import { loadDataset } from './load';
import { getErrorNoteLinks } from './notebookLinkRepo';
import { searchNotebookNotes } from './notebookSearch';
import { errorRow, notebookFolder, notebookNote, session } from './schema';
import { seedIfEmpty } from './seedSafe';

it('abre demos independientes y conserva intacta la anterior', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'errorlog-demo-'));
  const first = createDb(prepareDemo(scratch, new Date('2026-09-16T12:00:00Z')));
  try {
    first.update(session).set({ sourceRef: 'edicion en mi demo' }).run();
    const before = loadDataset(first);
    const notesBefore = first.select().from(notebookNote).all();
    const second = createDb(prepareDemo(scratch, new Date('2026-09-16T12:00:00Z')));
    try {
      expect(second.$client.name).not.toBe(first.$client.name);
      expect(loadDataset(second).sessions.length).toBeGreaterThan(0);
      expect(loadDataset(second)).not.toEqual(before);
      expect(loadDataset(first)).toEqual(before);
      expect(first.select().from(notebookNote).all()).toEqual(notesBefore);
    } finally { second.$client.close(); }
  } finally {
    first.$client.close();
    rmSync(scratch, { recursive: true, force: true });
  }
});

it('prepara un cuaderno buscable con carpetas y vínculos a los errores de ejemplo', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'errorlog-demo-notebook-'));
  const db = createDb(prepareDemo(scratch, new Date('2026-09-16T12:00:00Z')));
  try {
    expect(db.select().from(notebookFolder).all()).toHaveLength(4);
    expect(db.select().from(notebookNote).all()).toHaveLength(8);
    const results = searchNotebookNotes(db, {
      query: 'preposición conservada', folderId: null, tag: null, page: 1,
    });
    expect(results.items.map((note) => note.title)).toContain('Oraciones enfáticas con it');
    const error = db.select({ id: errorRow.id, prompt: errorRow.prompt }).from(errorRow).all()
      .find((row) => row.prompt === 'I only recognised him because of his voice. (WAS)');
    expect(error).toBeDefined();
    const links = getErrorNoteLinks(db, error!.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.link.headingSlug).toBe('nb-preposición-conservada');
    expect(links[0]?.headingStatus).toBe('valid');
    expect(() => seedIfEmpty(db, new Date('2026-09-16T12:00:00Z'))).toThrow('ya contiene datos');
  } finally {
    db.$client.close();
    rmSync(scratch, { recursive: true, force: true });
  }
});

it('prepara la demo sin abrir la ruta de base personal configurada', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'errorlog-demo-isolation-'));
  const personal = join(scratch, 'personal.db');
  const sentinel = 'base personal sin modificar';
  writeFileSync(personal, sentinel);
  const previous = process.env['DB_FILE_OVERRIDE'];
  process.env['DB_FILE_OVERRIDE'] = personal;
  try {
    expect(prepareDemo(join(scratch, 'demo'), new Date('2026-09-16T12:00:00Z')))
      .not.toBe(personal);
    expect(readFileSync(personal, 'utf8')).toBe(sentinel);
  } finally {
    if (previous === undefined) delete process.env['DB_FILE_OVERRIDE'];
    else process.env['DB_FILE_OVERRIDE'] = previous;
    rmSync(scratch, { recursive: true, force: true });
  }
});
